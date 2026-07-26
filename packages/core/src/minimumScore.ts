import {
  type AmendmentOutlineSection,
  type ComparableFiling,
  type DocumentationBenchmarkItem,
  type FilingDiffItem,
  type Finding,
  type ReadinessReport,
  ReadinessReportSchema,
  type ReportModules,
  type ResearchReference,
  type SafetySignal,
  type ScoreSignal,
  type TextStats,
} from "./report.js"

type MinimumScoreInput = {
  analysisId: string
  filingName: string
  extractedText: string
  pageCount?: number
  generatedAt?: string
}

type SectionRule = {
  id: string
  label: string
  keywords: string[]
  weight: number
  missingFinding: Pick<Finding, "severity" | "title" | "summary" | "recommendedAction">
}

const sectionRules: SectionRule[] = [
  {
    id: "identity",
    label: "Substance identity",
    keywords: ["identity", "chemical name", "composition", "characterization"],
    weight: 8,
    missingFinding: {
      severity: "major",
      title: "Substance identity is not easy to verify",
      summary:
        "A reviewer needs a clear identity and characterization section before deeper safety review is useful.",
      recommendedAction:
        "Add a dedicated identity section with composition, characterization, and naming details.",
    },
  },
  {
    id: "intended-use",
    label: "Intended use",
    keywords: ["intended use", "conditions of use", "use level", "food categories"],
    weight: 9,
    missingFinding: {
      severity: "critical",
      title: "Intended use is weak or missing",
      summary:
        "The filing cannot be scored confidently without a clear proposed use, use level, and food category context.",
      recommendedAction:
        "State the intended use, maximum use levels, food categories, and target population in one reviewable section.",
    },
  },
  {
    id: "manufacturing",
    label: "Manufacturing process",
    keywords: ["manufacturing", "production process", "process flow", "quality control"],
    weight: 8,
    missingFinding: {
      severity: "major",
      title: "Manufacturing process needs more detail",
      summary:
        "The minimum analysis did not find enough manufacturing-process language to support readiness.",
      recommendedAction:
        "Add process flow, control points, release criteria, and quality-control references.",
    },
  },
  {
    id: "specifications",
    label: "Specifications",
    keywords: ["specification", "certificate of analysis", "acceptance criteria", "purity"],
    weight: 7,
    missingFinding: {
      severity: "major",
      title: "Specifications are under-supported",
      summary: "Specifications and acceptance criteria are expected in a review-ready GRAS notice.",
      recommendedAction:
        "Add specifications, test methods, batch results, and certificate-of-analysis references.",
    },
  },
  {
    id: "safety",
    label: "Safety evidence",
    keywords: ["safety", "toxicology", "noael", "genotoxicity", "adverse"],
    weight: 9,
    missingFinding: {
      severity: "critical",
      title: "Safety evidence is not sufficiently visible",
      summary:
        "The minimum analysis did not find enough safety-specific support for a strong readiness score.",
      recommendedAction:
        "Add a safety narrative that maps studies, endpoints, doses, and margins of exposure to the intended use.",
    },
  },
  {
    id: "exposure",
    label: "Dietary exposure",
    keywords: ["dietary exposure", "estimated daily intake", "edi", "consumption", "exposure"],
    weight: 8,
    missingFinding: {
      severity: "major",
      title: "Dietary exposure support is weak",
      summary:
        "Exposure context is needed to interpret whether the safety evidence supports the proposed use.",
      recommendedAction:
        "Add estimated daily intake, assumptions, population coverage, and links to intended use levels.",
    },
  },
  {
    id: "references",
    label: "References",
    keywords: ["references", "bibliography", "journal", "study", "publication"],
    weight: 6,
    missingFinding: {
      severity: "minor",
      title: "References need clearer source support",
      summary:
        "The minimum analysis found limited reference language, which makes the early score less reliable.",
      recommendedAction:
        "Add complete source references and connect them to the filing sections they support.",
    },
  },
]

const wordPattern = /[\p{L}\p{N}][\p{L}\p{N}'-]*/gu
const citationPattern = /\b(?:doi:|pmid:|journal|toxicol|regul|food chem|et al\.|[12][0-9]{3})\b/giu

export function createMinimumReadinessReport(input: MinimumScoreInput): ReadinessReport {
  const normalizedText = normalizeText(input.extractedText)
  const lowerText = normalizedText.toLowerCase()
  const words = normalizedText.match(wordPattern) ?? []
  const textStats: TextStats = {
    pageCount: input.pageCount ?? 0,
    wordCount: words.length,
    characterCount: normalizedText.length,
  }

  const sectionResults = sectionRules.map((rule) => {
    const matches = rule.keywords.filter((keyword) => lowerText.includes(keyword.toLowerCase()))
    const coverageRatio = Math.min(1, matches.length / Math.min(2, rule.keywords.length))
    return {
      rule,
      matches,
      score: Math.round(rule.weight * coverageRatio),
    }
  })

  const sectionScore = sectionResults.reduce((total, result) => total + result.score, 0)
  const sectionMax = sectionRules.reduce((total, rule) => total + rule.weight, 0)
  const volumeScore = scoreRange(textStats.wordCount, [
    [250, 4],
    [1000, 8],
    [3000, 12],
    [7000, 15],
  ])
  const citationCount = normalizedText.match(citationPattern)?.length ?? 0
  const citationScore = scoreRange(citationCount, [
    [1, 4],
    [4, 8],
    [8, 12],
    [15, 15],
  ])
  const extractionScore = scoreRange(textStats.characterCount, [
    [1000, 4],
    [6000, 7],
    [15000, 9],
    [30000, 10],
  ])

  const signals: ScoreSignal[] = [
    {
      id: "required-sections",
      label: "Required sections",
      score: sectionScore,
      maxScore: sectionMax,
      summary: summarizeSectionCoverage(sectionResults),
    },
    {
      id: "document-depth",
      label: "Document depth",
      score: volumeScore,
      maxScore: 15,
      summary: summarizeDocumentDepth(textStats.wordCount),
    },
    {
      id: "source-support",
      label: "Source support",
      score: citationScore,
      maxScore: 15,
      summary: summarizeSourceSupport(citationCount),
    },
    {
      id: "extraction-quality",
      label: "Extraction quality",
      score: extractionScore,
      maxScore: 10,
      summary: summarizeExtractionQuality(textStats.characterCount),
    },
  ]

  const readinessScore = clampScore(
    Math.round(signals.reduce((total, signal) => total + signal.score, 0))
  )
  const findings = buildFindings(sectionResults, readinessScore, textStats)

  return ReadinessReportSchema.parse({
    id: `report-${input.analysisId}`,
    analysisId: input.analysisId,
    filingName: input.filingName,
    readinessScore,
    status: "complete",
    summary: summarizeReadiness(readinessScore),
    caveats: [
      "This is a minimum local readiness score from extracted document text, not a legal or FDA determination.",
      "Later MVP modules will add richer gap analysis, comparables, safety signals, and filing diff support.",
    ],
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    textStats,
    signals,
    runMetadata: {
      pipelineVersion: "minimum-local-v1",
      extractor: "pdfjs-dist-legacy-with-readable-text-fallback",
      scorer: "deterministic-required-section-coverage-v1",
      modelProvider: null,
      modelUsage: [],
      estimatedCostUsd: 0,
      cacheHit: false,
    },
    findings,
    modules: buildReportModules(sectionResults, lowerText),
  })
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function scoreRange(value: number, thresholds: Array<[number, number]>) {
  let score = 0
  for (const [minimum, thresholdScore] of thresholds) {
    if (value >= minimum) {
      score = thresholdScore
    }
  }
  return score
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score))
}

function summarizeSectionCoverage(
  results: Array<{ rule: SectionRule; matches: string[]; score: number }>
) {
  const strong = results.filter((result) => result.score >= result.rule.weight).length
  const partial = results.filter(
    (result) => result.score > 0 && result.score < result.rule.weight
  ).length

  if (strong >= 6) {
    return "Most expected GRAS filing sections are visible in the extracted text."
  }

  if (strong + partial >= 5) {
    return "Several expected sections are present, but some need clearer language before review."
  }

  return "The extracted text is missing multiple expected GRAS filing sections."
}

function summarizeDocumentDepth(wordCount: number) {
  if (wordCount >= 7000) {
    return "The extracted filing is long enough for a useful first-pass review."
  }

  if (wordCount >= 1000) {
    return "The extracted filing has moderate depth, but the score may miss appendix detail."
  }

  return "The extracted text is short, so the minimum score is less reliable."
}

function summarizeSourceSupport(citationCount: number) {
  if (citationCount >= 15) {
    return "The filing appears to contain substantial source or citation support."
  }

  if (citationCount >= 4) {
    return "The filing includes some source support, but references may need stronger mapping."
  }

  return "The minimum analysis found limited source or citation support."
}

function summarizeExtractionQuality(characterCount: number) {
  if (characterCount >= 30000) {
    return "Text extraction produced enough content for a stable minimum score."
  }

  if (characterCount >= 6000) {
    return "Text extraction produced usable content for a preliminary score."
  }

  return "Text extraction was limited; OCR or manual review may be needed."
}

function summarizeReadiness(score: number) {
  if (score >= 80) {
    return "The filing appears structurally ready for deeper review, with follow-up focused on evidence quality."
  }

  if (score >= 60) {
    return "The filing has a workable foundation, but several review-critical areas need reinforcement."
  }

  if (score >= 40) {
    return "The filing needs material cleanup before a deeper regulatory review will be efficient."
  }

  return "The filing is not yet ready for review based on the minimum extracted-text analysis."
}

function buildFindings(
  sectionResults: Array<{ rule: SectionRule; matches: string[]; score: number }>,
  readinessScore: number,
  textStats: TextStats
) {
  const findings: Finding[] = []

  for (const result of sectionResults) {
    const coverageRatio = result.score / result.rule.weight
    if (coverageRatio >= 1) {
      continue
    }

    findings.push({
      id: `minimum-${result.rule.id}`,
      ...result.rule.missingFinding,
      evidence:
        result.matches.length > 0
          ? result.matches.map((match) => `Found keyword: ${match}`)
          : ["No strong keyword match found in extracted text"],
    })
  }

  if (textStats.wordCount < 1000) {
    findings.push({
      id: "minimum-extraction-depth",
      severity: "major",
      title: "Extracted text is too short for a confident score",
      summary:
        "The upload was saved, but the extracted text was short enough that the first-pass score may understate content in scanned pages or appendices.",
      recommendedAction:
        "Check whether the PDF is scanned or image-heavy, then add OCR or upload a text-based PDF for the next review pass.",
      evidence: [`Extracted word count: ${textStats.wordCount}`],
    })
  }

  if (readinessScore >= 80 && findings.length === 0) {
    findings.push({
      id: "minimum-ready-for-deeper-review",
      severity: "minor",
      title: "Ready for deeper module review",
      summary:
        "The minimum score did not find major structural gaps, so the next useful step is richer module analysis.",
      recommendedAction:
        "Run the gap, safety, comparable filing, and documentation benchmark modules as they become available.",
      evidence: [`Minimum readiness score: ${readinessScore}`],
    })
  }

  return findings.slice(0, 6)
}

function buildReportModules(
  sectionResults: Array<{ rule: SectionRule; matches: string[]; score: number }>,
  lowerText: string
): ReportModules {
  const documentationBenchmark = safeModuleOutput(
    () => buildDocumentationBenchmark(sectionResults),
    []
  )

  return {
    documentationBenchmark,
    evidenceMatrix: [],
    safetySignals: safeModuleOutput(() => buildSafetySignals(sectionResults, lowerText), []),
    comparableFilings: safeModuleOutput(
      () => buildComparableFilings(lowerText, documentationBenchmark),
      []
    ),
    comparableActions: [],
    filingDiff: safeModuleOutput(() => buildFilingDiff(documentationBenchmark), []),
    researchReferences: safeModuleOutput(() => buildResearchReferences(), []),
    amendmentOutline: safeModuleOutput(() => buildAmendmentOutline(documentationBenchmark), []),
  }
}

function safeModuleOutput<T>(build: () => T, fallback: T) {
  try {
    return build()
  } catch {
    return fallback
  }
}

function buildDocumentationBenchmark(
  sectionResults: Array<{ rule: SectionRule; matches: string[]; score: number }>
): DocumentationBenchmarkItem[] {
  return sectionResults.map((result) => {
    const coverageRatio = result.score / result.rule.weight
    const status = coverageRatio >= 1 ? "present" : coverageRatio > 0 ? "weak" : "missing"

    return {
      id: result.rule.id,
      label: result.rule.label,
      status,
      summary:
        status === "present"
          ? `${result.rule.label} appears reviewable in the extracted text.`
          : status === "weak"
            ? `${result.rule.label} appears partially supported but needs clearer evidence.`
            : `${result.rule.label} was not detected strongly enough for the MVP checklist.`,
      evidence:
        result.matches.length > 0
          ? result.matches.map((match) => `Found keyword: ${match}`)
          : ["No strong keyword match found"],
    }
  })
}

function buildSafetySignals(
  sectionResults: Array<{ rule: SectionRule; matches: string[]; score: number }>,
  lowerText: string
): SafetySignal[] {
  const safety = sectionResults.find((result) => result.rule.id === "safety")
  const exposure = sectionResults.find((result) => result.rule.id === "exposure")
  const hasAdverseLanguage = /\b(adverse|toxicity|toxicology|genotoxicity|noael)\b/i.test(lowerText)

  return [
    {
      id: "safety-evidence-presence",
      label: "Safety evidence presence",
      level:
        safety && safety.score >= safety.rule.weight ? "clear" : safety?.score ? "watch" : "gap",
      summary:
        safety && safety.score >= safety.rule.weight
          ? "Safety-specific language is visible in the filing."
          : "Safety-specific language needs stronger support before review.",
      evidence: safety?.matches.length ? safety.matches : ["No strong safety keyword match found"],
    },
    {
      id: "exposure-linkage",
      label: "Exposure linkage",
      level:
        safety && exposure && safety.score > 0 && exposure.score > 0
          ? "watch"
          : exposure?.score
            ? "watch"
            : "gap",
      summary:
        safety && exposure && safety.score > 0 && exposure.score > 0
          ? "Safety and exposure language are both present; the next review should verify they are explicitly connected."
          : "Exposure context is not strong enough to interpret the safety narrative confidently.",
      evidence: [...(safety?.matches ?? []), ...(exposure?.matches ?? [])],
    },
    {
      id: "adverse-endpoints",
      label: "Adverse endpoint language",
      level: hasAdverseLanguage ? "clear" : "gap",
      summary: hasAdverseLanguage
        ? "The filing includes safety endpoint terminology."
        : "The filing should identify safety endpoints, adverse effects, and study conclusions.",
      evidence: hasAdverseLanguage
        ? ["Detected toxicology, adverse-effect, genotoxicity, or NOAEL terminology"]
        : ["No adverse endpoint terminology detected"],
    },
  ]
}

function buildComparableFilings(
  lowerText: string,
  benchmark: DocumentationBenchmarkItem[]
): ComparableFiling[] {
  const sharedSignals = benchmark
    .filter((item) => item.status !== "missing")
    .slice(0, 4)
    .map((item) => item.label)

  if (/\b(enzyme|amylase|protease|lipase|xylanase)\b/.test(lowerText)) {
    return [
      comparable(
        "enzyme-preparation",
        "Enzyme preparation GRAS notice",
        "Manufacturing, specifications, and safety narrative patterns are likely relevant.",
        sharedSignals
      ),
    ]
  }

  if (/\b(probiotic|lactobacillus|bifidobacterium|bacillus)\b/.test(lowerText)) {
    return [
      comparable(
        "microbial-ingredient",
        "Microbial ingredient GRAS notice",
        "Identity, strain characterization, intended use, and safety evidence patterns are likely relevant.",
        sharedSignals
      ),
    ]
  }

  if (/\b(oil|fatty acid|dha|ara|lipid)\b/.test(lowerText)) {
    return [
      comparable(
        "lipid-ingredient",
        "Lipid ingredient GRAS notice",
        "Composition, specifications, exposure, and safety patterns are likely relevant.",
        sharedSignals
      ),
    ]
  }

  return [
    comparable(
      "general-gras",
      "General GRAS notice structure",
      "Use as a structural comparator until a richer retrieval module selects specific historical filings.",
      sharedSignals
    ),
  ]
}

function comparable(
  id: string,
  name: string,
  rationale: string,
  sharedSignals: string[]
): ComparableFiling {
  return {
    id,
    name,
    status: "directional",
    rationale,
    sharedSignals: sharedSignals.length > 0 ? sharedSignals : ["Minimum report structure"],
    differences: [
      "This local MVP comparator is heuristic; later retrieval should cite specific historical filings.",
      "Substance identity, intended use, and exposure assumptions still require human review.",
    ],
  }
}

function buildFilingDiff(benchmark: DocumentationBenchmarkItem[]): FilingDiffItem[] {
  return benchmark.map((item) => ({
    id: `diff-${item.id}`,
    label: item.label,
    status: item.status === "present" ? "aligned" : item.status === "weak" ? "partial" : "missing",
    baselineExpectation: `A review-ready filing has a clear ${item.label.toLowerCase()} section with evidence tied to intended use.`,
    draftSignal: item.summary,
    recommendedAction:
      item.status === "present"
        ? "Keep this section aligned as richer modules add evidence checks."
        : `Strengthen ${item.label.toLowerCase()} before relying on the score.`,
  }))
}

function buildResearchReferences(): ResearchReference[] {
  // Citation-like tokens are useful for the minimum readiness signal, but they are not
  // enough to identify a real work. Only the deep extractor may populate this module.
  return []
}

function buildAmendmentOutline(benchmark: DocumentationBenchmarkItem[]): AmendmentOutlineSection[] {
  const weakItems = benchmark.filter((item) => item.status !== "present")
  const targets = weakItems.length > 0 ? weakItems : benchmark.slice(0, 3)

  return [
    {
      id: "readiness-summary",
      title: "Readiness summary revisions",
      items: [
        "State the proposed conclusion and the boundaries of the intended use.",
        "Add caveats where the minimum local analysis found weak or missing evidence.",
      ],
    },
    ...targets.slice(0, 5).map((item) => ({
      id: `outline-${item.id}`,
      title: `${item.label} revisions`,
      items: [
        item.summary,
        `Add evidence and reviewer-facing rationale for ${item.label.toLowerCase()}.`,
        "Cross-reference supporting studies, specifications, exposure assumptions, and appendices.",
      ],
    })),
  ]
}
