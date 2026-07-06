"""FDA GRAS notice PDF extraction pipeline.

Phase 1 — inventory scrape (free, one HTTP request to FDA Show-All URL):
  Saves GRN/substance/status/date_closed to data/inventory.json.

Phase 2 — PDF text extraction + chunking:
  Extracts and chunks all PDFs, rebuilds data/chunks.jsonl.

Phase 3 — Anthropic Batch API (Haiku + prompt caching):
  Extracts semantic fields only for PDFs missing a JSON sidecar.
  Saves batch ID to data/extract_batch_id.txt for resumability.

Phase 4 — Write outputs:
  Per-notice JSON sidecars alongside each PDF.

Backward-compatible exports for analyze.py:
  extract_text, chunk_text, detect_section, SECTION_PATTERNS
"""

import json
import os
import re
import sys
import time
from pathlib import Path

import anthropic
import pdfplumber
import requests
import tiktoken
from bs4 import BeautifulSoup
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).parent.parent))
from constants.enums import (
    DIETARY_EXPOSURE_METHOD,
    FOOD_CATEGORIES,
    GRAS_BASIS,
    PRODUCTION_METHOD,
    SAFETY_DATA,
    SOURCE_ORGANISM_TYPE,
    SUBSTANCE_TYPE,
    TARGET_POPULATION,
)

load_dotenv()

NOTICES_DIRS = [
    (Path("data/notices/approved"),  "no_questions"),
    (Path("data/notices/withdrawn"), "withdrawn"),
    (Path("data/notices/pending"),   "pending"),
]
CHUNKS_FILE       = Path("data/chunks.jsonl")
INVENTORY_FILE    = Path("data/inventory.json")
BATCH_STATE_FILE  = Path("data/extract_batch_id.txt")
GRAS_URL_TEMPLATE = "https://www.fda.gov/food/generally-recognized-safe-gras/gras-notice-inventory#grn{grn:04d}"

CHUNK_MIN        = 500
CHUNK_MAX        = 800
MAX_EXTRACT_PAGES = 500


# ── Section detection (also used by analyze.py) ───────────────────────────────

SECTION_PATTERNS = [
    (re.compile(r"(?i)part\s*1[^\d].*(identity|description)"),      "part_1_identity"),
    (re.compile(r"(?i)part\s*2[^\d].*(intended\s*use)"),            "part_2_intended_use"),
    (re.compile(r"(?i)part\s*3[^\d].*(gras\s*(basis|determination))"), "part_3_gras_basis"),
    (re.compile(r"(?i)part\s*4[^\d].*(safety)"),                    "part_4_safety"),
    (re.compile(r"(?i)part\s*5[^\d].*(dietary\s*exposure)"),        "part_5_dietary_exposure"),
    (re.compile(r"(?i)part\s*6[^\d].*(narrative)"),                 "part_6_narrative"),
    (re.compile(r"(?i)part\s*7[^\d].*(reference)"),                 "part_7_references"),
    (re.compile(r"(?i)cover\s*letter"),                             "cover_letter"),
    (re.compile(r"(?i)appendix"),                                   "appendix"),
]


def detect_section(line: str) -> str | None:
    for pattern, label in SECTION_PATTERNS:
        if pattern.search(line):
            return label
    return None


# ── Text extraction (also used by analyze.py) ─────────────────────────────────

def extract_text(pdf_path: Path, max_pages: int = MAX_EXTRACT_PAGES,
                 return_stats: bool = False):
    """Extract text from a PDF.

    If return_stats=True, returns (text, skipped_pages) where skipped_pages
    is the count of pages that yielded no text (scanned/image pages).
    """
    pages = []
    skipped = 0
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages[:max_pages]:
            text = page.extract_text()
            if text:
                pages.append(text)
            else:
                skipped += 1
    result = "\n".join(pages)
    return (result, skipped) if return_stats else result


# ── Chunking (also used by analyze.py indirectly via chunks.jsonl) ────────────

def chunk_text(text: str, grn_number: int, pdf_path: Path) -> list[dict]:
    enc = tiktoken.get_encoding("cl100k_base")
    chunks: list[dict] = []
    current_section = "cover_letter"
    current_tokens: list[int] = []

    def flush(section: str, tokens: list[int]) -> None:
        if not tokens:
            return
        while len(tokens) > CHUNK_MAX:
            chunks.append({
                "grn_number": grn_number, "section": section,
                "text": enc.decode(tokens[:CHUNK_MAX]), "token_count": CHUNK_MAX,
                "source_pdf": str(pdf_path),
            })
            tokens = tokens[CHUNK_MAX:]
        if len(tokens) >= CHUNK_MIN:
            chunks.append({
                "grn_number": grn_number, "section": section,
                "text": enc.decode(tokens), "token_count": len(tokens),
                "source_pdf": str(pdf_path),
            })
        elif chunks:
            merged = enc.encode(chunks[-1]["text"]) + tokens
            chunks[-1]["text"] = enc.decode(merged)
            chunks[-1]["token_count"] = len(merged)
        else:
            chunks.append({
                "grn_number": grn_number, "section": section,
                "text": enc.decode(tokens), "token_count": len(tokens),
                "source_pdf": str(pdf_path),
            })

    for line in text.splitlines():
        new_section = detect_section(line)
        if new_section and new_section != current_section:
            flush(current_section, current_tokens)
            current_section = new_section
            current_tokens = []
        current_tokens.extend(enc.encode(line + "\n"))
        if len(current_tokens) >= CHUNK_MAX:
            flush(current_section, current_tokens)
            current_tokens = []

    flush(current_section, current_tokens)
    return chunks


# ── Phase 1: FDA inventory scrape ─────────────────────────────────────────────

_FDA_URL    = "https://www.hfpappexternal.fda.gov/scripts/fdcc/index.cfm"
_FDA_PARAMS = {"set": "GRASNotices", "sort": "GRN_No", "order": "ASC",
               "showAll": "true", "type": "basic", "search": ""}


def scrape_inventory() -> dict[int, dict]:
    """Return {grn: {substance, status, date_closed}}, loading cache if available."""
    if INVENTORY_FILE.exists():
        print(f"  Using cached inventory ({INVENTORY_FILE})")
        return {int(k): v for k, v in json.loads(INVENTORY_FILE.read_text()).items()}

    print("  Scraping FDA inventory (one request)...")
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    resp = requests.get(_FDA_URL, params=_FDA_PARAMS, headers=headers, timeout=60)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    table = next(
        (t for t in soup.find_all("table")
         if t.find("a", href=re.compile(r"set=GRASNotices&id=", re.I))),
        None
    )
    if not table:
        raise RuntimeError("Could not find inventory table in FDA response")

    inventory: dict[int, dict] = {}
    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 2:
            continue
        cells = [td.get_text(" ", strip=True) for td in tds]
        m = re.match(r"^(\d+)", cells[0].strip())
        if not m:
            continue
        grn = int(m.group(1))
        fda_letter = cells[3].strip().lower() if len(cells) > 3 else ""
        if not fda_letter or "pending" in fda_letter:
            status = "pending"
        elif "no question" in fda_letter or re.search(
            r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b", fda_letter
        ):
            status = "no_questions"
        elif "withdraw" in fda_letter or "ceased" in fda_letter:
            status = "withdrawn"
        else:
            status = "pending"
        inventory[grn] = {
            "substance": cells[1] if len(cells) > 1 else "",
            "status":    status,
            "date_closed": cells[2].strip() if len(cells) > 2 else "",
        }

    INVENTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    INVENTORY_FILE.write_text(json.dumps({str(k): v for k, v in inventory.items()}, indent=2))
    print(f"  Saved {len(inventory)} notices to {INVENTORY_FILE}")
    return inventory


# ── Phase 3: Batch semantic extraction ───────────────────────────────────────

_SYSTEM_PROMPT = f"""You extract structured metadata from FDA GRAS notices. Return only valid JSON.

Allowed enum values:
  substance_type: {SUBSTANCE_TYPE}
  production_method: {PRODUCTION_METHOD}
  source_organism_type: {SOURCE_ORGANISM_TYPE}
  food_categories: {FOOD_CATEGORIES}
  target_population: {TARGET_POPULATION}
  gras_basis: {GRAS_BASIS}
  safety_data: {SAFETY_DATA}
  dietary_exposure_method: {DIETARY_EXPOSURE_METHOD}"""

_USER_PREFIX = """Extract semantic metadata from this FDA GRAS notice. Return ONLY this JSON (use null if uncertain):
{
  "substance_type": <substance_type enum>,
  "production_method": <production_method enum>,
  "source_organism_type": <source_organism_type enum>,
  "intended_uses": [<food_categories enum values>],
  "target_population": <target_population enum>,
  "gras_basis": <gras_basis enum>,
  "safety_data_available": [<safety_data enum values>],
  "dietary_exposure_method": <dietary_exposure_method enum>,
  "exposure_estimate_included": <boolean>,
  "allergenicity_addressed": <boolean>
}

Notice text (first 8000 chars):
"""


def _build_batch_requests(pdf_texts: dict[int, str]) -> list[dict]:
    return [
        {
            "custom_id": f"grn-{grn:04d}",
            "params": {
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 512,
                "system": [{"type": "text", "text": _SYSTEM_PROMPT,
                             "cache_control": {"type": "ephemeral"}}],
                "messages": [{"role": "user", "content": _USER_PREFIX + text[:8000]}],
            },
        }
        for grn, text in pdf_texts.items()
    ]


def _submit_and_collect(
    client: anthropic.Anthropic,
    batch_requests: list[dict],
    batch_id: str | None = None,
) -> dict[int, dict]:
    """Submit (or resume) a batch and poll to completion. Returns {grn: semantic_fields}."""
    if not batch_id:
        print(f"  Submitting {len(batch_requests)} requests to Anthropic Batch API...")
        batch = client.messages.batches.create(requests=batch_requests)
        batch_id = batch.id
        BATCH_STATE_FILE.write_text(batch_id)
        print(f"  Batch ID: {batch_id}  (saved to {BATCH_STATE_FILE} for resumability)")
    else:
        print(f"  Resuming batch {batch_id}...")

    print("  Polling every 30s...")
    while True:
        batch = client.messages.batches.retrieve(batch_id)
        c = batch.request_counts
        print(f"  [{batch.processing_status}] processing={c.processing} "
              f"succeeded={c.succeeded} errored={c.errored}", end="\r")
        if batch.processing_status == "ended":
            print()
            break
        time.sleep(30)

    results: dict[int, dict] = {}
    errors = 0
    for result in client.messages.batches.results(batch_id):
        m = re.match(r"grn-(\d+)", result.custom_id)
        if not m:
            continue
        grn = int(m.group(1))
        if result.result.type == "succeeded":
            try:
                raw = result.result.message.content[0].text.strip()
                raw = re.sub(r"^```(?:json)?\s*", "", raw)
                raw = re.sub(r"\s*```$", "", raw)
                # Isolate the first JSON object in case the model appended extra text
                m = re.search(r"\{.*\}", raw, re.DOTALL)
                if m:
                    raw = m.group(0)
                results[grn] = json.loads(raw)
            except Exception as exc:
                print(f"  Parse error GRN-{grn:04d}: {exc}")
                errors += 1
        else:
            errors += 1

    print(f"  Batch complete: {len(results)} succeeded, {errors} errors")
    BATCH_STATE_FILE.unlink(missing_ok=True)
    return results


# ── Single-file extraction (kept for --test and backward compat) ──────────────

def extract_with_claude(text: str, grn_number: int, status: str, pdf_url: str) -> dict:
    """Single synchronous extraction via Haiku (used in --test mode)."""
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": _USER_PREFIX + text[:8000]}],
    )
    raw = re.sub(r"^```(?:json)?\s*", "", msg.content[0].text.strip())
    raw = re.sub(r"\s*```$", "", raw)
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if m:
        raw = m.group(0)
    data = json.loads(raw)
    data.update({"grn_number": grn_number, "status": status, "source_pdf_url": pdf_url})
    return data


# ── Helpers ───────────────────────────────────────────────────────────────────

def grn_from_filename(name: str) -> int:
    m = re.search(r"(\d+)", name)
    return int(m.group(1)) if m else 0


# ── Main pipeline ─────────────────────────────────────────────────────────────

def run(test_one: bool = False, collect_batch_id: str | None = None) -> None:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    # ── Phase 1: inventory ────────────────────────────────────────────────────
    print("=== Phase 1: FDA inventory ===")
    inventory = scrape_inventory()

    # ── Phase 2: scan all PDFs ────────────────────────────────────────────────
    print("\n=== Phase 2: Text extraction + chunking ===")
    all_chunks:       list[dict]               = []
    needs_extraction: dict[int, tuple]         = {}  # grn -> (text, base_meta, json_path)
    skipped = 0

    for notices_dir, default_status in NOTICES_DIRS:
        if not notices_dir.exists():
            continue
        pdfs = sorted(notices_dir.glob("*.pdf"))
        if test_one:
            pdfs = pdfs[:1]

        for pdf_path in pdfs:
            grn       = grn_from_filename(pdf_path.stem)
            json_path = pdf_path.with_suffix(".json")
            inv       = inventory.get(grn, {})
            status    = inv.get("status", default_status)

            try:
                text   = extract_text(pdf_path)
                chunks = chunk_text(text, grn, pdf_path)
                all_chunks.extend(chunks)
            except Exception as exc:
                print(f"  SKIP {pdf_path.name}: {exc}")
                continue

            if json_path.exists():
                skipped += 1
                continue  # sidecar already written; still chunked above

            needs_extraction[grn] = (
                text,
                {
                    "grn_number":    grn,
                    "substance_name": inv.get("substance", pdf_path.stem),
                    "status":        status,
                    "date_filed":    "",
                    "date_closed":   inv.get("date_closed", ""),
                    "notifier":      "",
                    "source_pdf_url": GRAS_URL_TEMPLATE.format(grn=grn),
                },
                json_path,
            )

    total = len(needs_extraction) + skipped
    print(f"  {total} PDFs scanned | {len(all_chunks)} chunks | "
          f"{len(needs_extraction)} need extraction | {skipped} already done")

    # ── Phase 3: batch semantic extraction ───────────────────────────────────
    semantic_results: dict[int, dict] = {}
    if needs_extraction:
        print(f"\n=== Phase 3: Batch extraction ({len(needs_extraction)} PDFs) ===")

        # Resume from saved batch ID if available
        resume_id = collect_batch_id
        if not resume_id and BATCH_STATE_FILE.exists():
            resume_id = BATCH_STATE_FILE.read_text().strip()
            print(f"  Found saved batch ID: {resume_id}")

        pdf_texts = {grn: text for grn, (text, _, _) in needs_extraction.items()}
        batch_requests = _build_batch_requests(pdf_texts)
        semantic_results = _submit_and_collect(client, batch_requests, resume_id)
    else:
        print("\nAll PDFs already have JSON sidecars — skipping batch extraction.")

    # ── Phase 4: write outputs ────────────────────────────────────────────────
    print("\n=== Phase 4: Writing outputs ===")
    written = 0
    for grn, (_, base_meta, json_path) in needs_extraction.items():
        notice = {**base_meta, **semantic_results.get(grn, {})}
        json_path.write_text(json.dumps(notice, indent=2), encoding="utf-8")
        written += 1

    CHUNKS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with CHUNKS_FILE.open("w", encoding="utf-8") as f:
        for chunk in all_chunks:
            f.write(json.dumps(chunk) + "\n")

    print(f"  Wrote {written} JSON sidecars")
    print(f"  Wrote {len(all_chunks)} chunks to {CHUNKS_FILE}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Extract + embed GRAS notice metadata")
    parser.add_argument("--test",    action="store_true", help="Process one PDF only")
    parser.add_argument("--collect", metavar="BATCH_ID",  help="Resume results from a prior batch")
    args = parser.parse_args()
    run(test_one=args.test, collect_batch_id=args.collect)
