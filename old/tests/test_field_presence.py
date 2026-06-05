"""Diagnostic script: run keyword field-presence scanner on GRN-1295 and show results."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline.extract import extract_text
from backend.analyze import _FIELD_KEYWORDS, _check_field_presence

PDF = Path("data/notices/Test/1295_Brazzein_Komagataella.pdf")

print("Extracting text...")
text = extract_text(PDF)
print(f"Extracted {len(text):,} characters ({len(text.split()):,} words)\n")

print("=" * 60)
print("FIELD PRESENCE RESULTS")
print("=" * 60)
results = _check_field_presence(text)
for field, present in results.items():
    status = "FOUND   " if present else "MISSING "
    print(f"  {status}  {field}")

print()
print("=" * 60)
print("KEYWORD MATCH DETAIL")
print("=" * 60)
lower = text.lower()
for field, keywords in _FIELD_KEYWORDS.items():
    matches = [kw for kw in keywords if kw in lower]
    if matches:
        print(f"\n  {field}: FOUND via {matches}")
        kw = matches[0]
        idx = lower.find(kw)
        snippet = text[max(0, idx-80):idx+120].replace("\n", " ").strip()
        print(f"    ...{snippet}...")
    else:
        print(f"\n  {field}: NO MATCH (searched: {keywords[:4]}...)")

print()
print(f"Text sample (first 500 chars):\n{text[:500]}")
