"""Deep gap analysis for a user-uploaded GRAS notice PDF."""

import json
import os
import re
import sys
import time
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
if not os.environ.get("OPENAI_API_KEY") and os.environ.get("OPEN_AI_KEY"):
    os.environ["OPENAI_API_KEY"] = os.environ["OPEN_AI_KEY"]

import anthropic

sys.path.insert(0, str(Path(__file__).parent.parent))
from pipeline.extract import extract_text, detect_section
from backend.retrieve import retrieve
from constants.scoring import (
    BASE_SCORE,
    DOMAIN_PRIORITY,
    DOMAIN_PRIORITY_DEFAULT,
    GAP_DISPLAY_TITLES,
    SEVERITY_BASELINE,
    SEVERITY_PRESENT_CAPS,
    SEVERITY_PRESENT_POINTS,
    SEVERITY_UPGRADES,
)

SEVERITY_ORDER = ["critical", "high", "medium", "low"]


class AnalysisError(Exception):
    """Structured error with a machine-readable code for the API layer."""
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code    = code
        self.message = message


# Module-level Anthropic client — shared across calls for connection-pool reuse.
_anthropic_client: anthropic.Anthropic | None = None


def _get_anthropic_client() -> anthropic.Anthropic:
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = anthropic.Anthropic(
            api_key=os.environ["ANTHROPIC_API_KEY"],
            timeout=_CLAUDE_TIMEOUT,
        )
    return _anthropic_client

# Character budget for Claude input — PDFs beyond this are truncated with a marker.
_MAX_ANALYSIS_CHARS = 400_000

# Module-level sidecar cache — loaded once per process, not per analysis run.
_sidecar_cache: dict[str, list[dict]] = {}


def _load_sidecars_cached(directory: Path, status_value: str) -> list[dict]:
    key = str(directory)
    if key not in _sidecar_cache:
        result = []
        for json_path in directory.glob("*.json"):
            try:
                data = json.loads(json_path.read_text(encoding="utf-8"))
                if data.get("status") == status_value:
                    result.append(data)
            except Exception:
                pass
        _sidecar_cache[key] = result
    return _sidecar_cache[key]

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

BE CONCISE. Every observation field: max 60 words. Every summary field: max 40 words. Limit recommended_next_steps to 5 items. Limit strengths_summary to 5 items. Total response must stay under 14000 tokens.

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
  "strengths_summary": [{{"domain": "string", "observation": "string", "section_reference": "string"}}],
  "recommended_next_steps": [{{"priority": "foundational|material|documentation_issue", "action": "string", "domain": "string", "gap_title": "string", "fda_pushback_probability": "high|medium|low", "pushback_reasoning": "1 sentence: the specific pattern FDA typically challenges on this issue, grounded in what is present or absent in this submission"}}],
  "limitations_and_caveats": "string"
}}

Notice text ({char_count} characters):
{text}
"""




# Keywords that signal substantive presence of each documentation field.
# Multiple terms per field — ANY match (case-insensitive) marks the field present.
_FIELD_KEYWORDS: dict[str, list[str]] = {
    "dietary_exposure_estimate": [
        "dietary exposure", "estimated daily intake", "nhanes",
        "usda food", "mg/kg body weight", "mg/kg bw", "exposure estimate",
        "theoretical maximum", "consumption estimate", "per capita intake",
        "food consumption data", "intake estimate", "daily consumption",
        "exposure assessment", "intake assessment", "dietary intake estimate",
        "estimated intake", "consumption data", "food intake",
        "poundage data", "market share", "eating occasion",
        "part 5", "section 5", "total daily intake", "estimated total intake",
        "consumption modeling", "eaters only", "eaters-only", "total diet study",
        "food frequency", "intake modeling", "daily consumption estimate",
        "exposure modeling", "dietary survey", "consumption survey",
    ],
    "allergenicity_assessment": [
        "allergenicity", "allergenic", "allergen", "allerhunter", "farrp",
        "ige binding", "ige-binding", "homology search", "cross-reactive",
        "allergic sensitization", "allergy", "hypersensitivity",
        "sequence homology", "protein allergen", "allergic reaction",
        "sensitization potential", "bioinformatic", "sequence similarity",
        "blastp", "fasta search", "allergome", "protein homology",
        "amino acid homology", "allergenic protein",
    ],
    "genotoxicity_battery": [
        "genotoxicity", "genotoxic", "ames test", "bacterial reverse mutation",
        "chromosomal aberration", "micronucleus", "clastogenicity", "clastogenic",
        "mutagenicity", "mutagenic", "in vitro genetic", "genetic toxicology",
        "dna damage", "comet assay", "salmonella typhimurium",
        "mammalian cell", "mouse lymphoma", "genotoxicology",
        "in vitro micronucleus", "mouse lymphoma assay", "mla assay",
        "tk locus", "hprt assay", "unscheduled dna synthesis", "uds assay",
    ],
    "digestibility_data": [
        "digestibility", "digestible", "pepsin", "pancreatin",
        "in vitro digest", "gastrointestinal digest", "simulated gastric",
        "digestive stability", "proteolytic", "sgf", "sif",
        "simulated intestinal", "gastric fluid", "intestinal fluid",
        "protein digestibility", "pepsin digestibility", "simulated digestion",
        "gastrointestinal stability", "gut stability",
    ],
    "nutritional_impact": [
        "nutritional impact", "nutritional assessment", "nutritional contribution",
        "nutrient intake", "nutritional value", "macronutrient", "micronutrient",
        "caloric", "calorie", "protein content", "fat content",
        "carbohydrate", "fiber content", "amino acid", "fatty acid",
        "vitamin", "mineral content", "nutritional profile",
        "nutrition facts", "nutrient composition", "caloric contribution",
        "recommended daily", "daily value", "percent dv", "nutrient density",
        "macronutrient profile", "dietary contribution",
    ],
    "human_exposure_data": [
        "clinical trial", "human study", "human clinical", "clinical study",
        "human subjects", "human consumption", "human volunteer",
        "randomized controlled", "human intervention", "human data",
        "human safety", "tolerability study", "bioavailability study",
        "pharmacokinetic", "human pharmacology", "human trial",
        "open-label study", "crossover study", "double-blind",
        "human tolerability", "clinical evaluation",
    ],
    "history_of_safe_use": [
        "history of safe use", "history of use", "traditional use",
        "conventional food", "prior to 1958", "pre-1958", "pre 1958",
        "safe use in food", "years of consumption", "long history",
        "traditional food", "centuries", "decades of use", "long-standing use",
        "widely consumed", "common use", "documented use", "food use history",
        "common use in food", "traditional food ingredient",
        "long-standing food use", "historical use", "established use",
    ],
}

# Terms used to verify the uploaded PDF is actually a GRAS notice.
_GRAS_MARKER_TERMS = [
    "generally recognized as safe", "gras notice", "gras determination",
    "gras basis", "gras conclusion", "grn",
]
_FDA_MARKER_TERMS = [
    "food and drug administration", "fda", "21 cfr", "federal register",
]
_STRUCTURE_MARKER_TERMS = [
    "part 1", "part 2", "part 3", "intended use",
    "dietary exposure", "safety assessment", "manufacturing process",
]


def _validate_gras_notice(text: str) -> tuple[bool, str]:
    """Heuristic check that the uploaded PDF looks like a GRAS notice."""
    lower = text.lower()
    gras_hits   = sum(1 for t in _GRAS_MARKER_TERMS   if t in lower)
    fda_hits    = sum(1 for t in _FDA_MARKER_TERMS    if t in lower)
    struct_hits = sum(1 for t in _STRUCTURE_MARKER_TERMS if t in lower)
    if gras_hits == 0 and fda_hits == 0:
        return False, (
            "The uploaded document does not appear to be an FDA GRAS notice — "
            "no GRAS or FDA terminology was detected. "
            "Please upload a GRAS notice draft in standard Parts 1–7 format."
        )
    if gras_hits == 0 and struct_hits < 2:
        return False, (
            "The uploaded document may not be a complete FDA GRAS notice. "
            "GRAS-specific terminology is absent. "
            "Please verify you uploaded the correct file."
        )
    return True, ""


def _split_text_by_section(text: str) -> dict[str, str]:
    """Bucket document text by Part section using header detection."""
    buckets: dict[str, list[str]] = {}
    current = "cover_letter"
    for line in text.splitlines():
        detected = detect_section(line)
        if detected:
            current = detected
        buckets.setdefault(current, []).append(line)
    return {k: "\n".join(v).lower() for k, v in buckets.items()}


def _check_field_presence(text: str) -> dict:
    """Keyword scan scoped to the document section where each field belongs.

    Falls back to full-text scan if the target section is absent or too short
    (< 300 chars), which handles notices that don't follow standard Part headers.
    """
    full_lower = text.lower()
    section_texts = _split_text_by_section(text)
    result = {}
    for field, keywords in _FIELD_KEYWORDS.items():
        target_section = GAP_TO_NOTICE_SECTION.get(field)
        scoped = section_texts.get(target_section, "") if target_section else ""
        search_text = scoped if len(scoped) >= 300 else full_lower
        result[field] = any(kw in search_text for kw in keywords)
        print(f"  [field_presence] {field}: {result[field]} "
              f"({'section:' + target_section if len(scoped) >= 300 else 'full-text'})")
    return result


def _applicable_fields(engagement_summary: dict) -> dict[str, bool]:
    """Which of the 7 benchmark fields are applicable for this filing type."""
    gras_basis = engagement_summary.get("gras_basis", "scientific_procedures")
    return {
        "dietary_exposure_estimate": True,
        "allergenicity_assessment":  True,
        "genotoxicity_battery":      True,
        "digestibility_data":        True,
        "nutritional_impact":        True,
        "human_exposure_data":       True,
        "history_of_safe_use":       gras_basis == "common_use_prior_1958",
    }


_CLAUDE_TIMEOUT = 600.0  # seconds before giving up on a single API call
_TRANSIENT_RETRY_MAX = 3


def _call_claude(text: str, max_tokens: int = 16000, _attempt: int = 0) -> dict:
    client = _get_anthropic_client()

    # Escape curly braces in PDF text so str.format() doesn't misparse them
    # as format placeholders (e.g. tables or formulas like "{EC 3.2.1.4}").
    safe_text = text.replace("{", "{{").replace("}", "}}")
    prompt = ANALYSIS_PROMPT.format(
        text=safe_text,
        char_count=f"{len(text):,}",
        domain_schema=_DOMAIN_SCHEMA,
    )

    try:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=max_tokens,
            temperature=0,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": prompt}],
            extra_headers={"anthropic-beta": "prompt-caching-2024-07-31,output-128k-2025-02-19"},
        )
    except (anthropic.APIConnectionError, anthropic.RateLimitError) as exc:
        if _attempt >= _TRANSIENT_RETRY_MAX:
            raise AnalysisError("api_error", f"Claude API unavailable after {_TRANSIENT_RETRY_MAX} retries: {exc}")
        wait = 2 ** _attempt + 1
        print(f"  [{exc.__class__.__name__}] — retrying in {wait}s (attempt {_attempt + 1}/{_TRANSIENT_RETRY_MAX})...")
        time.sleep(wait)
        return _call_claude(text, max_tokens=max_tokens, _attempt=_attempt + 1)
    except anthropic.APIStatusError as exc:
        if exc.status_code in (429, 529) and _attempt < _TRANSIENT_RETRY_MAX:
            wait = 2 ** _attempt + 1
            print(f"  [HTTP {exc.status_code}] API busy — retrying in {wait}s (attempt {_attempt + 1}/{_TRANSIENT_RETRY_MAX})...")
            time.sleep(wait)
            return _call_claude(text, max_tokens=max_tokens, _attempt=_attempt + 1)
        raise AnalysisError("api_error", f"Claude API error {exc.status_code}: {exc.message}")

    raw = message.content[0].text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        if max_tokens >= 24000:
            raise
        print(f"  JSON truncated at {max_tokens} tokens — retrying with {max_tokens + 4000} tokens...")
        return _call_claude(text, max_tokens=max_tokens + 4000)


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
    """Penalty score: 0 = no gaps (best), higher = more/worse gaps."""
    counts: dict[str, int] = {"foundational": 0, "material": 0, "documentation_issue": 0}
    for domain_data in domain_analysis.values():
        for gap in domain_data.get("gaps", []):
            p = gap.get("priority", "material")
            if p in counts:
                counts[p] += 1

    score = counts["foundational"] * 10 + counts["material"] * 5 + counts["documentation_issue"] * 1
    return score, counts


def _best_notice_for_section(notices: list, target_section: str) -> dict | None:
    """Pick the notice most relevant to target_section from the candidate pool.

    Primary sort: most chunks whose section matches target_section (descending).
    Tiebreaker: lowest average chunk distance (ascending).
    This ensures section relevance dominates and distance only breaks ties.
    """
    if not notices:
        return None

    def sort_key(notice):
        section_hits = sum(
            1 for c in notice.get("chunks", []) if c.get("section") == target_section
        )
        avg_distance = (
            sum(c["distance"] for c in notice["chunks"]) / len(notice["chunks"])
            if notice["chunks"] else 1.0
        )
        return (-section_hits, avg_distance)  # most hits first, closest second

    return min(notices, key=sort_key)


def _build_gap_report_from_domains(domain_analysis: dict,
                                   approved: list, withdrawn: list) -> list[dict]:
    """Flat gap list derived from domain_analysis — consistent with score and domain view.

    Each gap gets its own approved/withdrawn reference chosen by matching the
    gap's domain section against the sections present in each notice's chunks,
    so different gaps cite the most topically relevant example notices.
    """
    # Precompute best notice per section key — avoids O(gaps) repeated sorts
    used_sections = {_DOMAIN_TO_SECTION.get(d, "part_1_identity") for d in domain_analysis}
    best_approved_by_section  = {s: _best_notice_for_section(approved,  s) for s in used_sections}
    best_withdrawn_by_section = {s: _best_notice_for_section(withdrawn, s) for s in used_sections}

    gaps = []
    for domain_key, domain_data in domain_analysis.items():
        section_key = _DOMAIN_TO_SECTION.get(domain_key, "part_1_identity")
        section_label = NOTICE_SECTION_LABELS.get(section_key, section_key)

        best_approved  = best_approved_by_section[section_key]
        best_withdrawn = best_withdrawn_by_section[section_key]

        ref_approved = (
            {"grn_number": best_approved["grn_number"],
             "substance_name": best_approved.get("substance_name", ""),
             "section_key": section_key,
             "section_label": section_label}
            if best_approved else None
        )
        ref_withdrawn = (
            {"grn_number": best_withdrawn["grn_number"],
             "substance_name": best_withdrawn.get("substance_name", "")}
            if best_withdrawn else None
        )

        domain_priority = DOMAIN_PRIORITY.get(domain_key, DOMAIN_PRIORITY_DEFAULT)
        for gap in domain_data.get("gaps", []):
            gaps.append({
                "domain":      domain_key,
                "title":       gap.get("title", ""),
                "priority":    domain_priority,
                "gap_type":    gap.get("gap_type", ""),
                "section_reference": gap.get("section_reference", ""),
                "observation": gap.get("observation", ""),
                "approved_reference":  ref_approved,
                "withdrawn_reference": ref_withdrawn,
            })

    gaps.sort(key=lambda g: _PRIORITY_ORDER.index(g["priority"])
              if g["priority"] in _PRIORITY_ORDER else 1)
    return gaps


# ─── Benchmark: corpus baseline + peer comparison ─────────────────────────────

# The 7 gap fields reliably inferrable from sidecar metadata.
# Remaining 9 fields require full Claude analysis and are not in the corpus baseline.
_BENCHMARKABLE_FIELDS = [
    "dietary_exposure_estimate",
    "allergenicity_assessment",
    "genotoxicity_battery",
    "digestibility_data",
    "nutritional_impact",
    "human_exposure_data",
    "history_of_safe_use",
]

_BENCHMARK_LABELS = {
    "dietary_exposure_estimate": "Dietary Exposure Estimate",
    "allergenicity_assessment":  "Allergenicity Assessment",
    "genotoxicity_battery":      "Genotoxicity Battery",
    "digestibility_data":        "Digestibility Data",
    "nutritional_impact":        "Nutritional Impact",
    "human_exposure_data":       "Human Exposure Data",
    "history_of_safe_use":       "History of Safe Use",
}

# Weights for the 7 benchmarkable fields drawn from SEVERITY_BASELINE.
# Scale: critical=10, high=5, medium=1 — matches the gap penalty scale.
_BENCHMARKABLE_WEIGHTS = {
    "dietary_exposure_estimate": 10,  # critical
    "allergenicity_assessment":  10,  # critical
    "genotoxicity_battery":      10,  # critical
    "digestibility_data":         1,  # medium
    "nutritional_impact":         1,  # medium
    "human_exposure_data":         1,  # medium
    "history_of_safe_use":         1,  # medium
}
_MAX_BENCHMARK_WEIGHT = sum(_BENCHMARKABLE_WEIGHTS.values())  # 34

_KNOWN_PRODUCTION_METHODS = [
    "precision_fermentation", "solid_state_fermentation", "submerged_fermentation",
    "traditional_fermentation", "cell_culture", "plant_cell_culture", "extraction",
    "enzymatic", "chemical_synthesis", "hydrolysis", "fractionation",
    "electrospinning", "air_fermentation", "algal_cultivation",
]


def _proxy_score(field_presence: dict, applicable: dict | None = None) -> float:
    """Weighted field-absence penalty, normalized 0–1. Lower is better.

    If applicable is provided, non-applicable fields are excluded from both
    numerator and denominator so the score is fair across filing types.
    """
    total = 0
    missing = 0
    for f in _BENCHMARKABLE_FIELDS:
        if applicable is not None and not applicable.get(f, True):
            continue
        w = _BENCHMARKABLE_WEIGHTS[f]
        total += w
        if not field_presence.get(f):
            missing += w
    return round(missing / total, 3) if total else 0.0


def _match_production_method(pm_text: str) -> str | None:
    pm_lower = pm_text.lower().replace("-", " ")
    for pm in _KNOWN_PRODUCTION_METHODS:
        if pm.replace("_", " ") in pm_lower:
            return pm
    return None


def _sidecar_field_presence(sidecar: dict) -> dict[str, bool]:
    """Map approved sidecar JSON (list-form safety_data_available) to gap field booleans."""
    sd = set(sidecar.get("safety_data_available") or [])
    return {
        "dietary_exposure_estimate": bool(sidecar.get("exposure_estimate_included")),
        "allergenicity_assessment":  bool(sidecar.get("allergenicity_addressed")),
        "genotoxicity_battery":      bool(sd & {"genotoxicity_ames", "genotoxicity_chromosomal"}),
        "digestibility_data":        "digestibility_study" in sd,
        "nutritional_impact":        "nutritional_impact" in sd,
        "human_exposure_data":       "human_clinical_trial" in sd,
        "history_of_safe_use":       "history_of_safe_use" in sd,
    }


def _peer_field_presence(notice_meta: dict) -> dict[str, bool]:
    """Map ChromaDB notice metadata (string-form safety_data_available) to gap field booleans."""
    sd_str = notice_meta.get("safety_data_available", "")
    sd = {v.strip() for v in sd_str.split(",")} if sd_str else set()
    return {
        "dietary_exposure_estimate": bool(notice_meta.get("exposure_estimate_included")),
        "allergenicity_assessment":  bool(notice_meta.get("allergenicity_addressed")),
        "genotoxicity_battery":      bool(sd & {"genotoxicity_ames", "genotoxicity_chromosomal"}),
        "digestibility_data":        "digestibility_study" in sd,
        "nutritional_impact":        "nutritional_impact" in sd,
        "human_exposure_data":       "human_clinical_trial" in sd,
        "history_of_safe_use":       "history_of_safe_use" in sd,
    }


def _build_benchmark(
    engagement_summary: dict,
    gap_field_presence: dict,
    approved_peers: list,
) -> dict:
    """Build corpus baseline (Option A) and peer comparison (Option B) with proxy scores."""
    pm_text = engagement_summary.get("production_method", "")
    pm_match = _match_production_method(pm_text)


    approved_sidecars  = _load_sidecars_cached(Path("data/notices/Approved"),  "no_questions")
    withdrawn_sidecars = _load_sidecars_cached(Path("data/notices/Withdrawn"), "withdrawn")

    # Option A: corpus baseline — filter approved to matching production method
    category = [s for s in approved_sidecars if pm_match and s.get("production_method") == pm_match]
    if len(category) >= 5:
        category_label = f"{pm_match.replace('_', ' ')} ({len(category)} approved notices)"
    else:
        category = approved_sidecars
        category_label = f"all approved ({len(category)} notices)"

    corpus_fields = {}
    for field in _BENCHMARKABLE_FIELDS:
        n = sum(1 for s in category if _sidecar_field_presence(s).get(field))
        corpus_fields[field] = {
            "rate": round(n / len(category), 3) if category else 0.0,
            "count": n,
            "n": len(category),
        }

    applicable = _applicable_fields(engagement_summary)

    # Proxy scores: current notice vs approved category vs all withdrawn
    # All three use the same applicable-field mask so scores are comparable.
    current_proxy    = _proxy_score(gap_field_presence, applicable)
    approved_scores  = [_proxy_score(_sidecar_field_presence(s), applicable) for s in category]
    withdrawn_scores = [_proxy_score(_sidecar_field_presence(s), applicable) for s in withdrawn_sidecars]
    approved_mean  = round(sum(approved_scores)  / len(approved_scores),  3) if approved_scores  else 0.0
    withdrawn_mean = round(sum(withdrawn_scores) / len(withdrawn_scores), 3) if withdrawn_scores else 0.0

    # Option B: peer comparison from top retrieved approved notices
    peer_fields = {}
    for field in _BENCHMARKABLE_FIELDS:
        n = sum(1 for p in approved_peers if _peer_field_presence(p).get(field))
        peer_fields[field] = {
            "peer_count": n,
            "n_peers": len(approved_peers),
            "peer_rate": round(n / len(approved_peers), 3) if approved_peers else 0.0,
        }

    return {
        "applicable_fields": applicable,
        "proxy_score": {
            "current":        current_proxy,
            "approved_mean":  approved_mean,
            "withdrawn_mean": withdrawn_mean,
            "n_approved":     len(category),
            "n_withdrawn":    len(withdrawn_sidecars),
            "note": "Weighted field-absence penalty (7 of 16 fields; critical=10, medium=1). Lower is better. Not equivalent to the full analysis score.",
        },
        "corpus_baseline": {
            "category_label": category_label,
            "n_notices": len(category),
            "fields": corpus_fields,
            "coverage_note": "Rates cover 7 of 16 gap fields reliably inferrable from pipeline metadata.",
        },
        "peer_comparison": {
            "n_peers": len(approved_peers),
            "fields": peer_fields,
        },
    }


_PUSHBACK_ORDER = {"high": 0, "medium": 1, "low": 2}


def _enrich_next_steps(next_steps: list, withdrawn: list) -> list:
    """Attach the most relevant withdrawn GRN to each step and sort by pushback probability."""
    for step in next_steps:
        section_key = _DOMAIN_TO_SECTION.get(step.get("domain", ""), "part_4_safety")
        best = _best_notice_for_section(withdrawn, section_key)
        step["withdrawn_reference"] = (
            {"grn_number": best["grn_number"],
             "substance_name": best.get("substance_name", "")}
            if best else None
        )
    next_steps.sort(
        key=lambda s: _PUSHBACK_ORDER.get(s.get("fda_pushback_probability", "medium"), 1)
    )
    return next_steps


def _build_comparative_analysis(approved: list, withdrawn: list) -> dict:
    """Top-3 similar notices per status for the UI overview section."""
    def clean(notices):
        result = []
        for n in notices[:5]:  # cap at 5 for display; full pool used for per-gap refs
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


def analyze(pdf_path: Path, on_progress=None) -> dict:
    def _progress(step: str, label: str):
        print(f"[{label}]", flush=True)
        if on_progress:
            on_progress(step)

    _progress("extracting", "1/5 Extracting text")
    text, skipped_pages = extract_text(pdf_path, return_stats=True)
    if not text.strip():
        raise AnalysisError("no_text", "No text could be extracted from the PDF. It may be a scanned image-only document.")

    valid, msg = _validate_gras_notice(text)
    if not valid:
        raise AnalysisError("invalid_document", msg)

    truncated = len(text) > _MAX_ANALYSIS_CHARS
    if truncated:
        print(f"  Document truncated: {len(text):,} chars → {_MAX_ANALYSIS_CHARS:,} chars", flush=True)
        text = text[:_MAX_ANALYSIS_CHARS] + "\n\n[... truncated: document exceeded analysis input budget]"

    _progress("analyzing", "2/5 Running deep analysis with Claude")
    analysis = _call_claude(text)

    summary = analysis.get("engagement_summary", {})

    _progress("retrieving", "3/5 Retrieving similar notices")
    query = " ".join(filter(None, [
        summary.get("substance_name", ""),
        summary.get("production_method", ""),
        summary.get("source_organism", ""),
    ]))
    similar   = retrieve(query, top_notices=10, chunks_per_status=300)
    approved  = similar["approved_notices"]
    withdrawn = similar["withdrawn_notices"]

    _progress("benchmarking", "4/5 Scoring and benchmarking")
    domain_analysis = analysis.get("domain_analysis", {})
    score, priority_counts = _compute_score_from_domains(domain_analysis)
    field_presence = _check_field_presence(text)
    benchmark = _build_benchmark(summary, field_presence, approved)

    _progress("finalizing", "5/5 Building gap report")
    gap_report_items = _build_gap_report_from_domains(domain_analysis, approved, withdrawn)

    # Build consolidated gap summary; enrich with reference notices from gap_report_items
    ref_lookup = {g["title"]: g for g in gap_report_items}
    consolidated = []
    priority_order = ["foundational", "material", "documentation_issue"]
    for domain_key, domain_data in domain_analysis.items():
        for gap in domain_data.get("gaps", []):
            ref = ref_lookup.get(gap.get("title"), {})
            consolidated.append({
                **gap,
                "domain":               domain_key,
                "approved_reference":   ref.get("approved_reference"),
                "withdrawn_reference":  ref.get("withdrawn_reference"),
            })
    consolidated.sort(
        key=lambda g: priority_order.index(g.get("priority", "material"))
        if g.get("priority") in priority_order else 1
    )

    return {
        "meta": {
            "report_version": "1.0",
            "analysis_date":  date.today().isoformat(),
            "pdf_filename":   pdf_path.name,
            "truncated":      truncated,
            "skipped_pages":  skipped_pages,
        },
        "engagement_summary":      summary,
        "threshold_assessment":    analysis.get("threshold_assessment", {}),
        "potential_safety_signals": analysis.get("potential_safety_signals", []),
        "domain_analysis":         analysis.get("domain_analysis", {}),
        "consolidated_gap_summary": consolidated,
        "strengths_summary":       analysis.get("strengths_summary", []),
        "gap_report": {
            "score":           score,
            "priority_counts": priority_counts,
        },
        "benchmark":              benchmark,
        "gap_field_presence":     field_presence,
        "comparative_analysis":   _build_comparative_analysis(approved, withdrawn),
        "recommended_next_steps": _enrich_next_steps(analysis.get("recommended_next_steps", []), withdrawn),
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
        print(f"GAP SCORE: {gr['score']}  (lower is better; 0 = no gaps)")
        pc = gr['priority_counts']
        print(f"  foundational ×3: {pc.get('foundational',0)}  |  material ×2: {pc.get('material',0)}  |  documentation ×1: {pc.get('documentation_issue',0)}")
        print("=" * 70)

        icons = {"foundational": "⛔", "material": "⚠️", "documentation_issue": "\U0001f4a1"}
        current_pri = None
        for gap in gr["gaps"]:
            pri = gap.get("priority", "material")
            if pri != current_pri:
                current_pri = pri
                print(f"\n{current_pri.upper()} GAPS")
                print("-" * 40)
            icon = icons.get(pri, "•")
            ref = gap.get("approved_reference")
            ref_str = f" → See GRN {ref['grn_number']}" if ref else ""
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

        bm = result["benchmark"]
        cb = bm["corpus_baseline"]
        pc_bm = bm["peer_comparison"]
        ps = bm["proxy_score"]
        gfp = field_presence
        print("\n" + "=" * 70)
        print("BENCHMARK vs. APPROVED CORPUS")
        print("=" * 70)
        print(f"Category: {cb['category_label']}")
        print()
        print(f"  Proxy gap score (7 fields, lower is better):")
        print(f"    Your notice:    {ps['current']:.0%}")
        print(f"    Approved avg:   {ps['approved_mean']:.0%}  (n={ps['n_approved']})")
        print(f"    Withdrawn avg:  {ps['withdrawn_mean']:.0%}  (n={ps['n_withdrawn']})")
        print()
        print(f"{'Field':<32} {'Yours':>6}  {'Corpus':>7}  {'Peers':>10}")
        print("-" * 60)
        for field in _BENCHMARKABLE_FIELDS:
            label = _BENCHMARK_LABELS[field]
            yours = "✓" if gfp.get(field) else "✗"
            corpus_rate = cb["fields"][field]["rate"]
            pf = pc_bm["fields"][field]
            peer_str = f"{pf['peer_count']}/{pf['n_peers']}"
            print(f"  {label:<30} {yours:>6}  {corpus_rate:>6.0%}  {peer_str:>10}")
        print(f"  (7 of 16 fields benchmarkable from corpus metadata)")
        print(f"  Note: proxy score ≠ analysis score — field presence only, not gap depth.")

        print(f"\nRun with --out report.json to save the full structured report.")
