"""Core gap analysis for a user-uploaded GRAS notice PDF."""

import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
if not os.environ.get("OPENAI_API_KEY") and os.environ.get("OPEN_AI_KEY"):
    os.environ["OPENAI_API_KEY"] = os.environ["OPEN_AI_KEY"]

import anthropic

sys.path.insert(0, str(Path(__file__).parent.parent))
from pipeline.extract import extract_text, extract_with_claude
from backend.retrieve import retrieve
from constants.scoring import (
    BASE_SCORE,
    GAP_DETECTION_HINTS,
    GAP_DISPLAY_TITLES,
    SEVERITY_BASELINE,
    SEVERITY_PRESENT_CAPS,
    SEVERITY_PRESENT_POINTS,
    SEVERITY_UPGRADES,
)

SEVERITY_ORDER = ["critical", "high", "medium", "low"]

# Maps gap fields to a check against similar-notice metadata.
# Returns True if the similar notice addressed this gap.
GAP_PRESENCE_CHECKS = {
    "dietary_exposure_estimate":  lambda m: m.get("exposure_estimate_included") is True,
    "allergenicity_assessment":   lambda m: (
        m.get("allergenicity_addressed") is True
        or "allergenicity_bioinformatic" in m.get("safety_data_available", "")
        or "allergenicity_in_vitro" in m.get("safety_data_available", "")
    ),
    "genotoxicity_battery":        lambda m: (
        "genotoxicity_ames" in m.get("safety_data_available", "")
        or "genotoxicity_chromosomal" in m.get("safety_data_available", "")
    ),
    "digestibility_data":          lambda m: "digestibility_study" in m.get("safety_data_available", ""),
    "nutritional_impact":          lambda m: "nutritional_impact" in m.get("safety_data_available", ""),
    "history_of_safe_use":         lambda m: "history_of_safe_use" in m.get("safety_data_available", ""),
    "human_exposure_data":         lambda m: "human_clinical_trial" in m.get("safety_data_available", ""),
}


GAP_DETECTION_PROMPT = """
You are reviewing a draft FDA GRAS (Generally Recognized as Safe) notice.
For each field below, respond true if the document clearly contains that element, false if it is absent or insufficient.
Return ONLY a valid JSON object with these exact keys — no explanation, no markdown fences.

{field_list}

Document text (first 12000 characters):
{text}
"""


def _build_field_list() -> str:
    lines = []
    for field, hint in GAP_DETECTION_HINTS.items():
        lines.append(f'  "{field}": true/false,  // {hint}')
    return "{\n" + "\n".join(lines).rstrip(",") + "\n}"


def detect_gaps(text: str) -> dict[str, bool]:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    prompt = GAP_DETECTION_PROMPT.format(
        field_list=_build_field_list(),
        text=text[:12000],
    )
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = message.content[0].text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


def apply_severity(gap_field: str, metadata: dict) -> str:
    severity = SEVERITY_BASELINE.get(gap_field, "medium")
    for rule in SEVERITY_UPGRADES:
        if (
            rule["gap_field"] == gap_field
            and metadata.get(rule["condition_field"]) == rule["condition_value"]
        ):
            candidate = rule["upgrade_to"]
            if SEVERITY_ORDER.index(candidate) < SEVERITY_ORDER.index(severity):
                severity = candidate
    return severity


def compute_score(present_counts: dict[str, int]) -> int:
    score = BASE_SCORE
    for severity, cap in SEVERITY_PRESENT_CAPS.items():
        points = SEVERITY_PRESENT_POINTS[severity]
        score += min(present_counts.get(severity, 0), cap) * points
    return min(score, 100)


def _find_reference_grn(gap_field: str, notices: list[dict]) -> int | None:
    checker = GAP_PRESENCE_CHECKS.get(gap_field)
    for notice in notices:
        if checker is None or checker(notice):
            return notice["grn_number"]
    return notices[0]["grn_number"] if notices else None


def _count_with_field(gap_field: str, notices: list[dict]) -> int:
    checker = GAP_PRESENCE_CHECKS.get(gap_field)
    if checker is None:
        return len(notices)  # can't verify from metadata; assume present in approved
    return sum(1 for n in notices if checker(n))


def _count_missing_field(gap_field: str, notices: list[dict]) -> int:
    checker = GAP_PRESENCE_CHECKS.get(gap_field)
    if checker is None:
        return 0
    return sum(1 for n in notices if not checker(n))


def analyze(pdf_path: Path) -> dict:
    print("[1/5] Extracting text...")
    text = extract_text(pdf_path)

    print("[2/5] Extracting structured metadata...")
    metadata = extract_with_claude(text, grn_number=0, status="pending", pdf_url="")

    print("[3/5] Retrieving similar notices...")
    query = " ".join(filter(None, [
        metadata.get("substance_name", ""),
        metadata.get("production_method", ""),
        metadata.get("substance_type", ""),
        metadata.get("source_organism_type", ""),
    ]))
    similar = retrieve(query)
    approved = similar["approved_notices"]
    withdrawn = similar["withdrawn_notices"]

    print("[4/5] Detecting gaps...")
    gap_presence = detect_gaps(text)

    print("[5/5] Scoring and building report...")

    # Determine severity for each field, split into present / absent
    present_counts: dict[str, int] = {"critical": 0, "high": 0, "medium": 0}
    gaps: list[dict] = []

    for field in SEVERITY_BASELINE:
        severity = apply_severity(field, metadata)
        is_present = gap_presence.get(field, False)

        if is_present:
            present_counts[severity] = present_counts.get(severity, 0) + 1
        else:
            approved_with = _count_with_field(field, approved)
            withdrawn_without = _count_missing_field(field, withdrawn)
            ref_approved = _find_reference_grn(field, approved)
            ref_withdrawn = next(
                (n["grn_number"] for n in withdrawn if
                 GAP_PRESENCE_CHECKS.get(field) and not GAP_PRESENCE_CHECKS[field](n)),
                None,
            )

            context_parts = []
            total_approved = len(approved)
            if total_approved > 0:
                context_parts.append(
                    f"{approved_with} of {total_approved} similar approved notice"
                    f"{'s' if total_approved != 1 else ''} included this."
                )
            if withdrawn_without > 0:
                refs = [str(n["grn_number"]) for n in withdrawn
                        if GAP_PRESENCE_CHECKS.get(field) and not GAP_PRESENCE_CHECKS[field](n)]
                if refs:
                    context_parts.append(
                        f"Absent in similar withdrawn notice{'s' if len(refs) > 1 else ''}: "
                        + ", ".join(f"GRN {r}" for r in refs) + "."
                    )

            gaps.append({
                "field":              field,
                "title":              GAP_DISPLAY_TITLES.get(field, field),
                "severity":           severity,
                "context":            " ".join(context_parts),
                "reference_grn":      ref_approved,
                "withdrawn_ref_grn":  ref_withdrawn,
            })

    # Sort gaps: critical → high → medium
    gaps.sort(key=lambda g: SEVERITY_ORDER.index(g["severity"]))

    score = compute_score(present_counts)

    safety_list = metadata.get("safety_data_available") or []
    if isinstance(safety_list, str):
        safety_list = [s.strip() for s in safety_list.split(",") if s.strip()]

    return {
        "overview": {
            "substance_name":           metadata.get("substance_name"),
            "notifier":                 metadata.get("notifier"),
            "production_method":        metadata.get("production_method"),
            "source_organism_type":     metadata.get("source_organism_type"),
            "intended_uses":            metadata.get("intended_uses"),
            "gras_basis":               metadata.get("gras_basis"),
            "target_population":        metadata.get("target_population"),
            "safety_data_detected":     safety_list,
            "dietary_exposure_detected": gap_presence.get("dietary_exposure_estimate", False),
            "allergenicity_detected":    gap_presence.get("allergenicity_assessment", False),
        },
        "gap_report": {
            "score":          score,
            "present_counts": present_counts,
            "gaps":           gaps,
        },
        "similar_notices": {
            "approved_notices":  [
                {k: v for k, v in n.items() if k != "chunks"} for n in approved
            ],
            "withdrawn_notices": [
                {k: v for k, v in n.items() if k != "chunks"} for n in withdrawn
            ],
        },
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", help="Path to the GRAS notice PDF to analyze")
    args = parser.parse_args()

    result = analyze(Path(args.pdf))

    print("\n" + "=" * 60)
    print("SUBMISSION OVERVIEW")
    print("=" * 60)
    ov = result["overview"]
    print(f"Substance:    {ov['substance_name']}")
    print(f"Notifier:     {ov['notifier']}")
    print(f"Method:       {ov['production_method']}")
    print(f"Organism:     {ov['source_organism_type']}")
    print(f"Uses:         {ov['intended_uses']}")
    print(f"GRAS basis:   {ov['gras_basis']}")
    print(f"Safety data:  {', '.join(ov['safety_data_detected']) or 'none detected'}")
    print(f"Exposure:     {'detected' if ov['dietary_exposure_detected'] else 'NOT detected'}")
    print(f"Allergenicity:{'detected' if ov['allergenicity_detected'] else 'NOT detected'}")

    print("\n" + "=" * 60)
    gr = result["gap_report"]
    print(f"COMPLETENESS SCORE: {gr['score']}/100")
    print(f"Fields present — critical: {gr['present_counts'].get('critical',0)}, "
          f"high: {gr['present_counts'].get('high',0)}, "
          f"medium: {gr['present_counts'].get('medium',0)}")
    print("=" * 60)

    icons = {"critical": "⛔", "high": "⚠️", "medium": "\U0001f4a1"}
    current_severity = None
    for gap in gr["gaps"]:
        if gap["severity"] != current_severity:
            current_severity = gap["severity"]
            print(f"\n{current_severity.upper()} GAPS")
            print("-" * 40)
        icon = icons.get(gap["severity"], "•")
        print(f"{icon} {gap['title']}")
        if gap["context"]:
            print(f"   {gap['context']}")
        if gap["reference_grn"]:
            print(f"   → See how GRN {gap['reference_grn']} handled this")

    print("\n" + "=" * 60)
    print("SIMILAR NOTICES")
    print("=" * 60)
    print(f"{'APPROVED':<40} {'WITHDRAWN':<40}")
    print(f"{'-'*38:<40} {'-'*38:<40}")
    approved_rows = result["similar_notices"]["approved_notices"]
    withdrawn_rows = result["similar_notices"]["withdrawn_notices"]
    for i in range(max(len(approved_rows), len(withdrawn_rows))):
        a = approved_rows[i] if i < len(approved_rows) else {}
        w = withdrawn_rows[i] if i < len(withdrawn_rows) else {}
        a_str = f"GRN {a['grn_number']} — {a.get('substance_name','')[:28]}" if a else ""
        w_str = f"GRN {w['grn_number']} — {w.get('substance_name','')[:28]}" if w else ""
        print(f"{a_str:<40} {w_str:<40}")
