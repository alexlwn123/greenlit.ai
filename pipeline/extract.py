"""FDA GRAS notice PDF extraction pipeline."""

import json
import os
import re
import sys
from pathlib import Path

import anthropic
import pdfplumber
import tiktoken
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))
from constants.enums import (
    DIETARY_EXPOSURE_METHOD,
    FOOD_CATEGORIES,
    GRAS_BASIS,
    NOTICE_SECTION,
    PRODUCTION_METHOD,
    SAFETY_DATA,
    SOURCE_ORGANISM_TYPE,
    STATUS,
    SUBSTANCE_TYPE,
    TARGET_POPULATION,
)

load_dotenv()

APPROVED_DIR = Path("data/notices/Approved")
WITHDRAWN_DIR = Path("data/notices/Withdrawn")
CHUNKS_FILE = Path("data/chunks.jsonl")

CHUNK_MIN = 500
CHUNK_MAX = 800

# FDA GRAS notice URL pattern
GRAS_URL_TEMPLATE = "https://www.fda.gov/food/generally-recognized-safe-gras/gras-notice-inventory#grn{grn:04d}"

SECTION_PATTERNS = [
    (re.compile(r"(?i)part\s*1[^\d].*?(identity|description)"), "part_1_identity"),
    (re.compile(r"(?i)part\s*2[^\d].*?(intended\s*use)"), "part_2_intended_use"),
    (re.compile(r"(?i)part\s*3[^\d].*?(gras\s*(basis|determination))"), "part_3_gras_basis"),
    (re.compile(r"(?i)part\s*4[^\d].*?(safety)"), "part_4_safety"),
    (re.compile(r"(?i)part\s*5[^\d].*?(dietary\s*exposure)"), "part_5_dietary_exposure"),
    (re.compile(r"(?i)part\s*6[^\d].*?(narrative)"), "part_6_narrative"),
    (re.compile(r"(?i)part\s*7[^\d].*?(reference)"), "part_7_references"),
    (re.compile(r"(?i)cover\s*letter"), "cover_letter"),
    (re.compile(r"(?i)appendix"), "appendix"),
]


MAX_EXTRACT_PAGES = 500  # hard cap to prevent runaway parsing on huge PDFs


def extract_text(pdf_path: Path, max_pages: int = MAX_EXTRACT_PAGES) -> str:
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages[:max_pages]:
            text = page.extract_text()
            if text:
                pages.append(text)
    return "\n".join(pages)


def detect_section(line: str) -> str | None:
    for pattern, label in SECTION_PATTERNS:
        if pattern.search(line):
            return label
    return None


def chunk_text(text: str, grn_number: int, pdf_path: Path) -> list[dict]:
    enc = tiktoken.get_encoding("cl100k_base")
    lines = text.splitlines()

    chunks = []
    current_section = "cover_letter"
    current_tokens: list[int] = []
    current_lines: list[str] = []

    def flush(section: str, tokens: list[int], lines_buf: list[str]):
        if not tokens:
            return
        # Split oversized buffers
        while len(tokens) > CHUNK_MAX:
            chunk_tokens = tokens[:CHUNK_MAX]
            chunks.append({
                "grn_number": grn_number,
                "section": section,
                "text": enc.decode(chunk_tokens),
                "token_count": len(chunk_tokens),
                "source_pdf": str(pdf_path),
            })
            tokens = tokens[CHUNK_MAX:]
            lines_buf = []
        if len(tokens) >= CHUNK_MIN:
            chunks.append({
                "grn_number": grn_number,
                "section": section,
                "text": enc.decode(tokens),
                "token_count": len(tokens),
                "source_pdf": str(pdf_path),
            })
        elif chunks:  # merge short tail into previous chunk
            prev = chunks[-1]
            merged = enc.encode(prev["text"]) + tokens
            prev["text"] = enc.decode(merged)
            prev["token_count"] = len(merged)
        else:
            chunks.append({
                "grn_number": grn_number,
                "section": section,
                "text": enc.decode(tokens),
                "token_count": len(tokens),
                "source_pdf": str(pdf_path),
            })

    for line in lines:
        new_section = detect_section(line)
        if new_section and new_section != current_section:
            flush(current_section, current_tokens, current_lines)
            current_section = new_section
            current_tokens = []
            current_lines = []

        line_tokens = enc.encode(line + "\n")
        current_tokens.extend(line_tokens)
        current_lines.append(line)

        if len(current_tokens) >= CHUNK_MAX:
            flush(current_section, current_tokens, current_lines)
            current_tokens = []
            current_lines = []

    flush(current_section, current_tokens, current_lines)
    return chunks


EXTRACTION_PROMPT = """
You are extracting structured metadata from an FDA GRAS (Generally Recognized as Safe) notice.
Return ONLY a valid JSON object with exactly these fields. Use null for fields you cannot determine.

Enum constraints — use only these exact values:
  status: {status}
  substance_type: {substance_type}
  production_method: {production_method}
  source_organism_type: {source_organism_type}
  intended_uses: list from {food_categories}
  target_population: {target_population}
  gras_basis: {gras_basis}
  safety_data_available: list from {safety_data}
  dietary_exposure_method: {dietary_exposure_method}

Fields to extract:
{{
  "grn_number": <integer>,
  "substance_name": <string>,
  "notifier": <string, company/organization name>,
  "date_filed": <string YYYY-MM-DD or null>,
  "date_closed": <string YYYY-MM-DD or null>,
  "status": <one of status enum>,
  "substance_type": <one of substance_type enum>,
  "production_method": <one of production_method enum>,
  "source_organism_type": <one of source_organism_type enum>,
  "intended_uses": <list of food_categories enum values>,
  "target_population": <one of target_population enum>,
  "gras_basis": <one of gras_basis enum>,
  "safety_data_available": <list of safety_data enum values>,
  "dietary_exposure_method": <one of dietary_exposure_method enum>,
  "exposure_estimate_included": <boolean>,
  "allergenicity_addressed": <boolean>,
  "source_pdf_url": <string>
}}

Notice text (first 8000 chars):
{text}
"""


def extract_with_claude(text: str, grn_number: int, status: str, pdf_url: str) -> dict:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    prompt = EXTRACTION_PROMPT.format(
        status=STATUS,
        substance_type=SUBSTANCE_TYPE,
        production_method=PRODUCTION_METHOD,
        source_organism_type=SOURCE_ORGANISM_TYPE,
        food_categories=FOOD_CATEGORIES,
        target_population=TARGET_POPULATION,
        gras_basis=GRAS_BASIS,
        safety_data=SAFETY_DATA,
        dietary_exposure_method=DIETARY_EXPOSURE_METHOD,
        text=text[:8000],
    )

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    # Strip markdown code fences if present
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    data = json.loads(raw)
    data["grn_number"] = grn_number
    data["status"] = status
    data["source_pdf_url"] = pdf_url
    return data


def grn_from_filename(name: str) -> int:
    m = re.match(r"(\d+)", name)
    return int(m.group(1)) if m else 0


def process_pdf(pdf_path: Path, status: str) -> tuple[dict, list[dict]]:
    grn = grn_from_filename(pdf_path.stem)
    pdf_url = GRAS_URL_TEMPLATE.format(grn=grn)

    print(f"  Extracting text from {pdf_path.name}...")
    text = extract_text(pdf_path)

    print(f"  Calling Claude for structured extraction...")
    metadata = extract_with_claude(text, grn, status, pdf_url)

    print(f"  Chunking text...")
    chunks = chunk_text(text, grn, pdf_path)

    return metadata, chunks


def run(test_one: bool = False):
    all_chunks: list[dict] = []

    for directory, status in [(APPROVED_DIR, "no_questions"), (WITHDRAWN_DIR, "withdrawn")]:
        if not directory.exists():
            print(f"Directory not found: {directory}")
            continue

        pdfs = sorted(directory.glob("*.pdf"))
        if test_one:
            pdfs = pdfs[:1]
        print(f"\nProcessing {len(pdfs)} PDFs in {directory}...")

        for pdf_path in pdfs:
            print(f"\n[{pdf_path.name}]")
            try:
                metadata, chunks = process_pdf(pdf_path, status)

                json_out = pdf_path.with_suffix(".json")
                json_out.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
                print(f"  Wrote {json_out.name}")

                all_chunks.extend(chunks)
                print(f"  {len(chunks)} chunks produced")

            except Exception as exc:
                print(f"  ERROR: {exc}")
                import traceback; traceback.print_exc()

    CHUNKS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with CHUNKS_FILE.open("w", encoding="utf-8") as f:
        for chunk in all_chunks:
            f.write(json.dumps(chunk) + "\n")

    print(f"\nWrote {len(all_chunks)} total chunks to {CHUNKS_FILE}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true", help="Run on one PDF only")
    args = parser.parse_args()
    run(test_one=args.test)
