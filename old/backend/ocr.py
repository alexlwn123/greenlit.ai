"""OCR processor for scanned GRAS notice PDFs.

Requires system-level dependencies (install once):
  Tesseract: https://github.com/UB-Mannheim/tesseract/wiki
  Ghostscript: https://www.ghostscript.com/releases/gsdnld.html

Then: pip install ocrmypdf

Run:   python backend/ocr.py
Clean: python backend/ocr.py --cleanup   (delete originals after success)
"""

import argparse
import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv

load_dotenv()

DATA_DIR = Path("data")
NOTICES_DIR = DATA_DIR / "notices"
FAILED_OCR_LOG = DATA_DIR / "failed_ocr.json"
OCR_SUMMARY_FILE = DATA_DIR / "ocr_summary.json"


# -- Helpers ------------------------------------------------------------------


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


def remove_scanned_suffix(path: Path) -> Path:
    """GRN-0001_substance_scanned.pdf      -> GRN-0001_substance.pdf
       GRN-0001_substance_part1_scanned.pdf -> GRN-0001_substance_part1.pdf
       GRN-0001_substance_v2_scanned.pdf    -> GRN-0001_substance_v2.pdf
    """
    new_stem = path.stem.replace("_scanned", "")
    return path.parent / (new_stem + ".pdf")


# -- Core ---------------------------------------------------------------------


def run(cleanup: bool = False, force: bool = False, limit: int | None = None) -> None:
    try:
        import ocrmypdf
    except ImportError:
        print("ERROR: ocrmypdf not installed. Run: pip install ocrmypdf")
        print("Also install Tesseract and Ghostscript (see script header).")
        sys.exit(1)

    scanned = sorted(NOTICES_DIR.rglob("*_scanned.pdf"))
    if limit is not None:
        scanned = scanned[:limit]
    print(f"Found {len(scanned)} scanned PDFs to process")

    ok = skipped = failed = 0

    for i, src in enumerate(scanned, 1):
        dest = remove_scanned_suffix(src)
        prefix = f"[{i}/{len(scanned)}]"

        if dest.exists() and not force:
            print(f"{prefix} SKIP     {src.name}")
            skipped += 1
            continue

        print(f"{prefix} OCR      {src.name}", end=" ... ", flush=True)

        try:
            ocrmypdf.ocr(
                src,
                dest,
                skip_text=True,      # don't re-OCR pages that already have text
                progress_bar=False,
                quiet=True,
            )
            print("done")
            ok += 1

            if cleanup:
                src.unlink()

        except ocrmypdf.exceptions.PriorOcrFoundError:
            # All pages already have text -- just rename/copy
            import shutil
            shutil.copy2(src, dest)
            print("already has text, copied")
            ok += 1
            if cleanup:
                src.unlink()

        except Exception as exc:
            err = repr(exc) if not str(exc) else str(exc)
            print(f"FAILED: {err}")
            failed += 1
            dest.unlink(missing_ok=True)  # remove partial output
            append_json_list(FAILED_OCR_LOG, {"file": src.name, "error": err})

    summary = {"processed": ok, "skipped": skipped, "failed": failed}
    save_json(OCR_SUMMARY_FILE, summary)

    print()
    print("=" * 50)
    print(f"OCR complete")
    print(f"  Processed: {ok}")
    print(f"  Skipped:   {skipped}  (output already exists)")
    print(f"  Failed:    {failed}")
    if failed:
        print(f"  Failures -> {FAILED_OCR_LOG}")


# -- Entry point --------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="OCR scanned GRAS notice PDFs")
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="Delete original _scanned files after successful OCR",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-process files even if output already exists",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Process only the first N scanned files (for testing)",
    )
    args = parser.parse_args()
    run(cleanup=args.cleanup, force=args.force, limit=args.limit)


if __name__ == "__main__":
    main()
