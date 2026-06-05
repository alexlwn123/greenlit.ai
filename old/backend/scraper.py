"""FDA GRAS Notice Inventory scraper."""

import argparse
import sys

# Force UTF-8 output on Windows (avoids cp1252 UnicodeEncodeError)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import json
import random
import re
import time
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse

import pdfplumber
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from pypdf import PdfReader, PdfWriter

load_dotenv()

# ── Configuration ──────────────────────────────────────────────────────────────

BASE_URL = "https://www.hfpappexternal.fda.gov/scripts/fdcc/index.cfm"
INVENTORY_PARAMS = {"set": "GRASNotices"}
DATE_CUTOFF = date(2012, 1, 1)
MAX_FILENAME_LEN = 150
LARGE_FILE_MB = 500
MIN_TEXT_CHARS = 100
MAX_RETRIES = 3
DELAY_RANGE = (2.0, 3.0)

DATA_DIR = Path("data")
NOTICES_DIR = DATA_DIR / "notices"
APPROVED_DIR = NOTICES_DIR / "approved"
WITHDRAWN_DIR = NOTICES_DIR / "withdrawn"
PENDING_DIR = NOTICES_DIR / "pending"

STATUS_DIRS = {
    "no questions": APPROVED_DIR,
    "approved": APPROVED_DIR,
    "withdrawn": WITHDRAWN_DIR,
    "pending": PENDING_DIR,
}

FAILED_LOG = DATA_DIR / "failed_downloads.json"
SCANNED_LOG = DATA_DIR / "scanned_notices.json"
AMBIGUOUS_LOG = DATA_DIR / "ambiguous_downloads.json"
DATE_UNKNOWN_LOG = DATA_DIR / "date_unknown.json"
FAILED_MERGES_LOG = DATA_DIR / "failed_merges.json"
SUMMARY_FILE = DATA_DIR / "scrape_summary.json"

# Labels that identify the primary submission PDF (case-insensitive prefix match)
PRIMARY_LABELS = ["gras notice (releasable information)"]
PART_LABEL_RE = re.compile(r"^part\s*\d+", re.I)
# Labels that should NEVER be downloaded
EXCLUDE_LABELS = [
    "fda letter",
    "fda's letter",
    "response letter",
    "fda response",
    "fda has no questions",
    "interim response",
    "ceased to evaluate",
    "withdrawn",
]

# ── Helpers ────────────────────────────────────────────────────────────────────


def slugify(text: str, max_len: int = 80) -> str:
    """Lowercase, hyphenate, strip specials."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"[\s-]+", "-", text).strip("-")
    return text[:max_len]


def grn_tag(grn: int) -> str:
    return f"GRN-{grn:04d}"


def status_dir(status: str) -> Path:
    key = status.lower().strip()
    for k, d in STATUS_DIRS.items():
        if k in key:
            return d
    return PENDING_DIR


def load_json_list(path: Path) -> list:
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return []


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def append_json_list(path: Path, entry: dict) -> None:
    items = load_json_list(path)
    items.append(entry)
    save_json(path, items)


def parse_date(raw: str) -> date | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    for fmt in ("%m/%d/%Y", "%B %d, %Y", "%b %d, %Y", "%Y-%m-%d", "%d-%b-%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


# ── HTTP session ───────────────────────────────────────────────────────────────


def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
    )
    return s


def fetch(session: requests.Session, url: str, **kwargs) -> requests.Response:
    """GET with retry + exponential backoff."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = session.get(url, timeout=60, **kwargs)
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            if attempt == MAX_RETRIES:
                raise
            wait = 2 ** attempt + random.uniform(0, 1)
            print(f"  [retry {attempt}/{MAX_RETRIES}] {exc} — waiting {wait:.1f}s")
            time.sleep(wait)
    raise RuntimeError("fetch failed")


def polite_delay() -> None:
    time.sleep(random.uniform(*DELAY_RANGE))


# ── Inventory scraping ─────────────────────────────────────────────────────────


# Columns in the FDA GRAS inventory table (actual observed structure):
#   GRN No. | Substance | Date of closure | FDA's Letter | Date of add'l correspondence | Resubmitted as GRN No.
# Detail URL is on the Substance link: ?set=GRASNotices&id=<number>
# Date of filing is only on each notice's detail page, not the list.

SHOW_ALL_PARAMS = {
    "set": "GRASNotices",
    "sort": "GRN_No",
    "order": "ASC",
    "showAll": "true",
    "type": "basic",
    "search": "",
}


def scrape_inventory(session: requests.Session) -> list[dict]:
    """Fetch all 1300+ records from the GRAS inventory in a single Show-All request."""
    print("Fetching GRAS Notice Inventory (Show All)...")
    resp = fetch(session, BASE_URL, params=SHOW_ALL_PARAMS)
    soup = BeautifulSoup(resp.text, "html.parser")
    notices = _parse_inventory_table(soup)
    print(f"Total notices found: {len(notices)}")
    return notices


def _parse_inventory_table(soup: BeautifulSoup) -> list[dict]:
    """Parse the inventory table with known column structure."""
    notices = []

    # Find the table that has GRN number links
    table = None
    for t in soup.find_all("table"):
        if t.find("a", href=re.compile(r"set=GRASNotices&id=", re.I)):
            table = t
            break

    if table is None:
        print("WARNING: Could not find notices table.")
        return notices

    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 2:
            continue

        cells = [td.get_text(" ", strip=True) for td in tds]

        # Col 0: GRN number (plain text) — links are on the substance cell
        grn_match = re.match(r"^(\d+)", cells[0].strip())
        if not grn_match:
            continue
        grn = int(grn_match.group(1))

        # Col 1: Substance — carries the detail link
        substance = cells[1] if len(cells) > 1 else ""
        detail_url = None
        a = tds[1].find("a", href=True) if len(tds) > 1 else None
        if a:
            detail_url = urljoin(BASE_URL, a["href"])

        # Col 2: Date of closure
        date_closed_raw = cells[2].strip() if len(cells) > 2 else ""

        # Col 3: FDA's Letter — encodes status
        fda_letter = cells[3].strip() if len(cells) > 3 else ""
        status = _infer_status(fda_letter)

        notices.append({
            "grn": grn,
            "substance": substance,
            "notifier": "",          # not in list page; available on detail
            "date_filed_raw": "",    # not in list page; fetched from detail
            "date_closed_raw": date_closed_raw,
            "status": status,
            "detail_url": detail_url or build_detail_url(grn),
        })

    return notices


def _infer_status(fda_letter_text: str) -> str:
    t = fda_letter_text.lower()
    if not t or "pending" in t:
        return "Pending"
    if "no question" in t:
        return "No Questions"
    if "withdraw" in t or "ceased" in t or "terminated" in t:
        return "Withdrawn"
    # A date string (e.g. "Jun 18, 2012") means a letter was sent = No Questions
    if re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b", t, re.I):
        return "No Questions"
    return "Pending"


# ── Detail page scraping ───────────────────────────────────────────────────────


def build_detail_url(grn: int) -> str:
    return f"{BASE_URL}?set=GRASNotices&id={grn}"


def scrape_detail(session: requests.Session, notice: dict) -> tuple[list[dict], date | None]:
    """
    Fetch the notice detail page.
    Returns (pdf_list, date_filed).
    pdf_list entries: {url, label, category: 'primary'|'part'|'supplement'|'ambiguous', part_num}
    """
    url = notice.get("detail_url") or build_detail_url(notice["grn"])
    try:
        resp = fetch(session, url)
    except requests.RequestException as exc:
        raise RuntimeError(f"detail page fetch failed: {exc}") from exc

    soup = BeautifulSoup(resp.text, "html.parser")

    # Extract date of filing from detail table
    date_filed: date | None = None
    for tr in soup.find_all("tr"):
        tds = tr.find_all(["td", "th"])
        if len(tds) >= 2:
            label = tds[0].get_text(strip=True).lower()
            if "date of filing" in label or "date filed" in label:
                date_filed = parse_date(tds[1].get_text(strip=True))
                break

    pdfs = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        link_text = a.get_text(strip=True).lower()
        # Match .pdf URLs, FDA media download endpoints, and links whose text says "in pdf"
        is_pdf_link = (
            href.lower().endswith(".pdf")
            or ".pdf" in href.lower()
            or re.search(r"/media/\d+/download", href, re.I)
            or "(in pdf)" in link_text
            or href.lower().endswith("/download")
        )
        if not is_pdf_link:
            continue

        full_url = urljoin(url, href)
        label = _get_pdf_label(a, soup)
        category = _classify_label(label)

        if category == "exclude":
            continue

        part_num = None
        if category == "part":
            m = re.search(r"(\d+)", label)
            part_num = int(m.group(1)) if m else None

        pdfs.append({"url": full_url, "label": label, "category": category, "part_num": part_num})

    return pdfs, date_filed


def _get_pdf_label(a_tag, soup: BeautifulSoup) -> str:
    """Extract the descriptive label for a PDF link.

    The FDA detail page uses a two-column table:
      <td>GRAS Notice (releasable information):</td><td><a href=...>GRN N (in PDF)</a></td>
    So the label is in the *preceding sibling <td>* of the cell that holds the link.
    """
    parent_td = a_tag.find_parent(["td", "th"])
    if parent_td:
        # Look for label in the preceding sibling cell of the same row
        prev_td = parent_td.find_previous_sibling(["td", "th"])
        if prev_td:
            label = prev_td.get_text(" ", strip=True).rstrip(":")
            if label:
                return label

        # Text before the <a> inside the same cell
        parts = []
        for child in parent_td.children:
            if child == a_tag:
                break
            if hasattr(child, "get_text"):
                parts.append(child.get_text(" ", strip=True))
            elif isinstance(child, str):
                parts.append(child.strip())
        label = " ".join(p for p in parts if p)
        if label:
            return label

    # Fall back to link text itself
    return a_tag.get_text(strip=True)


def _classify_label(label: str) -> str:
    """Return 'primary', 'part', 'supplement', 'exclude', or 'ambiguous'."""
    low = label.lower().strip()

    for excl in EXCLUDE_LABELS:
        if excl in low:
            return "exclude"

    for pl in PRIMARY_LABELS:
        if pl in low:
            return "primary"

    if PART_LABEL_RE.match(low):
        return "part"

    if "supplement" in low or "additional" in low or "appendix" in low:
        return "supplement"

    # Empty label or generic filename → ambiguous
    if not low or re.match(r"^[a-z0-9_-]+\.pdf$", low):
        return "ambiguous"

    return "ambiguous"


# ── File naming ────────────────────────────────────────────────────────────────


def build_filename(
    grn: int,
    substance: str,
    category: str,
    part_num: int | None,
    version: int = 1,
    scanned: bool = False,
) -> str:
    tag = grn_tag(grn)
    slug = slugify(substance)
    suffix = ""

    if category == "primary":
        # Single file — no part suffix yet; merged later
        base = f"{tag}_{slug}"
    elif category == "part":
        n = part_num if part_num is not None else 1
        base = f"{tag}_{slug}_part{n}"
    elif category == "supplement":
        base = f"{tag}_{slug}_supplement"
    else:  # ambiguous
        base = f"{tag}_{slug}_ambiguous"

    if version > 1:
        base += f"_v{version}"
    if scanned:
        base += "_scanned"

    full = (base + ".pdf")[: MAX_FILENAME_LEN]
    # Ensure .pdf extension after truncation
    if not full.endswith(".pdf"):
        full = full[: MAX_FILENAME_LEN - 4] + ".pdf"
    return full


def unique_filename(dest_dir: Path, filename: str) -> str:
    """Append _v2, _v3 … if file already exists (for resubmissions)."""
    p = dest_dir / filename
    if not p.exists():
        return filename
    stem = filename[:-4]  # strip .pdf
    v = 2
    while True:
        candidate = f"{stem}_v{v}.pdf"
        if not (dest_dir / candidate).exists():
            return candidate
        v += 1


# ── Download ───────────────────────────────────────────────────────────────────


WAYBACK_PREFIX = "wayback.archive-it.org"


def _original_url(url: str) -> str | None:
    """Strip Wayback Machine wrapper to get the original FDA URL."""
    m = re.search(r"wayback\.archive-it\.org/[^/]+/\d+/(https?://.+)", url)
    return m.group(1) if m else None


def download_pdf(
    session: requests.Session,
    url: str,
    dest: Path,
) -> int:
    """Download PDF to dest. Returns file size in bytes."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    urls_to_try = [url]
    original = _original_url(url)
    if original:
        urls_to_try.append(original)  # fallback: try direct FDA URL

    last_exc: Exception = RuntimeError("download failed")
    for try_url in urls_to_try:
        for attempt in range(1, MAX_RETRIES + 1):
            # Extra courtesy delay for Wayback Machine
            if WAYBACK_PREFIX in try_url and attempt > 1:
                time.sleep(5)
            try:
                with session.get(try_url, timeout=120, stream=True) as resp:
                    resp.raise_for_status()
                    size = 0
                    first_chunk = True
                    with open(dest, "wb") as f:
                        for chunk in resp.iter_content(chunk_size=1024 * 256):
                            if first_chunk:
                                if chunk[:4] != b"%PDF" and chunk[:9].lower().startswith(b"<!doctype"):
                                    raise ValueError("Server returned HTML instead of PDF")
                                first_chunk = False
                            f.write(chunk)
                            size += len(chunk)
                return size
            except (requests.RequestException, ValueError) as exc:
                last_exc = exc
                dest.unlink(missing_ok=True)
                if attempt == MAX_RETRIES:
                    break
                wait = 2 ** attempt + random.uniform(0, 1)
                print(f"    [retry {attempt}/{MAX_RETRIES}] {exc} — waiting {wait:.1f}s")
                time.sleep(wait)

    raise last_exc


# ── PDF checks ─────────────────────────────────────────────────────────────────


def is_scanned_pdf(path: Path) -> bool:
    """Return True if fewer than MIN_TEXT_CHARS extractable from first page."""
    # Reject HTML error pages saved as .pdf
    with open(path, "rb") as f:
        header = f.read(16)
    if header.startswith(b"<!") or header.lower().startswith(b"<html"):
        raise ValueError(f"Downloaded file is HTML, not a PDF: {path.name}")
    try:
        with pdfplumber.open(path) as pdf:
            if not pdf.pages:
                return True
            text = pdf.pages[0].extract_text() or ""
            return len(text.strip()) < MIN_TEXT_CHARS
    except Exception:
        return True


def rename_scanned(path: Path) -> Path:
    """Rename file to include _scanned before .pdf extension."""
    if "_scanned" in path.stem:
        return path
    new_path = path.with_name(path.stem + "_scanned.pdf")
    path.rename(new_path)
    return new_path


# ── PDF merging ────────────────────────────────────────────────────────────────


def merge_parts(
    grn: int,
    substance: str,
    dest_dir: Path,
    part_files: list[Path],
    cleanup: bool,
) -> Path | None:
    """Merge ordered part PDFs into a single combined PDF."""
    if len(part_files) < 2:
        return None

    combined_name = f"{grn_tag(grn)}_{slugify(substance)}_combined.pdf"
    # Truncate if needed
    if len(combined_name) > MAX_FILENAME_LEN:
        max_slug = MAX_FILENAME_LEN - len(f"{grn_tag(grn)}__combined.pdf")
        combined_name = f"{grn_tag(grn)}_{slugify(substance, max_slug)}_combined.pdf"
    combined_path = dest_dir / combined_name

    writer = PdfWriter()
    expected_pages = 0
    for pf in part_files:
        try:
            reader = PdfReader(str(pf))
            expected_pages += len(reader.pages)
            for page in reader.pages:
                writer.add_page(page)
        except Exception as exc:
            raise RuntimeError(f"could not read {pf.name}: {exc}") from exc

    with open(combined_path, "wb") as f:
        writer.write(f)

    # Verify page count
    actual_pages = len(PdfReader(str(combined_path)).pages)
    if actual_pages != expected_pages:
        combined_path.unlink(missing_ok=True)
        raise RuntimeError(
            f"page count mismatch: expected {expected_pages}, got {actual_pages}"
        )

    if cleanup:
        for pf in part_files:
            pf.unlink(missing_ok=True)

    return combined_path


# ── Main orchestration ─────────────────────────────────────────────────────────


def run(cleanup: bool = False, limit: int | None = None, single_grn: int | None = None) -> None:
    # Ensure output dirs exist
    for d in (APPROVED_DIR, WITHDRAWN_DIR, PENDING_DIR):
        d.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    session = make_session()

    # ── 1. Fetch inventory ──────────────────────────────────────────────────
    all_notices = scrape_inventory(session)

    # ── --grn: filter to a single notice (prefer real URL from inventory) ──
    if single_grn is not None:
        match = next((n for n in all_notices if n["grn"] == single_grn), None)
        if match:
            all_notices = [match]
            print(f"--grn mode: found {grn_tag(single_grn)} in inventory")
        else:
            all_notices = [
                {
                    "grn": single_grn,
                    "substance": f"grn-{single_grn}",
                    "notifier": "",
                    "date_filed_raw": "",
                    "date_closed_raw": "",
                    "status": "Pending",
                    "detail_url": None,
                }
            ]
            print(f"--grn mode: {grn_tag(single_grn)} not in inventory, will try direct URL")

    # ── 1b. Initial list: all notices pass through; date filtering happens per-detail-page ──
    # The FDA list page does not expose "Date of filing" — it is only on each detail page.
    # We apply the DATE_CUTOFF filter after fetching the detail page inside the main loop.
    filtered_notices = all_notices

    if limit is not None:
        filtered_notices = filtered_notices[:limit]
        print(f"--limit {limit}: capped to {len(filtered_notices)} notices")
    else:
        print(f"Notices to process: {len(filtered_notices)}")

    date_unknown_records: list[dict] = []

    # ── Tracking state ──────────────────────────────────────────────────────
    counts = {
        "total_notices": len(filtered_notices),
        "downloaded": 0,
        "failed": 0,
        "skipped": 0,
        "scanned_pdfs": 0,
        "ambiguous_pdfs": 0,
        "date_unknown": 0,  # updated after loop
        "by_status": {"approved": 0, "withdrawn": 0, "pending": 0},
    }
    total_bytes = 0

    # Track part files per GRN for later merge: {grn: [Path, ...]}
    grn_parts: dict[int, list[Path]] = {}

    # ── 2–5. Per-notice loop ────────────────────────────────────────────────
    for idx, notice in enumerate(filtered_notices, 1):
        grn = notice["grn"]
        substance = notice["substance"] or f"grn-{grn}"
        raw_status = notice["status"]
        dest_dir = status_dir(raw_status)

        # Count by status
        key = _status_key(raw_status)
        counts["by_status"][key] += 1

        polite_delay()
        print(
            f"[{idx}/{len(filtered_notices)}] {grn_tag(grn)} | {substance[:50]} | {raw_status}",
            end=" | ",
            flush=True,
        )

        # Fetch detail page (also extracts date_filed for filtering)
        try:
            pdfs, date_filed = scrape_detail(session, notice)
        except Exception as exc:
            print(f"FAILED (detail page: {exc})")
            counts["failed"] += 1
            append_json_list(
                FAILED_LOG,
                {"grn": grn, "substance": substance, "error": f"detail page: {exc}"},
            )
            continue

        # Apply date filter now that we have the real date_filed
        if date_filed is None:
            notice["date_filed_raw"] = ""
            date_unknown_records.append({**notice, "date_filed_raw": ""})
        elif date_filed < DATE_CUTOFF:
            print(f"SKIPPED (filed {date_filed}, before {DATE_CUTOFF})")
            counts["skipped"] += 1
            continue

        if not pdfs:
            print("no PDFs found")
            append_json_list(
                FAILED_LOG,
                {"grn": grn, "substance": substance, "error": "no PDF links found"},
            )
            counts["failed"] += 1
            continue

        # Decide on part numbering for primary+parts
        primary_pdfs = [p for p in pdfs if p["category"] == "primary"]
        part_pdfs = [p for p in pdfs if p["category"] == "part"]
        supplement_pdfs = [p for p in pdfs if p["category"] == "supplement"]
        ambiguous_pdfs = [p for p in pdfs if p["category"] == "ambiguous"]

        # If there's one primary and also explicit parts — treat primary as part1
        download_queue: list[tuple] = []  # (pdf_dict, filename)

        if primary_pdfs and part_pdfs:
            # Assign part1 to the primary, then part2… from part_pdfs
            p0 = primary_pdfs[0]
            download_queue.append((p0, build_filename(grn, substance, "part", 1)))
            for extra in primary_pdfs[1:]:
                # Multiple primaries — rare, treat as next parts
                n_part = 2 + extra.get("part_num", 0)
                download_queue.append((extra, build_filename(grn, substance, "part", n_part)))
            for pp in part_pdfs:
                n_part = (pp["part_num"] or 2)
                if n_part == 1:
                    n_part = 2  # avoid collision
                download_queue.append((pp, build_filename(grn, substance, "part", n_part)))
        elif primary_pdfs:
            if len(primary_pdfs) == 1:
                download_queue.append((primary_pdfs[0], build_filename(grn, substance, "primary", None)))
            else:
                for i, pp in enumerate(primary_pdfs, 1):
                    download_queue.append((pp, build_filename(grn, substance, "part", i)))
        elif part_pdfs:
            for pp in part_pdfs:
                download_queue.append((pp, build_filename(grn, substance, "part", pp["part_num"])))
        
        for sp in supplement_pdfs:
            download_queue.append((sp, build_filename(grn, substance, "supplement", None)))
        
        for ap in ambiguous_pdfs:
            download_queue.append((ap, build_filename(grn, substance, "ambiguous", None)))
            counts["ambiguous_pdfs"] += 1
            append_json_list(
                AMBIGUOUS_LOG,
                {"grn": grn, "substance": substance, "url": ap["url"], "label": ap["label"]},
            )

        pdf_results = []
        notice_parts: list[Path] = []

        for pdf_info, filename in download_queue:
            filename = unique_filename(dest_dir, filename)
            dest = dest_dir / filename

            # Skip if already exists
            scanned_variant = dest.with_name(dest.stem + "_scanned.pdf")
            if dest.exists() or scanned_variant.exists():
                counts["skipped"] += 1
                pdf_results.append("Skipped")
                if pdf_info["category"] in ("primary", "part") and dest.exists():
                    notice_parts.append(dest)
                elif scanned_variant.exists() and "_scanned" not in str(dest):
                    pass  # scanned variant, skip from merge
                continue

            polite_delay()
            try:
                size = download_pdf(session, pdf_info["url"], dest)
            except Exception as exc:
                counts["failed"] += 1
                pdf_results.append("Failed")
                append_json_list(
                    FAILED_LOG,
                    {
                        "grn": grn,
                        "substance": substance,
                        "url": pdf_info["url"],
                        "filename": filename,
                        "error": str(exc),
                    },
                )
                continue

            size_mb = size / 1_000_000
            total_bytes += size

            if size_mb > LARGE_FILE_MB:
                print(f"\n    WARNING: {filename} is {size_mb:.1f} MB — very large file")

            # Text extraction check
            scanned = is_scanned_pdf(dest)
            if scanned:
                dest = rename_scanned(dest)
                counts["scanned_pdfs"] += 1
                append_json_list(
                    SCANNED_LOG,
                    {"grn": grn, "substance": substance, "filename": dest.name},
                )
                pdf_results.append("Scanned")
            else:
                pdf_results.append("Downloaded")
                if pdf_info["category"] in ("primary", "part"):
                    notice_parts.append(dest)

            counts["downloaded"] += 1

        if notice_parts:
            grn_parts[grn] = notice_parts

        result_str = "/".join(pdf_results) if pdf_results else "none"
        print(f"{len(download_queue)} PDFs | {result_str}")

    # Save date-unknown log and update count
    if date_unknown_records:
        save_json(DATE_UNKNOWN_LOG, date_unknown_records)
        print(f"Date unknown: {len(date_unknown_records)} notices logged to {DATE_UNKNOWN_LOG}")
    counts["date_unknown"] = len(date_unknown_records)

    # ── 8. Merge part PDFs ──────────────────────────────────────────────────
    print("\nMerging multi-part PDFs...")
    merge_ok = 0
    merge_fail = 0

    for grn, parts in grn_parts.items():
        if len(parts) < 2:
            continue

        # Sort by part number embedded in filename
        def part_order(p: Path) -> int:
            m = re.search(r"_part(\d+)", p.stem)
            return int(m.group(1)) if m else 0

        parts_sorted = sorted(parts, key=part_order)
        substance = _grn_substance(parts_sorted[0], grn)
        dest_dir = parts_sorted[0].parent

        try:
            combined = merge_parts(grn, substance, dest_dir, parts_sorted, cleanup)
            if combined:
                print(f"  Merged {grn_tag(grn)}: {len(parts_sorted)} parts → {combined.name}")
                merge_ok += 1
        except Exception as exc:
            merge_fail += 1
            print(f"  MERGE FAILED {grn_tag(grn)}: {exc}")
            append_json_list(
                FAILED_MERGES_LOG,
                {"grn": grn, "parts": [p.name for p in parts_sorted], "error": str(exc)},
            )

    if merge_ok or merge_fail:
        print(f"Merges complete: {merge_ok} ok, {merge_fail} failed")

    # ── 6. Summary ──────────────────────────────────────────────────────────
    summary = {
        **counts,
        "total_size_mb": round(total_bytes / 1_000_000, 2),
    }
    save_json(SUMMARY_FILE, summary)

    print("\n" + "=" * 60)
    print("SCRAPE COMPLETE")
    print(f"  Total notices:  {counts['total_notices']}")
    print(f"  Downloaded:     {counts['downloaded']}")
    print(f"  Skipped:        {counts['skipped']}")
    print(f"  Failed:         {counts['failed']}")
    print(f"  Scanned PDFs:   {counts['scanned_pdfs']}")
    print(f"  Ambiguous PDFs: {counts['ambiguous_pdfs']}")
    print(f"  Date unknown:   {counts['date_unknown']}")
    print(f"  Approved:       {counts['by_status']['approved']}")
    print(f"  Withdrawn:      {counts['by_status']['withdrawn']}")
    print(f"  Pending:        {counts['by_status']['pending']}")
    print(f"  Total size:     {summary['total_size_mb']} MB")
    print(f"  Summary saved -> {SUMMARY_FILE}")


# ── Utility helpers ────────────────────────────────────────────────────────────


def _status_key(status: str) -> str:
    s = status.lower()
    if "no question" in s or "approved" in s:
        return "approved"
    if "withdraw" in s:
        return "withdrawn"
    return "pending"


def _grn_substance(path: Path, grn: int) -> str:
    """Extract substance slug from a part filename like GRN-0001_substance_part1.pdf."""
    name = path.stem  # e.g. GRN-0001_some-substance_part1
    prefix = f"grn-{grn:04d}_"
    if name.lower().startswith(prefix):
        rest = name[len(prefix):]
        # strip trailing _part<n>
        rest = re.sub(r"_part\d+$", "", rest)
        return rest
    return f"grn-{grn}"


# ── Entry point ────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description="FDA GRAS Notice scraper")
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="Delete individual part files after successful merge",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Process only the first N notices (useful for testing)",
    )
    parser.add_argument(
        "--grn",
        type=int,
        default=None,
        metavar="GRN",
        help="Process a single specific GRN number (e.g. --grn 1295)",
    )
    args = parser.parse_args()
    run(cleanup=args.cleanup, limit=args.limit, single_grn=args.grn)


if __name__ == "__main__":
    main()
