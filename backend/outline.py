"""Generate a Word (.docx) amendment outline from a GRAS gap analysis result."""

import io
import logging
import os

from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH

_SECTION_ORDER = [
    ("part_1_identity",         "Part 1 - Identity, Method of Manufacture & Specifications"),
    ("part_2_intended_use",     "Part 2 - Intended Use"),
    ("part_3_gras_basis",       "Part 3 - GRAS Basis"),
    ("part_4_safety",           "Part 4 - Safety"),
    ("part_5_dietary_exposure", "Part 5 - Dietary Exposure"),
    ("part_6_narrative",        "Part 6 - Narrative / GRAS Conclusion"),
]

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

_PRIORITY_LABEL = {
    "foundational":        "CRITICAL",
    "material":            "MODERATE",
    "documentation_issue": "MINOR",
}

_PRIORITY_COLOR = {
    "foundational":        RGBColor(0xC0, 0x00, 0x00),
    "material":            RGBColor(0xFF, 0x95, 0x00),
    "documentation_issue": RGBColor(0x60, 0x60, 0x60),
}


def _normalize_domain(domain: str) -> str:
    return domain.lower().replace(" ", "_").replace("-", "_")


def _ask_claude(prompt: str) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.content[0].text.strip()


def _build_section_gaps(result: dict) -> dict:
    gaps = result.get("consolidated_gap_summary", [])
    by_section = {k: [] for k, _ in _SECTION_ORDER}
    for gap in gaps:
        raw = gap.get("domain", "")
        norm = _normalize_domain(raw)
        section = _DOMAIN_TO_SECTION.get(norm) or _DOMAIN_TO_SECTION.get(raw, "part_4_safety")
        by_section.setdefault(section, []).append(gap)
    return by_section



def _strip_markdown(text: str) -> str:
    import re
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\*{1,3}([^*]+)\*{1,3}", r"\1", text)
    text = re.sub(r"_{1,3}([^_]+)_{1,3}", r"\1", text)
    text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[-*_]{3,}\s*$", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _generate_section_prose(substance: str, section_label: str, gaps: list) -> str:
    gap_lines = []
    for g in gaps:
        lbl = _PRIORITY_LABEL.get(g.get("priority", "material"), "MODERATE")
        title = g.get("title", "")
        obs = g.get("observation", "")
        gap_lines.append(f"- [{lbl}] {title}: {obs}")
    gap_block = "\n".join(gap_lines)
    prompt = (
        "You are a regulatory consultant drafting a supplemental GRAS filing amendment for " + substance + ".\n\n"
        "Section: " + section_label + "\n\n"
        "Gaps to address:\n" + gap_block + "\n\n"
        "Write 2-4 concise paragraphs explaining exactly what this section of the amendment should contain "
        "to close these gaps. Be specific: name the studies, methodologies, data types, and standards (e.g. "
        "OECD 471, ICH Q3D) that FDA expects to see. Write in the imperative. "
        "IMPORTANT: Plain prose only. No markdown, no asterisks, no pound signs, no bullet points, no headers, no dashes as list markers. "
        "Separate paragraphs with a blank line."
    )
    return _ask_claude(prompt)


def _style_heading(para, level: int, text: str):
    para.clear()
    run = para.add_run(text)
    run.bold = True
    if level == 1:
        run.font.size = Pt(14)
        run.font.color.rgb = RGBColor(0x1F, 0x49, 0x7D)
    else:
        run.font.size = Pt(12)
        run.font.color.rgb = RGBColor(0x2E, 0x74, 0xB5)


def generate_outline_doc(result: dict) -> bytes:
    es = result.get("engagement_summary", {})
    substance = es.get("substance_name", "Unknown Substance")
    gras_basis = es.get("gras_basis", "scientific_procedures").replace("_", " ")
    gaps_by_section = _build_section_gaps(result)
    total_gaps = sum(len(v) for v in gaps_by_section.values())
    counts = result.get("gap_report", {}).get("priority_counts", {})

    doc = Document()
    for sec in doc.sections:
        sec.top_margin = sec.bottom_margin = Inches(1)
        sec.left_margin = sec.right_margin = Inches(1.25)

    # Title block
    t = doc.add_paragraph()
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = t.add_run("Supplemental GRAS Filing Amendment Outline")
    r.bold = True
    r.font.size = Pt(18)
    r.font.color.rgb = RGBColor(0x1F, 0x49, 0x7D)

    s = doc.add_paragraph()
    s.alignment = WD_ALIGN_PARAGRAPH.CENTER
    s.add_run(substance).font.size = Pt(13)

    m = doc.add_paragraph()
    m.alignment = WD_ALIGN_PARAGRAPH.CENTER
    mr = m.add_run("GRAS basis: " + gras_basis + "   |   " + str(total_gaps) + " gaps identified   |   Generated by Greenlit AI")
    mr.font.size = Pt(10)
    mr.font.color.rgb = RGBColor(0x80, 0x80, 0x80)
    doc.add_paragraph()

    # Executive summary
    _style_heading(doc.add_paragraph(), 1, "Executive Summary")
    exec_para = doc.add_paragraph(
        "This outline identifies " + str(total_gaps) + " documentation gaps requiring remediation before "
        "the GRAS notice for " + substance + " is likely to receive no-objection status. "
        "Critical gaps (" + str(counts.get("foundational", 0)) + ") require new laboratory data and carry the highest FDA pushback risk. "
        "Moderate gaps (" + str(counts.get("material", 0)) + ") can often be addressed by augmenting existing studies. "
        "Minor documentation issues (" + str(counts.get("documentation_issue", 0)) + ") require editorial corrections only."
    )
    exec_para.style = doc.styles["Normal"]
    exec_para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    doc.add_paragraph()

    # Section-by-section
    first_section = True
    for section_key, section_label in _SECTION_ORDER:
        gaps = gaps_by_section.get(section_key, [])
        if not first_section:
            doc.add_page_break()
        first_section = False
        _style_heading(doc.add_paragraph(), 1, section_label)

        if not gaps:
            doc.add_paragraph("No gaps identified for this section.").style = doc.styles["Normal"]
            doc.add_paragraph()
            continue

        tbl = doc.add_table(rows=1, cols=3)
        tbl.style = "Table Grid"
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement
        hdr = tbl.rows[0].cells
        for i, txt in enumerate(["Gap", "Priority", "Domain"]):
            hdr[i].text = txt
            hdr[i].paragraphs[0].runs[0].bold = True
        for gap in gaps:
            new_row = tbl.add_row()
            # Prevent row from breaking across pages
            tr = new_row._tr
            trPr = tr.get_or_add_trPr()
            cantSplit = OxmlElement("w:cantSplit")
            trPr.append(cantSplit)
            row = new_row.cells
            row[0].text = gap.get("title", "")
            priority = gap.get("priority", "material")
            row[1].text = _PRIORITY_LABEL.get(priority, priority)
            color = _PRIORITY_COLOR.get(priority, RGBColor(0x40, 0x40, 0x40))
            for p in row[1].paragraphs:
                for run in p.runs:
                    run.font.color.rgb = color
                    run.bold = True
            row[2].text = gap.get("domain", "").replace("_", " ")

        doc.add_paragraph()
        _style_heading(doc.add_paragraph(), 2, "What This Section Must Address")
        try:
            prose = _generate_section_prose(substance, section_label, gaps)
            prose = _strip_markdown(prose)
            for para_text in prose.split("\n\n"):
                para_text = para_text.strip()
                if para_text:
                    p = doc.add_paragraph(para_text, style="Normal")
                    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        except Exception:
            logging.warning("Claude prose failed for %s", section_key, exc_info=True)
            doc.add_paragraph("[Content generation unavailable.]").style = doc.styles["Normal"]
        doc.add_paragraph()

    # Action items
    next_steps = result.get("recommended_next_steps", [])
    if next_steps:
        doc.add_page_break()
        _style_heading(doc.add_paragraph(), 1, "Prioritized Action Items")
        prob_map = {"high": "foundational", "medium": "material", "low": "documentation_issue"}
        for step in next_steps:
            prob = step.get("fda_pushback_probability", "medium")
            p = doc.add_paragraph(style="List Number")
            rl = p.add_run("[" + prob.upper() + " RISK] ")
            rl.bold = True
            rl.font.color.rgb = _PRIORITY_COLOR.get(prob_map.get(prob, "material"), RGBColor(0x40, 0x40, 0x40))
            p.add_run(step.get("gap_title", "") + ": " + step.get("action", ""))

    # Disclaimer
    doc.add_paragraph()
    disc = doc.add_paragraph(
        "This outline was generated by Greenlit AI based on automated analysis of the submitted GRAS notice. "
        "It does not constitute legal or regulatory advice. All recommendations should be reviewed by a "
        "qualified regulatory consultant before submission to FDA."
    )
    for run in disc.runs:
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(0x80, 0x80, 0x80)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
