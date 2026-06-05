"""Batch enrichment of existing sidecar JSON files.

Adds derived fields without API calls:
  - source_organism_name: genus/species extracted from substance_name
  - safety_data_available: deduplicated, canonical values

Run: python -m backend.enrich_sidecars [--dry-run]
"""

import argparse
import json
import re
from pathlib import Path

# â”€â”€ Organism name extraction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

# Pattern for organism names inside parentheticals: "Brazzein (Komagataella phaffii)"
_PAREN_ORG_RE = re.compile(
    r'\(([A-Z][a-z]{2,})\s+((?:subsp\.\s*|var\.\s*)?[a-z]{3,}(?:\s+(?:subsp\.\s*|var\.\s*)[a-z]+)?)'
)

# Pattern for organism names following contextual keywords
_FROM_ORG_RE = re.compile(
    r'\b(?:from|by|in|of|derived\s+from|produced\s+by|expressed\s+in)\s+'
    r'(?:[a-z]+\s+){0,3}'  # optional lowercase modifiers (e.g. 'genetically modified')
    r'([A-Z][a-z]{4,})\s+((?:subsp\.\s*|var\.\s*)?[a-z]{4,}(?:\s+(?:subsp\.\s*|var\.\s*)[a-z]+)?)',
)

# Pattern for organisms at the start of substance_name (standalone probiotics, algae)
_START_ORG_RE = re.compile(
    r'^([A-Z][a-z]{4,})\s+((?:subsp\.\s*|var\.\s*)?[a-z]{4,}(?:\s+(?:subsp\.\s*|var\.\s*)[a-z]+)?)',
)

_STRAIN_RE = re.compile(r'^(?:strain\s+)?([A-Z0-9][A-Z0-9][\w-]*)\b')


_SKIP_GENUS = {
    'Part', 'Section', 'Table', 'Figure', 'Federal', 'Code',
    'Generally', 'Recognized', 'Safe', 'Notice', 'Inventory', 'Administration',
    'United', 'States', 'America', 'Resubmission', 'Amendment', 'Preparation',
    'Modified', 'Genetically',
    'Food', 'Fish', 'Beef', 'Pork', 'Chicken', 'Turkey', 'Lamb', 'Milk',
    'Whey', 'Egg', 'Corn', 'Rice', 'Wheat', 'Soy', 'Oat', 'Barley',
    'Apple', 'Annatto', 'Sugar', 'Beet', 'Cane', 'Grape', 'Citrus',
    'Lipase', 'Protease', 'Amylase', 'Cellulase', 'Xylanase', 'Phytase',
    'Laccase', 'Glucose', 'Lysozyme', 'Pectinase', 'Invertase', 'Catalase',
    'Sodium', 'Potassium', 'Calcium', 'Magnesium', 'Iron', 'Zinc',
    'Beta', 'Alpha', 'Delta', 'Gamma', 'Omega',
    'Copper', 'Silver', 'Manganese', 'Chromium', 'Benzalkonium', 'Basic',
    'Sucrose', 'Plant', 'Lutein', 'Curcuminoids', 'Resveratrol', 'Quercetin',
    'Coenzyme', 'Lecithin', 'Chitin', 'Cellulose', 'Chitosan', 'Pectin',
    'Extract', 'Isolate', 'Hydrolysate', 'Concentrate', 'Powder', 'Oil',
    'Protein', 'Peptide', 'Fiber', 'Starch', 'Acid', 'Anhydrous',
}

_SKIP_SPECIES = {
    'from', 'and', 'the', 'oil', 'acid', 'salt', 'base', 'form',
    'type', 'free', 'rich', 'high', 'low', 'pure', 'fine', 'dry',
    'isolate', 'extract', 'powder', 'concentrate', 'hydrolysate',
    'protein', 'peptide', 'fiber', 'starch', 'sugar', 'fat', 'fat',
    'enzyme', 'preparation', 'activity', 'biomass', 'culture', 'ferment',
    'mixed', 'fructans', 'seed', 'peel', 'milk', 'flour', 'flake',
    'copolymer', 'chloride', 'sulfate', 'phosphate', 'benzoate', 'methacrylate',
    'fatty', 'stanol', 'diacetate', 'esters', 'purified', 'mycelium', 'biomass',
}


def _valid_organism(genus: str, species_full: str) -> bool:
    if genus in _SKIP_GENUS or len(genus) < 5:
        return False
    first = species_full.strip().split()[0]
    if first in _SKIP_SPECIES or len(first) < 4:
        return False
    if first.endswith('ase') or first.endswith('ases'):
        return False
    return True


def extract_organism_name(substance_name: str) -> str | None:
    # First: look inside parentheticals (e.g. 'Brazzein (Komagataella phaffii)', 'Lactoferrin (Bos taurus)')
    for pm in _PAREN_ORG_RE.finditer(substance_name):
        genus, species = pm.group(1), pm.group(2).strip()
        species_first = species.split()[0]
        # Relaxed: inside parens is reliable context; only skip known junk words
        if genus in _SKIP_GENUS:
            continue
        if species_first in _SKIP_SPECIES or species_first.endswith('ase'):
            continue
        return genus + ' ' + species
    name = re.sub(r'\s*\([^)]*\)', ' ', substance_name)
    name = re.sub(r'\s+', ' ', name).strip()
    # Prefer contextual match (after from/by/in/of) — eliminates enzyme-name false positives
    for m in _FROM_ORG_RE.finditer(name):
        genus, species = m.group(1), m.group(2).strip()
        if _valid_organism(genus, species):
            result = genus + ' ' + species
            rest = name[m.end():].strip()
            sm = _STRAIN_RE.match(rest)
            if sm:
                result += ' ' + sm.group(1)
            return result
    # Fallback: organism is the substance itself (probiotics, algae, etc.)
    m = _START_ORG_RE.match(name)
    if m:
        genus, species = m.group(1), m.group(2).strip()
        if _valid_organism(genus, species):
            result = genus + ' ' + species
            rest = name[m.end():].strip()
            sm = _STRAIN_RE.match(rest)
            if sm:
                result += ' ' + sm.group(1)
            return result
    return None



# â”€â”€ Safety data normalization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

_SAFETY_SYNONYMS = {
    "repeat_dose_studies":             "subchronic_toxicity",
    "repeat_dose_toxicity":            "subchronic_toxicity",
    "repeated_dose_oral_toxicity":     "subchronic_toxicity",
    "repeated_dose_toxicity":          "subchronic_toxicity",
    "short-term_toxicity":             "subchronic_toxicity",
    "subacute and subchronic studies": "subchronic_toxicity",
    "90_day_rat_study":                "subchronic_toxicity",
    "mutagenicity_ames":               "genotoxicity_ames",
    "genotoxicity_bioinformatic":      "genotoxicity_in_vitro",
    "in_vitro":                        "in_vitro_toxicity",
    "in_vitro_studies":                "in_vitro_toxicity",
    "in_vitro_toxicology":             "in_vitro_toxicity",
    "clinical_studies":                "human_clinical_trial",
    "animal_studies":                  "animal_toxicity_studies",
    "toxicology_studies":              "animal_toxicity_studies",
    "pathogenicity_study":             "pathogenicity_assessment",
    "antibiotic_resistance_testing":   "antibiotic_resistance",
    "allergenicity_addressed":         "allergenicity_bioinformatic",
    "absorption_metabolism_elimination": "metabolic_fate",
}

_CANONICAL_ORDER = [
    "acute_toxicity", "subchronic_toxicity", "chronic_toxicity",
    "reproductive_toxicity", "developmental_toxicity",
    "genotoxicity_ames", "genotoxicity_chromosomal",
    "genotoxicity_in_vitro", "genotoxicity_in_vivo",
    "allergenicity_bioinformatic", "allergenicity_in_vitro", "allergenicity_serum",
    "digestibility_study", "nutritional_impact", "human_clinical_trial",
    "history_of_safe_use", "metabolic_fate", "bioavailability_study",
    "pathogenicity_assessment", "antibiotic_resistance", "genome_analysis",
    "genetic_stability", "immunotoxicity", "immunological_studies",
    "animal_toxicity_studies", "in_vitro_toxicity", "in_silico_toxicology",
    "substantial_equivalence", "biogenic_amines", "virulence_factor_analysis",
    "adverse_events_review",
]
_CANONICAL_SET = set(_CANONICAL_ORDER)


def normalize_safety_data(raw: list) -> list:
    canonical = set()
    for item in (raw or []):
        canonical.add(_SAFETY_SYNONYMS.get(item, item))
    known   = [f for f in _CANONICAL_ORDER if f in canonical]
    unknown = sorted(canonical - _CANONICAL_SET)
    return known + unknown


# â”€â”€ Batch enrichment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def enrich_file(path: Path, dry_run: bool = False) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception as e:
        return {"error": str(e)}

    if "domain_analysis" in data or "gap_report" in data:
        return {"skipped": "full analysis result"}

    changed = False
    stats = {}

    substance = data.get("substance_name", "")
    existing_org = data.get("source_organism_name")
    org_name = extract_organism_name(substance) if substance else None
    if org_name and org_name != existing_org:
        data["source_organism_name"] = org_name
        stats["organism_name"] = org_name
        changed = True
    elif not org_name and existing_org is not None:
        del data["source_organism_name"]
        stats["organism_cleared"] = True
        changed = True

    raw_safety = data.get("safety_data_available") or []
    if raw_safety:
        normed = normalize_safety_data(raw_safety)
        if normed != raw_safety:
            data["safety_data_available"] = normed
            stats["safety_normalized"] = True
            changed = True

    if changed and not dry_run:
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        stats["written"] = True

    return stats


def run(data_root: Path = Path("data/notices"), dry_run: bool = False):
    import os
    os.chdir(Path(__file__).parent.parent)
    dirs = [data_root / "Approved", data_root / "Withdrawn"]
    total = skipped = enriched = errors = 0
    no_org = []

    for d in dirs:
        if not d.exists():
            print(f"  skipping missing dir: {d}")
            continue
        for f in sorted(d.glob("*.json")):
            total += 1
            result = enrich_file(f, dry_run=dry_run)
            if "error" in result:
                errors += 1
                print(f"  ERROR {f.name}: {result['error']}")
            elif result.get("skipped"):
                skipped += 1
            else:
                enriched += 1
                if result.get("organism_name") is None and not result.get("written"):
                    no_org.append(f.name)

    print(f"\nDone: {total} files, {enriched} enriched, {skipped} skipped, {errors} errors")
    if dry_run:
        print("(dry run â€” no files written)")
    if no_org:
        print(f"\n{len(no_org)} with no organism name (sample): {no_org[:5]}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run(dry_run=args.dry_run)

