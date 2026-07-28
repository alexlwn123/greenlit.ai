import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  type DeepAnalysisResult,
  DeepAnalysisResultSchema,
} from "../../../packages/core/src/index.js"
import { externalModelRequestError } from "./external-model-policy.js"
import { modelProcessingStatus, requestExternalModel } from "./model-gateway.js"
import type { ExtractedPdfPage } from "./pdf.js"

export type DeepAnalyzer = (input: {
  filingName: string
  pages: ExtractedPdfPage[]
  cacheDir?: string
}) => Promise<DeepAnalysisResult>

const maxAnalysisCharacters = 400_000
const defaultModel = "claude-sonnet-4-6"
const deepCacheVersion = "deep-evidence-v1-targeted-context-no-research-v1"
export const targetedContextPageLimit = 500
type AnthropicUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}
type AnthropicPayload = {
  content?: Array<{ type?: string; text?: string }>
  usage?: AnthropicUsage
}
const citationSchema = {
  type: "object",
  properties: {
    pageNumber: { type: "integer" },
    excerpt: { type: "string" },
    section: { type: "string" },
  },
  required: ["pageNumber", "excerpt", "section"],
  additionalProperties: false,
} as const
const filingProfileSchema = {
  type: "object",
  properties: {
    substanceName: { type: "string" },
    notifier: { type: "string" },
    status: { type: "string" },
    substanceType: {
      type: "string",
      enum: [
        "carbohydrate",
        "additive",
        "enzyme",
        "protein",
        "probiotic",
        "lipid",
        "flavoring_agent",
        "microorganism",
        "vitamin",
        "biomass",
        "colorant",
        "mineral",
        "plant",
        "extract",
        "amino_acid",
        "other",
      ],
    },
    productionMethod: {
      type: "string",
      enum: [
        "submerged_fermentation",
        "extraction",
        "precision_fermentation",
        "enzymatic",
        "chemical_synthesis",
        "algal_cultivation",
        "fractionation",
        "fermentation",
        "hydrolysis",
        "solid_state_fermentation",
        "plant_cell_culture",
        "traditional_fermentation",
        "microbial_fermentation",
        "cell_culture",
        "other",
        "unknown",
      ],
    },
    sourceOrganismType: { type: "string" },
    sourceOrganismName: { type: "string" },
    intendedUses: { type: "array", items: { type: "string" } },
    targetPopulation: { type: "string" },
    grasBasis: { type: "string" },
    safetyDataAvailable: { type: "array", items: { type: "string" } },
    dietaryExposureMethod: { type: "string" },
  },
  required: [
    "substanceName",
    "notifier",
    "status",
    "substanceType",
    "productionMethod",
    "sourceOrganismType",
    "sourceOrganismName",
    "intendedUses",
    "targetPopulation",
    "grasBasis",
    "safetyDataAvailable",
    "dietaryExposureMethod",
  ],
  additionalProperties: false,
} as const

export const deepAnalysisOutputSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    filingProfile: filingProfileSchema,
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          category: {
            type: "string",
            enum: [
              "incorporation_independent_conclusions",
              "public_pivotal_evidence",
              "test_article_bridge",
              "identity_characterization",
              "manufacturing_process",
              "dietary_exposure",
              "safety_data",
              "general_availability",
              "general_acceptance",
              "conditions_of_use",
              "regulatory_submission",
            ],
          },
          severity: { type: "string", enum: ["critical", "major", "minor"] },
          title: { type: "string" },
          summary: { type: "string" },
          recommendedAction: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          citations: { type: "array", items: citationSchema },
          gapType: {
            type: "string",
            enum: ["documentation_gap", "evidentiary_gap", "adequacy_gap"],
          },
          domain: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          evidenceRole: {
            type: "string",
            enum: ["pivotal", "supportive", "context", "unknown"],
          },
          availability: {
            type: "string",
            enum: ["public_peer_reviewed", "public_not_peer_reviewed", "private", "unknown"],
          },
          supportingMaterial: { type: ["string", "null"] },
          targetMaterial: { type: ["string", "null"] },
          testArticle: { type: ["string", "null"] },
          bridgeAssessment: {
            type: "string",
            enum: ["supported", "partial", "missing", "unknown"],
          },
        },
        required: [
          "id",
          "category",
          "severity",
          "title",
          "summary",
          "recommendedAction",
          "evidence",
          "citations",
          "gapType",
          "domain",
          "confidence",
          "evidenceRole",
          "availability",
          "supportingMaterial",
          "targetMaterial",
          "testArticle",
          "bridgeAssessment",
        ],
        additionalProperties: false,
      },
    },
    evidenceMatrix: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          domain: { type: "string" },
          requirement: { type: "string" },
          status: {
            type: "string",
            enum: [
              "present",
              "strong_with_minor_gaps",
              "substantial_gaps",
              "missing",
              "not_applicable",
            ],
          },
          assessment: { type: "string" },
          evidenceSummary: { type: "string" },
          citations: { type: "array", items: citationSchema },
          unresolvedQuestions: { type: "array", items: { type: "string" } },
          relatedFindingIds: { type: "array", items: { type: "string" } },
        },
        required: [
          "id",
          "domain",
          "requirement",
          "status",
          "assessment",
          "evidenceSummary",
          "citations",
          "unresolvedQuestions",
          "relatedFindingIds",
        ],
        additionalProperties: false,
      },
    },
    safetySignals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          level: { type: "string", enum: ["clear", "watch", "gap"] },
          summary: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          citations: { type: "array", items: citationSchema },
        },
        required: ["id", "label", "level", "summary", "evidence", "citations"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "filingProfile", "findings", "evidenceMatrix", "safetySignals"],
  additionalProperties: false,
} as const

export const analyzeNoticeWithAnthropic: DeepAnalyzer = async ({ filingName, pages, cacheDir }) => {
  const selected = selectAnalysisPageAwareText(pages)
  const model = process.env.GREENLIT_ANTHROPIC_MODEL ?? defaultModel
  const cacheFile = cacheDir
    ? path.join(cacheDir, `${analysisCacheKey(filingName, pages, model)}.json`)
    : undefined
  if (cacheFile && process.env.GREENLIT_FORCE_PAID_RERUN !== "true") {
    try {
      const cached = DeepAnalysisResultSchema.parse(JSON.parse(await readFile(cacheFile, "utf8")))
      return {
        ...cached,
        modelUsage: [],
        estimatedCostUsd: 0,
        cacheHit: true,
      }
    } catch {
      // A missing, stale, or invalid cache entry should fall through to analysis.
    }
  }
  enforceAnalysisBudget(selected.text)
  const response = await requestExternalModel("deep_analysis", {
    model,
    max_tokens: 20_000,
    temperature: 0,
    output_config: {
      format: {
        type: "json_schema",
        schema: deepAnalysisOutputSchema,
      },
    },
    system: buildSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildAnalysisPrompt(filingName, selected.text, selected.truncated),
      },
    ],
  })

  if (!response.ok) {
    throw externalModelRequestError("Anthropic deep analysis", response.status)
  }

  const payload = (await response.json()) as AnthropicPayload
  const raw = payload.content?.find((item) => item.type === "text")?.text
  if (!raw) {
    throw new Error("Anthropic deep analysis returned no text")
  }

  const parsed = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>
  const modelUsage = [usageFor("deep_analysis", model, payload.usage)]
  const result = DeepAnalysisResultSchema.parse({
    ...parsed,
    researchReferences: [],
    analyzedPages: selected.pageNumbers,
    truncated: selected.truncated,
    modelProvider: `${modelProcessingStatus().provider}/${model}`,
    modelUsage,
    estimatedCostUsd: Number(
      modelUsage.reduce((total, usage) => total + usage.estimatedCostUsd, 0).toFixed(6)
    ),
    cacheHit: false,
  })
  if (cacheFile) {
    try {
      await mkdir(path.dirname(cacheFile), { recursive: true })
      await writeFile(cacheFile, `${JSON.stringify(result, null, 2)}\n`)
    } catch {
      // Cache persistence must never discard a successfully completed analysis.
    }
  }
  return result
}

export function selectPageAwareText(pages: ExtractedPdfPage[]) {
  const candidates = pages.map((page) => ({
    page,
    chunk: `\n\n=== PDF PAGE ${page.pageNumber} ===\n${page.text.trim()}`,
    priority: pagePriority(page, pages.length),
  }))
  const selected: typeof candidates = []
  let characterCount = 0

  for (const candidate of [...candidates].sort(
    (left, right) => right.priority - left.priority || left.page.pageNumber - right.page.pageNumber
  )) {
    if (characterCount + candidate.chunk.length > maxAnalysisCharacters) {
      continue
    }
    selected.push(candidate)
    characterCount += candidate.chunk.length
  }

  selected.sort((left, right) => left.page.pageNumber - right.page.pageNumber)
  const pageNumbers = selected.map(({ page }) => page.pageNumber)
  return {
    text: selected.map(({ chunk }) => chunk).join(""),
    pageNumbers,
    truncated: pageNumbers.length < pages.length,
  }
}

export function selectTargetedPageAwareText(pages: ExtractedPdfPage[], maxCharacters = 300_000) {
  const initial = pages.map((page) => ({
    page,
    chunk: `\n\n=== PDF PAGE ${page.pageNumber} ===\n${page.text.trim()}`,
    priority: targetedPagePriority(page, pages.length),
  }))
  const highValuePages = new Set(
    initial.filter((candidate) => candidate.priority >= 4_000).map(({ page }) => page.pageNumber)
  )
  const candidates = initial.map((candidate) => ({
    ...candidate,
    priority:
      candidate.priority +
      (highValuePages.has(candidate.page.pageNumber - 1) ||
      highValuePages.has(candidate.page.pageNumber + 1)
        ? 900
        : 0),
  }))
  const selected: typeof candidates = []
  let characterCount = 0
  for (const candidate of candidates.sort(
    (left, right) => right.priority - left.priority || left.page.pageNumber - right.page.pageNumber
  )) {
    if (characterCount + candidate.chunk.length > maxCharacters) continue
    selected.push(candidate)
    characterCount += candidate.chunk.length
  }
  selected.sort((left, right) => left.page.pageNumber - right.page.pageNumber)
  return {
    text: selected.map(({ chunk }) => chunk).join(""),
    pageNumbers: selected.map(({ page }) => page.pageNumber),
    truncated: selected.length < pages.length,
  }
}

export function selectAnalysisPageAwareText(pages: ExtractedPdfPage[]) {
  return pages.length <= targetedContextPageLimit
    ? selectTargetedPageAwareText(pages)
    : selectPageAwareText(pages)
}

function pagePriority(page: ExtractedPdfPage, totalPages: number) {
  if (page.pageNumber <= 60) {
    return 10_000 - page.pageNumber
  }
  if (page.pageNumber > totalPages - 10) {
    return 9_000 - page.pageNumber
  }

  const text = page.text.toLowerCase()
  const evidenceTerms = [
    "90-day",
    "90 day",
    "noael",
    "toxic",
    "peer review",
    "published",
    "test article",
    "margin of safety",
    "lentein",
    "mankai",
    "wolffia",
    "lemna minor",
    "grn 1160",
    "grn 742",
    "incorporat",
    "specification",
    "dietary exposure",
  ]
  return evidenceTerms.reduce(
    (score, term) => score + (text.includes(term) ? 100 : 0),
    1_000 - page.pageNumber
  )
}

function targetedPagePriority(page: ExtractedPdfPage, totalPages: number) {
  const text = page.text.toLowerCase()
  let score = 200
  // Preserve the filing's core narrative before ranking later appendices.
  // Keyword-only ranking can otherwise let repetitive supporting material
  // crowd out identity, manufacturing, use, and exposure sections.
  if (page.pageNumber <= 90) score += 20_000 - page.pageNumber
  if (page.pageNumber > totalPages - 10) score += 6_000
  if (/\b(part|section)\s+[1-7]\b/.test(text)) score += 1_200
  const terms = [
    "identity",
    "composition",
    "specification",
    "batch analysis",
    "manufacturing process",
    "quality control",
    "intended use",
    "dietary exposure",
    "estimated daily intake",
    "90-day",
    "90 day",
    "noael",
    "margin of safety",
    "margin of exposure",
    "mos",
    "moe",
    "upper limit",
    "wweia",
    "toxicology",
    "peer-reviewed",
    "published",
    "expert panel",
    "independent conclusion",
    "test article",
    "comparable",
    "substantial equivalence",
    "literature search",
    "search terms",
    "search string",
    "databases were searched",
    "unfavorable",
    "allergen",
    "sequence homology",
    "references",
    "reasonable certainty of no harm",
  ]
  score += terms.reduce((total, term) => total + (text.includes(term) ? 350 : 0), 0)
  const highSpecificityTerms = [
    "margin of safety",
    "margin of exposure",
    "upper limit",
    "wweia",
    "substantial equivalence",
    "search terms",
    "search string",
    "databases were searched",
    "reasonable certainty of no harm",
  ]
  if (highSpecificityTerms.some((term) => text.includes(term))) score += 10_000
  return score
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
}

function analysisCacheKey(filingName: string, pages: ExtractedPdfPage[], model: string) {
  return createHash("sha256")
    .update(deepCacheVersion)
    .update("\0")
    .update(model)
    .update("\0")
    .update(filingName)
    .update("\0")
    .update(pages.map((page) => `${page.pageNumber}\0${page.text}`).join("\0"))
    .digest("hex")
}

function usageFor(stage: string, model: string, usage?: AnthropicUsage) {
  const inputTokens = usage?.input_tokens ?? 0
  const outputTokens = usage?.output_tokens ?? 0
  const cacheCreationInputTokens = usage?.cache_creation_input_tokens ?? 0
  const cacheReadInputTokens = usage?.cache_read_input_tokens ?? 0
  const inputRate = Number(process.env.GREENLIT_INPUT_COST_PER_MTOK ?? 3)
  const outputRate = Number(process.env.GREENLIT_OUTPUT_COST_PER_MTOK ?? 15)
  const estimatedCostUsd =
    ((inputTokens + cacheCreationInputTokens) * inputRate + outputTokens * outputRate) / 1_000_000 +
    (cacheReadInputTokens * inputRate * 0.1) / 1_000_000
  return {
    stage,
    model,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
  }
}

function enforceAnalysisBudget(selectedText: string) {
  const maximum = Number(process.env.GREENLIT_MAX_ANALYSIS_COST_USD ?? 1.25)
  if (!Number.isFinite(maximum) || maximum <= 0) return
  const estimatedMaximum = estimateFullPipelineCost(selectedText)
  if (estimatedMaximum > maximum) {
    throw new Error(
      `Estimated full analysis cost $${estimatedMaximum.toFixed(2)} exceeds GREENLIT_MAX_ANALYSIS_COST_USD=$${maximum.toFixed(2)}.`
    )
  }
}

export function estimateFullPipelineCost(selectedText: string) {
  const coreInputTokens = Math.ceil(selectedText.length / 3.5)
  // Comparator assessment/action synthesis reuses a narrower set of subject
  // findings and retrieved passages. Reserve 35% of core input for that stage.
  const estimatedInputTokens = Math.ceil(coreInputTokens * 1.35)
  // Maximum configured output across the 20k core and 16k combined stages.
  const expectedOutputTokens = 36_000
  const inputRate = Number(process.env.GREENLIT_INPUT_COST_PER_MTOK ?? 3)
  const outputRate = Number(process.env.GREENLIT_OUTPUT_COST_PER_MTOK ?? 15)
  return (estimatedInputTokens * inputRate + expectedOutputTokens * outputRate) / 1_000_000
}

function buildSystemPrompt() {
  return `You assess the sufficiency, completeness, and characterization of evidence in FDA GRAS notices.

Never state that a substance is or is not GRAS. Never predict FDA action. Never render legal advice.
Distinguish facts from adequacy judgments and mark uncertainty explicitly.

Gap types:
- documentation_gap: information may exist but is not included or clearly presented.
- evidentiary_gap: needed evidence does not appear to exist or have been generated.
- adequacy_gap: evidence is present but insufficient in quality, scope, or relevance.

Severity:
- critical: an essential evidentiary foundation is absent and nothing in the notice compensates.
- major: the issue materially weakens the evidence synthesis but is addressable.
- minor: presentation, organization, or traceability issue.

Evaluate identity and characterization, manufacturing, dietary exposure, safety data, general availability, general acceptance, conditions of use, and regulatory-submission completeness.

Mandatory cross-cutting checks:
1. INCORPORATION AND INDEPENDENT CONCLUSIONS: inventory reliance on prior GRNs or external dossiers. Determine whether the notice identifies the underlying information, explains its role, and states an independent conclusion instead of relying on another notice's outcome.
2. PUBLIC PIVOTAL EVIDENCE: distinguish pivotal from supportive evidence. Determine whether pivotal safety support is publicly available and peer reviewed. Never infer publication status; use unknown when the notice does not establish it.
3. TEST-ARTICLE BRIDGE: distinguish the target material from every studied test article. Evaluate identity, composition, processing, impurities, dose/exposure, and biological relevance. Do not require product-specific testing when a well-supported bridge is present.

Calibration rules:
- Report only material, actionable deficiencies. The mere absence of a product-specific study is not a gap when the notice provides a scientifically supported read-across bridge.
- Deduplicate by root cause. Combine overlapping manifestations of the same bridge, publication, incorporation, or exposure issue into one finding.
- A safety signal requires a documented adverse observation, specification or threshold exceedance, authoritative disagreement, inadequate exposure margin, or a concrete vulnerable-population concern tied to evidence in the notice.
- Do not label ordinary nutrient contribution, theoretical intake, or the presence of potassium, vitamin B12, protein, or another nutrient as a safety signal without notice-specific evidence of harm, exceedance, contradiction, or an inadequately addressed exposure limit.
- When a prior deficiency is demonstrably resolved, do not restate it as missing. Report a residual issue only when a concrete inconsistency remains, and cite that inconsistency.
- Prefer omission over a speculative or low-value finding. Use low confidence only for a material issue whose uncertainty itself requires resolution.
- Never create a finding whose own title or summary says the matter is adequate, resolved, sufficiently explained, or merely "not confirmed." Do not turn absence of confirmation into a deficiency.
- Minor findings are limited to traceability or presentation defects that materially obstruct evaluation. Do not flag batch age, expert-panel biographies, publication status of supportive nutrition-quality work, or harmless compositional comparisons unless the notice shows a concrete consequence.
- A "gap" safety signal must identify missing or inadequate safety support. Do not use it for evidence that resolves or distinguishes a concern. "Near" a specification is not a signal unless the notice documents an exceedance, trend, authoritative threshold conflict, or inadequate margin.
- Never create a public-pivotal-evidence finding solely because a study explicitly characterized as supportive is unpublished or private. Assess whether the evidence identified as pivotal is public and peer reviewed.

Every finding must cite an exact excerpt from the supplied notice and its PDF page marker. Do not invent excerpts, pages, citations, studies, publication status, or regulatory conclusions.`
}

function buildAnalysisPrompt(filingName: string, text: string, truncated: boolean) {
  return `Analyze "${filingName}". Return only valid JSON.

The response must have this shape:
{
  "summary": "concise evidence-readiness summary",
  "filingProfile": {
    "substanceName": "name printed in the filing",
    "notifier": "notifier printed in the filing",
    "status": "filing status or draft",
    "substanceType": "best matching allowed substance type",
    "productionMethod": "best matching allowed production method",
    "sourceOrganismType": "source organism type or unknown",
    "sourceOrganismName": "source organism name or unknown",
    "intendedUses": ["concise intended use"],
    "targetPopulation": "population described in the filing",
    "grasBasis": "basis described in the filing",
    "safetyDataAvailable": ["evidence type present in the filing"],
    "dietaryExposureMethod": "exposure method or unknown"
  },
  "findings": [{
    "id": "stable-kebab-case-id",
    "category": "incorporation_independent_conclusions|public_pivotal_evidence|test_article_bridge|identity_characterization|manufacturing_process|dietary_exposure|safety_data|general_availability|general_acceptance|conditions_of_use|regulatory_submission",
    "severity": "critical|major|minor",
    "title": "specific finding",
    "summary": "what is present, what is inadequate, and why it matters",
    "recommendedAction": "specific corrective action without predicting FDA behavior",
    "evidence": ["short human-readable evidence label"],
    "citations": [{"pageNumber": 1, "excerpt": "exact notice excerpt", "section": "optional printed section"}],
    "gapType": "documentation_gap|evidentiary_gap|adequacy_gap",
    "domain": "one of the eight analytical domains or cross-cutting",
    "confidence": "high|medium|low",
    "evidenceRole": "pivotal|supportive|context|unknown",
    "availability": "public_peer_reviewed|public_not_peer_reviewed|private|unknown",
    "supportingMaterial": "study, prior GRN, or comparator relied upon, or null",
    "targetMaterial": "ingredient being evaluated, or null",
    "testArticle": "material actually studied, or null",
    "bridgeAssessment": "supported|partial|missing|unknown"
  }],
  "evidenceMatrix": [{
    "id": "stable-requirement-id",
    "domain": "analytical domain",
    "requirement": "specific evidence requirement",
    "status": "present|strong_with_minor_gaps|substantial_gaps|missing|not_applicable",
    "assessment": "what is present and why it is or is not adequate",
    "evidenceSummary": "concise description of the evidence reviewed",
    "citations": [{"pageNumber": 1, "excerpt": "exact notice excerpt", "section": "printed section or empty string"}],
    "unresolvedQuestions": ["specific unanswered question, or an empty array"],
    "relatedFindingIds": ["matching finding id, or an empty array"]
  }],
  "safetySignals": [{
    "id": "stable-kebab-case-id",
    "label": "signal label",
    "level": "clear|watch|gap",
    "summary": "evidence-review signal, not a safety conclusion",
    "evidence": ["short human-readable evidence label"],
    "citations": [{"pageNumber": 1, "excerpt": "exact notice excerpt", "section": "optional printed section"}]
  }]
}

Return exactly one evidence-matrix row for each of these requirements:
1. identity-composition — identity, source, composition, and specifications
2. manufacturing — process description and process-related controls
3. specifications-batch-analysis — specifications and representative batch results
4. intended-uses-exposure — intended uses, use levels, and dietary exposure
5. public-pivotal-safety-evidence — public availability and peer review of pivotal evidence
6. independent-evidence-synthesis — specific incorporation and independent conclusions
7. test-article-comparability — target/test-article bridge
8. self-contained-literature-search — search methods, scope, and unfavorable information
9. allergenicity-assessment — protein allergenicity and cross-reactivity where applicable

Matrix rules:
- present means the requirement is both documented and adequately supported.
- strong_with_minor_gaps means the requirement is substantially supported and usable, with limited corrections that do not undermine the core conclusion.
- substantial_gaps means relevant material exists, but major omissions, ambiguity, inconsistency, or inadequate support prevents reliance on the requirement as filed.
- missing means the reviewed filing affirmatively lacks the requirement; do not use missing merely because selected text is truncated.
- not_applicable requires a filing-specific explanation.
- Every present, strong_with_minor_gaps, or substantial_gaps row requires at least one exact citation. A missing row cites the nearby section establishing the omission when possible; otherwise use an empty citation array.
- relatedFindingIds must contain only IDs returned in findings.
- Matrix status measures whether the filing contains and supports the named requirement; it is not a duplicate severity label for every residual scientific concern.
- public-pivotal-safety-evidence is present when the evidence relied upon as pivotal is public and peer reviewed. An explicitly supportive private study does not downgrade this row.
- independent-evidence-synthesis is present when incorporated sources and their roles are identified and the filing performs its own analysis and states its own conclusion. Comparator or "substantial equivalence" language alone does not establish adequate support.
- test-article-comparability is present when the filing supplies a structured bridge across identity, composition, processing, impurities, exposure, and biological relevance. A residual disagreement about the bridge's strength may remain a finding without downgrading documentation coverage.
- specifications-batch-analysis is present when specifications and multiple representative batch results are supplied. Data supplied in a cited appendix count; an in-specification result, proximity to a specification, or lot age alone does not justify a gap grade.

Return at most 10 findings and 5 safety signals, ordered by materiality. If text is truncated, do not call an unreviewed appendix missing; use substantial_gaps with an explicit selection caveat or omit the finding.
Input truncated: ${truncated}

NOTICE:
${text}`
}
