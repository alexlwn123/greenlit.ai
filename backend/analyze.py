"""Deep gap analysis for a user-uploaded GRAS notice PDF."""

import json
import os
import re
import sys
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
if not os.environ.get("OPENAI_API_KEY") and os.environ.get("OPEN_AI_KEY"):
    os.environ["OPENAI_API_KEY"] = os.environ["OPEN_AI_KEY"]

import anthropic

sys.path.insert(0, str(Path(__file__).parent.parent))
from pipeline.extract import extract_text
from backend.retrieve import retrieve
from constants.scoring import (
    BASE_SCORE,
    GAP_DISPLAY_TITLES,
    SEVERITY_BASELINE,
    SEVERITY_PRESENT_CAPS,
    SEVERITY_PRESENT_POINTS,
    SEVERITY_UPGRADES,
)

SEVERITY_ORDER = ["critical", "high", "medium", "low"]

# Maps each gap field to the GRAS notice section where it should appear
GAP_TO_NOTICE_SECTION = {
    "dietary_exposure_estimate":            "part_5_dietary_exposure",
    "allergenicity_assessment":             "part_4_safety",
    "genotoxicity_battery":                 "part_4_safety",
    "production_organism_characterization": "part_1_identity",
    "intended_use_specificity":             "part_2_intended_use",
    "impurity_characterization":            "part_1_identity",
    "manufacturing_process_detail":         "part_1_identity",
    "specifications_and_purity":            "part_1_identity",
    "digestibility_data":                   "part_4_safety",
    "stability_data":                       "part_4_safety",
    "nutritional_impact":                   "part_4_safety",
    "batch_consistency":                    "part_1_identity",
    "expert_panel_review":                  "part_3_gras_basis",
    "human_exposure_data":                  "part_4_safety",
    "history_of_safe_use":                  "part_3_gras_basis",
    "environmental_safety":                 "part_4_safety",
}

NOTICE_SECTION_LABELS = {
    "part_1_identity":         "Part 1 — Identity, Method of Manufacture & Specifications",
    "part_2_intended_use":     "Part 2 — Intended Use",
    "part_3_gras_basis":       "Part 3 — GRAS Basis",
    "part_4_safety":           "Part 4 — Safety",
    "part_5_dietary_exposure": "Part 5 — Dietary Exposure",
    "part_6_narrative":        "Part 6 — Narrative",
    "part_7_references":       "Part 7 — References",
    "cover_letter":            "Cover Letter",
    "appendix":                "Appendix",
}

# ─── System prompt condensed from instruction files ───────────────────────────

SYSTEM_PROMPT = """You are a regulatory evidence assessment agent evaluating FDA GRAS (Generally Recognized as Safe) notices. You assess whether available evidence is sufficient, complete, and appropriately characterized to support a GRAS conclusion. You do not make GRAS determinations. You do not predict FDA responses. You do not render legal opinions.

CRITICAL LANGUAGE RULES — violating these is a serious error:
- Never write that a substance IS GRAS or IS NOT GRAS
- Never write that FDA would likely accept or reject a submission
- Use evidence-based language: "the available data appear sufficient", "no study was identified that addresses...", "the submission does not appear to include..."
- Distinguish facts (what is present) from judgments (adequacy assessments)
- When expressing judgment, signal it: "in this assessment", "it appears", "this may represent"

THREE GAP TYPES — always classify gaps precisely:
1. documentation_gap: data or information may exist but was not included in the submission you reviewed. Do not call this an evidentiary gap.
2. evidentiary_gap: the data does not appear to exist or has not been generated. More serious — goes to substance of the GRAS analysis.
3. adequacy_gap: data was provided but is insufficient in quality, scope, or relevance to support the conclusions drawn from it. Requires explaining specifically what the data show and why they fall short.

PRIORITY LEVELS:
- foundational: the GRAS conclusion cannot be supported without resolving this
- material: weakens the conclusion but may be addressable; reduces confidence
- documentation_issue: affects presentation or organization, not substantive safety case

EIGHT ANALYTICAL DOMAINS — evaluate each in depth:

1. IDENTITY & CHARACTERIZATION: chemical identity, CAS number, physical/chemical properties, source organism taxonomy, genetic modifications (full characterization of introduced DNA), allergenicity assessment (FARRP bioinformatic screening, pepsin digestibility), production strain nonpathogenicity/nontoxigenicity, specifications and purity, Food Chemicals Codex monograph compliance, TOS characterization for enzyme preparations.

2. MANUFACTURING PROCESS: step-by-step process description, fermentation conditions, culture purity controls, isolation/purification steps, all processing aids and reagents, potential for process-related contaminants (residual solvents, secondary metabolites, fermentation media components). Trade secret concerns — the non-confidential description must be sufficient for expert evaluation.

3. DIETARY EXPOSURE: EDI construction using NHANES or USDA CSFII data (not disappearance/poundage data alone), coverage of all proposed food categories, aggregate intake methodology (total-sample before eaters-only conversion), vulnerable subpopulation analysis (children 2-5y, pregnant women, infants where warranted), chronic vs acute exposure where relevant, self-limiting use levels documented.

4. SAFETY DATA: toxicological dataset vs FDA Redbook requirements for the estimated exposure level, subchronic and chronic/carcinogenicity data as appropriate, reproductive/developmental toxicity, genotoxicity battery completeness (Ames alone is typically insufficient — assess whether chromosomal aberration or in vitro micronucleus is needed), adequacy of read-across arguments, safety data addressing the specific substance as manufactured not just analogs.

5. GENERAL AVAILABILITY: all safety-relevant data must be in peer-reviewed published literature or recognized secondary sources. Identify any data that are unpublished, trade secret, or not accessible to qualified experts outside the proponent. Unpublished data can only corroborate, never establish a GRAS conclusion.

6. GENERAL ACCEPTANCE: would qualified experts broadly agree the data establish safety? Evaluate: authoritative body findings (JECFA, EFSA, NAS), scientific controversy in published literature, narrow margin between safe level and toxic level, unresolved safety questions in the literature.

7. CONDITIONS OF USE: food categories fully specified with use levels in appropriate units, technical function defined, target population clear, all proposed uses covered by the safety data.

8. REGULATORY SUBMISSION: GRAS notice Parts 1-7 completeness, certification requirement (Part 1 must certify submission is complete, representative, and balanced including unfavorable information), unfavorable data addressed not omitted.

QUALITY ASSESSMENT REQUIREMENTS:
- An Ames test without chromosomal aberration data = adequacy_gap for genotoxicity, not resolved
- A dietary exposure section using only poundage data = adequacy_gap
- Allergenicity section with bioinformatic screening only but no pepsin digestibility for novel proteins = adequacy_gap
- Production organism described only by name without genetic characterization for GMO strains = adequacy_gap
- Safety studies conducted at exposure levels far below EDI = adequacy_gap

TRUNCATION RULE — highest priority, overrides all other gap classification:
Sections passed to you may end with [... truncated] when the full document exceeded the input budget. If the only reason you cannot assess a topic is that the relevant section was truncated, you MUST classify that gap as gap_type: documentation_gap and priority: documentation_issue — never foundational or material. In the observation, state that the section was truncated in the input provided and that the full document should be verified. Only assign foundational or material priority to gaps where you actually reviewed the content and found something absent, contradictory, or inadequate.

For EVERY gap identified, provide:
- The specific section of the DOCUMENT where this appears or should appear (e.g., "Part 2, Section 2.3" or "Part 5 — not present")
- What is actually present in the document on this topic
- What specifically is missing or inadequate
- Why it matters for the GRAS analysis
"""

# ─── Analysis prompt ──────────────────────────────────────────────────────────

# Domain structure defined once — applied to all 8 domains in the prompt
_DOMAIN_SCHEMA = (
    '{{"summary": "2-3 sentence overview", '
    '"strengths": [{{"observation": "string", "section_reference": "string"}}], '
    '"gaps": [{{"title": "string", '
    '"gap_type": "documentation_gap|evidentiary_gap|adequacy_gap", '
    '"priority": "foundational|material|documentation_issue", '
    '"section_reference": "e.g. Part 2, Section 2.1 or Part 4 — not present", '
    '"observation": "max 60 words: what is present, what is missing, why it matters"}}]}}'
)

ANALYSIS_PROMPT = """
Analyze the following FDA GRAS notice draft. Return ONLY a valid JSON object — no markdown fences, no preamble.

BE CONCISE. Every observation field: max 60 words. Every summary field: max 40 words. Limit recommended_next_steps to 5 items. Limit strengths_summary to 5 items. Total response must stay under 8000 tokens.

All domain entries use this structure: {domain_schema}

Return:
{{
  "engagement_summary": {{"substance_name": "string", "notifier": "string", "production_method": "string", "source_organism": "string", "gras_basis": "scientific_procedures|common_use_prior_1958", "intended_uses": ["list"], "target_population": "string", "date_filed": "YYYY-MM-DD or null", "submission_completeness_note": "1-2 sentences"}},
  "threshold_assessment": {{
    "categorical_eligibility": {{"eligible": true, "basis": "string"}},
    "scope_clarity": {{"adequate": true, "food_categories_specified": true, "use_levels_specified": true, "technical_function_specified": true, "notes": "string"}},
    "existing_regulatory_status": {{"prior_gras_notices": "string or none identified", "food_additive_approvals": "string or none identified", "notes": "string"}}
  }},
  "potential_safety_signals": [{{"signal": "string", "evidence": "string", "section_reference": "string", "recommended_action": "string"}}],
  "domain_analysis": {{
    "identity_and_characterization": {domain_schema},
    "manufacturing_process": {domain_schema},
    "dietary_exposure": {domain_schema},
    "safety_data": {domain_schema},
    "general_availability": {domain_schema},
    "general_acceptance": {domain_schema},
    "conditions_of_use": {domain_schema},
    "regulatory_submission": {domain_schema}
  }},
  "gap_field_presence": {{"dietary_exposure_estimate": true, "allergenicity_assessment": true, "genotoxicity_battery": true, "production_organism_characterization": true, "intended_use_specificity": true, "impurity_characterization": true, "manufacturing_process_detail": true, "specifications_and_purity": true, "digestibility_data": true, "stability_data": true, "nutritional_impact": true, "batch_consistency": true, "expert_panel_review": true, "human_exposure_data": true, "history_of_safe_use": true, "environmental_safety": true}},
  "strengths_summary": [{{"domain": "string", "observation": "string", "section_reference": "string"}}],
  "recommended_next_steps": [{{"priority": "foundational|material|documentation_issue", "action": "string", "domain": "string", "gap_title": "string"}}],
  "limitations_and_caveats": "string"
}}

Notice text ({char_count} characters):
{text}
"""


# Priority order — Part 5 before Part 4 because safety sections are large and
# would otherwise consume the entire budget before dietary exposure is included
_SECTION_PRIORITY = [
    "cover_letter",
    "part_1_identity",
    "part_2_intended_use",
    "part_3_gras_basis",
    "part_5_dietary_exposure",
    "part_4_safety",
    "part_6_narrative",
    "part_7_references",
    "appendix",
]

# Guaranteed minimum chars per section — sized so that even a very long section
# delivers enough content for a meaningful assessment before the budget overflows.
# The sum of minimums (~54k) is well under CHAR_BUDGET so every critical section
# is always represented; lower-priority sections get whatever remains.
_SECTION_MINIMUMS = {
    "cover_letter":            3_000,
    "part_1_identity":        15_000,
    "part_2_intended_use":     6_000,
    "part_3_gras_basis":       8_000,
    "part_5_dietary_exposure": 10_000,
    "part_4_safety":           12_000,
    "part_6_narrative":         8_000,
    "part_7_references":        4_000,
}

CHAR_BUDGET = 80_000


def _smart_truncate(text: str) -> str:
    """Split into sections, guarantee minimums for critical sections, fill remainder."""
    from pipeline.extract import SECTION_PATTERNS

    sections: dict[str, list[str]] = {s: [] for s in _SECTION_PRIORITY}
    current = "cover_letter"
    for line in text.splitlines():
        for pattern, label in SECTION_PATTERNS:
            if pattern.search(line):
                current = label
                break
        sections[current].append(line)

    blocks = {s: "\n".join(lines) for s, lines in sections.items()}

    parts = []
    remaining = CHAR_BUDGET
    truncated = []

    for section in _SECTION_PRIORITY:
        block = blocks.get(section, "")
        if not block.strip():
            continue

        minimum = _SECTION_MINIMUMS.get(section, 0)
        # Allocate at least the minimum if budget allows; otherwise take whatever is left
        alloc = max(minimum, min(remaining, len(block))) if remaining >= minimum else remaining
        alloc = min(alloc, len(block))

        if alloc <= 0:
            truncated.append(section)
            continue

        if len(block) <= alloc:
            parts.append(f"[{section.upper()}]\n{block}")
            remaining -= len(block)
        else:
            parts.append(f"[{section.upper()}]\n{block[:alloc]}\n[... truncated]")
            remaining -= alloc
            truncated.append(section)

        if remaining <= 0:
            break

    if truncated:
        print(f"  Sections truncated (low priority): {', '.join(truncated)}")

    return "\n\n".join(parts)


def _call_claude(text: str, max_tokens: int = 10000, char_budget: int = CHAR_BUDGET) -> dict:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    truncated = _smart_truncate(text) if char_budget == CHAR_BUDGET else text[:char_budget]
    prompt = ANALYSIS_PROMPT.format(
        text=truncated,
        char_count=f"{len(truncated):,} (smart-truncated from {len(text):,})",
        domain_schema=_DOMAIN_SCHEMA,
    )

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=max_tokens,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": prompt}],
        extra_headers={"anthropic-beta": "prompt-caching-2024-07-31"},
    )

    raw = message.content[0].text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        if max_tokens >= 14000:
            raise  # already retried at max, give up
        print(f"  JSON truncated at {max_tokens} tokens — retrying with {max_tokens + 4000} tokens and smaller input...")
        return _call_claude(text, max_tokens=max_tokens + 4000, char_budget=20000)


# Maps domain keys to the GRAS notice section most relevant for references
_DOMAIN_TO_SECTION = {
    "identity_and_characterization": "part_1_identity",
    "manufacturing_process":         "part_1_identity",
    "dietary_exposure":              "part_5_dietary_exposure",
    "safety_data":                   "part_4_safety",
    "general_availability":          "part_4_safety",
    "general_acceptance":            "part_3_gras_basis",
    "conditions_of_use":             "part_2_intended_use",
    "regulatory_submission":         "part_6_narrative",
}

_PRIORITY_ORDER = ["foundational", "material", "documentation_issue"]


def _compute_score_from_domains(domain_analysis: dict) -> tuple[int, dict]:
    """Score based on gaps actually found in domain analysis."""
    counts: dict[str, int] = {"foundational": 0, "material": 0, "documentation_issue": 0}
    for domain_data in domain_analysis.values():
        for gap in domain_data.get("gaps", []):
            p = gap.get("priority", "material")
            if p in counts:
                counts[p] += 1

    score = 100
    score -= min(counts["foundational"], 5) * 8
    score -= min(counts["material"], 7) * 4
    score -= min(counts["documentation_issue"], 8) * 1
    return max(score, 0), counts


def _build_gap_report_from_domains(domain_analysis: dict,
                                   approved: list, withdrawn: list) -> list[dict]:
    """Flat gap list derived from domain_analysis — consistent with score and domain view."""
    ref_approved = {"grn_number": approved[0]["grn_number"],
                    "substance_name": approved[0].get("substance_name", "")} if approved else None
    ref_withdrawn = {"grn_number": withdrawn[0]["grn_number"],
                     "substance_name": withdrawn[0].get("substance_name", "")} if withdrawn else None

    gaps = []
    for domain_key, domain_data in domain_analysis.items():
        section_key = _DOMAIN_TO_SECTION.get(domain_key, "part_1_identity")
        section_label = NOTICE_SECTION_LABELS.get(section_key, section_key)
        for gap in domain_data.get("gaps", []):
            ref = {**ref_approved, "section_key": section_key,
                   "section_label": section_label} if ref_approved else None
            gaps.append({
                "domain":      domain_key,
                "title":       gap.get("title", ""),
                "priority":    gap.get("priority", "material"),
                "gap_type":    gap.get("gap_type", ""),
                "section_reference": gap.get("section_reference", ""),
                "observation": gap.get("observation", ""),
                "approved_reference":  ref,
                "withdrawn_reference": ref_withdrawn,
            })

    gaps.sort(key=lambda g: _PRIORITY_ORDER.index(g["priority"])
              if g["priority"] in _PRIORITY_ORDER else 1)
    return gaps


def _build_comparative_analysis(approved: list, withdrawn: list) -> dict:
    """Similar notices with section waypoints stripped of raw chunk text."""
    def clean(notices):
        result = []
        for n in notices:
            entry = {k: v for k, v in n.items() if k != "chunks"}
            # Add section waypoints from the chunks that matched
            sections_seen = list(dict.fromkeys(
                c.get("section", "") for c in n.get("chunks", []) if c.get("section")
            ))
            entry["relevant_sections"] = [
                {"key": s, "label": NOTICE_SECTION_LABELS.get(s, s)}
                for s in sections_seen
            ]
            result.append(entry)
        return result

    return {
        "approved_notices": clean(approved),
        "withdrawn_notices": clean(withdrawn),
    }


def analyze(pdf_path: Path) -> dict:
    print("[1/5] Extracting text...")
    text = extract_text(pdf_path)
    if not text.strip():
        raise ValueError("No text could be extracted from the PDF.")

    print("[2/5] Running deep analysis with Claude...")
    analysis = _call_claude(text)

    summary = analysis.get("engagement_summary", {})

    print("[3/5] Retrieving similar notices...")
    query = " ".join(filter(None, [
        summary.get("substance_name", ""),
        summary.get("production_method", ""),
        summary.get("source_organism", ""),
    ]))
    similar = retrieve(query)
    approved = similar["approved_notices"]
    withdrawn = similar["withdrawn_notices"]

    print("[4/5] Scoring...")
    domain_analysis = analysis.get("domain_analysis", {})
    score, priority_counts = _compute_score_from_domains(domain_analysis)

    print("[5/5] Building report...")
    gap_report_items = _build_gap_report_from_domains(domain_analysis, approved, withdrawn)

    # Build consolidated gap summary across all domains
    consolidated = []
    for domain_key, domain_data in analysis.get("domain_analysis", {}).items():
        for gap in domain_data.get("gaps", []):
            consolidated.append({
                **gap,
                "domain": domain_key,
            })
    priority_order = ["foundational", "material", "documentation_issue"]
    consolidated.sort(
        key=lambda g: priority_order.index(g.get("priority", "material"))
        if g.get("priority") in priority_order else 1
    )

    return {
        "meta": {
            "report_version": "1.0",
            "analysis_date": date.today().isoformat(),
            "pdf_filename": pdf_path.name,
        },
        "engagement_summary": summary,
        "threshold_assessment": analysis.get("threshold_assessment", {}),
        "potential_safety_signals": analysis.get("potential_safety_signals", []),
        "domain_analysis": analysis.get("domain_analysis", {}),
        "consolidated_gap_summary": consolidated,
        "strengths_summary": analysis.get("strengths_summary", []),
        "gap_report": {
            "score": score,
            "priority_counts": priority_counts,
            "gaps": gap_report_items,
        },
        "comparative_analysis": _build_comparative_analysis(approved, withdrawn),
        "recommended_next_steps": analysis.get("recommended_next_steps", []),
        "limitations_and_caveats": analysis.get("limitations_and_caveats", ""),
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", help="Path to GRAS notice PDF")
    parser.add_argument("--out", help="Output path (default: same folder as PDF, stem + _Analysis.json)")
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    out_path = Path(args.out) if args.out else pdf_path.parent / (pdf_path.stem + "_Analysis.json")

    result = analyze(pdf_path)

    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"\nReport written to {out_path}")

    if True:
        # Terminal summary
        s = result["engagement_summary"]
        print("\n" + "=" * 70)
        print("SUBMISSION OVERVIEW")
        print("=" * 70)
        print(f"Substance : {s.get('substance_name')}")
        print(f"Notifier  : {s.get('notifier')}")
        print(f"Method    : {s.get('production_method')}")
        print(f"Organism  : {s.get('source_organism')}")
        print(f"Uses      : {', '.join(s.get('intended_uses') or [])}")
        print(f"Basis     : {s.get('gras_basis')}")
        print(f"Note      : {s.get('submission_completeness_note')}")

        signals = result["potential_safety_signals"]
        if signals:
            print("\n" + "=" * 70)
            print(f"POTENTIAL SAFETY SIGNALS ({len(signals)})")
            print("=" * 70)
            for sig in signals:
                print(f"  ⚠️  {sig['signal']}")
                print(f"     Evidence: {sig['evidence']}")
                print(f"     Section:  {sig['section_reference']}")

        gr = result["gap_report"]
        print("\n" + "=" * 70)
        print(f"COMPLETENESS SCORE: {gr['score']}/100")
        pc = gr['priority_counts']
        print(f"Gaps — foundational: {pc.get('foundational',0)}, material: {pc.get('material',0)}, documentation: {pc.get('documentation_issue',0)}")
        print("=" * 70)

        icons = {"critical": "⛔", "high": "⚠️", "medium": "\U0001f4a1"}
        current_sev = None
        for gap in gr["gaps"]:
            if gap["severity"] != current_sev:
                current_sev = gap["severity"]
                print(f"\n{current_sev.upper()} GAPS")
                print("-" * 40)
            icon = icons.get(gap["severity"], "•")
            ref = gap.get("approved_reference")
            ref_str = f" → See GRN {ref['grn_number']} {ref['section_label']}" if ref else ""
            print(f"{icon} {gap['title']}{ref_str}")

        print("\n" + "=" * 70)
        print("DOMAIN ANALYSIS HIGHLIGHTS")
        print("=" * 70)
        for domain, data in result["domain_analysis"].items():
            n_gaps = len(data.get("gaps", []))
            n_str = len(data.get("strengths", []))
            print(f"  {domain.replace('_', ' ').title()}: {n_str} strengths, {n_gaps} gaps")

        print("\n" + "=" * 70)
        print("SIMILAR NOTICES")
        print("=" * 70)
        ca = result["comparative_analysis"]
        print(f"{'APPROVED':<42} {'WITHDRAWN':<42}")
        print(f"{'-'*40:<42} {'-'*40:<42}")
        app = ca["approved_notices"]
        wit = ca["withdrawn_notices"]
        for i in range(max(len(app), len(wit))):
            a = app[i] if i < len(app) else {}
            w = wit[i] if i < len(wit) else {}
            a_str = f"GRN {a['grn_number']} — {str(a.get('substance_name',''))[:30]}" if a else ""
            w_str = f"GRN {w['grn_number']} — {str(w.get('substance_name',''))[:30]}" if w else ""
            print(f"{a_str:<42} {w_str:<42}")

        print(f"\nRun with --out report.json to save the full structured report.")
