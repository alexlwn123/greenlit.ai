import { z } from "zod"
import { NoticeProfileSchema } from "./comparables.js"
import {
  type DocumentationBenchmarkItem,
  EvidenceCitationSchema,
  type EvidenceMatrixItem,
  EvidenceMatrixItemSchema,
  FindingConfidenceSchema,
  FindingSchema,
  GapTypeSchema,
  type ReadinessReport,
  ReadinessReportSchema,
  ResearchReferenceSchema,
  RunMetadataSchema,
  type SafetySignal,
  SafetySignalSchema,
} from "./report.js"

export const EvidenceRoleSchema = z.enum(["pivotal", "supportive", "context", "unknown"])
export const EvidenceAvailabilitySchema = z.enum([
  "public_peer_reviewed",
  "public_not_peer_reviewed",
  "private",
  "unknown",
])
export const BridgeAssessmentSchema = z.enum(["supported", "partial", "missing", "unknown"])

export const DeepFindingSchema = FindingSchema.extend({
  citations: z.array(EvidenceCitationSchema).min(1),
  gapType: GapTypeSchema,
  domain: z.string(),
  confidence: FindingConfidenceSchema,
  category: z.enum([
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
  ]),
  evidenceRole: EvidenceRoleSchema,
  availability: EvidenceAvailabilitySchema,
  supportingMaterial: z.string().nullable(),
  targetMaterial: z.string().nullable(),
  testArticle: z.string().nullable(),
  bridgeAssessment: BridgeAssessmentSchema,
})

export const DeepAnalysisResultSchema = z.object({
  summary: z.string(),
  filingProfile: NoticeProfileSchema.optional(),
  findings: z.array(DeepFindingSchema),
  evidenceMatrix: z.array(EvidenceMatrixItemSchema).default([]),
  researchReferences: z.array(ResearchReferenceSchema).default([]),
  safetySignals: z.array(SafetySignalSchema),
  analyzedPages: z.array(z.number().int().positive()),
  truncated: z.boolean(),
  modelProvider: z.string(),
  modelUsage: RunMetadataSchema.shape.modelUsage.optional(),
  estimatedCostUsd: z.number().nonnegative().optional(),
  cacheHit: z.boolean().optional(),
})

export type DeepFinding = z.infer<typeof DeepFindingSchema>
export type DeepAnalysisResult = z.infer<typeof DeepAnalysisResultSchema>

export function applyDeepAnalysis(
  minimumReport: ReadinessReport,
  deepInput: DeepAnalysisResult
): ReadinessReport {
  const deep = enforceEvidenceIntegrity(DeepAnalysisResultSchema.parse(deepInput))
  const findings = calibrateFindings(deep.findings)
    .sort((left, right) => findingPriority(right) - findingPriority(left))
    .slice(0, 10)
  const safetySignals = calibrateSafetySignals(deep.safetySignals)
  const scoring = scoreDeepReadiness(findings, deep.evidenceMatrix)
  const documentationBenchmark = applyAdequacySignals(
    minimumReport.modules.documentationBenchmark,
    findings,
    deep.evidenceMatrix
  )
  const filingDiff = buildFilingDiff(deep.evidenceMatrix)

  return ReadinessReportSchema.parse({
    ...minimumReport,
    readinessScore: scoring.score,
    summary: deep.summary,
    caveats: [
      "This report assesses the sufficiency and presentation of evidence; it is not a legal opinion, FDA prediction, or GRAS determination.",
      ...(deep.truncated
        ? [
            `Deep analysis reviewed selected text from ${deep.analyzedPages.length} PDF pages; unselected appendices may contain additional evidence.`,
          ]
        : []),
    ],
    findings,
    signals: scoring.signals.length > 0 ? scoring.signals : minimumReport.signals,
    modules: {
      ...minimumReport.modules,
      documentationBenchmark,
      evidenceMatrix: deep.evidenceMatrix,
      safetySignals,
      researchReferences:
        deep.researchReferences.length > 0
          ? deep.researchReferences
          : minimumReport.modules.researchReferences,
      filingDiff: filingDiff.length > 0 ? filingDiff : minimumReport.modules.filingDiff,
      amendmentOutline: buildAmendmentOutline(findings, deep.evidenceMatrix),
    },
    runMetadata: {
      ...minimumReport.runMetadata,
      pipelineVersion: "deep-evidence-v1",
      scorer: scoring.method,
      modelProvider: deep.modelProvider,
      modelUsage: deep.modelUsage ?? [],
      estimatedCostUsd: deep.estimatedCostUsd ?? 0,
      cacheHit: deep.cacheHit ?? false,
    },
  })
}

export const evidenceMatrixImportance: Record<
  string,
  { importance: "high" | "medium" | "low"; maxScore: 15 | 10 | 5; rationale: string }
> = {
  "identity-composition": {
    importance: "medium",
    maxScore: 10,
    rationale: "Defines the substance to which the rest of the evidence must apply.",
  },
  manufacturing: {
    importance: "medium",
    maxScore: 10,
    rationale: "Establishes process consistency and control of process-related hazards.",
  },
  "specifications-batch-analysis": {
    importance: "medium",
    maxScore: 10,
    rationale: "Defines the commercial article and verifies representative lot conformity.",
  },
  "intended-uses-exposure": {
    importance: "high",
    maxScore: 15,
    rationale: "Directly controls the intake used to interpret the safety evidence.",
  },
  "public-pivotal-safety-evidence": {
    importance: "high",
    maxScore: 15,
    rationale: "Determines whether pivotal support can be independently evaluated.",
  },
  "independent-evidence-synthesis": {
    importance: "medium",
    maxScore: 10,
    rationale:
      "Tests whether the filing resolves uncertainties into its own defensible conclusion.",
  },
  "test-article-comparability": {
    importance: "high",
    maxScore: 15,
    rationale: "Determines whether pivotal studies apply to the marketed ingredient.",
  },
  "self-contained-literature-search": {
    importance: "low",
    maxScore: 5,
    rationale: "Supports completeness and detection of contrary evidence.",
  },
  "allergenicity-assessment": {
    importance: "medium",
    maxScore: 10,
    rationale: "Addresses a distinct safety pathway when biologically applicable.",
  },
}

export const evidenceMatrixStatusCredit = {
  present: 1,
  strong_with_minor_gaps: 0.75,
  substantial_gaps: 0.25,
  missing: 0,
  not_applicable: 0,
  weak: 0.25,
} as const

export function getEvidenceMatrixScoreBreakdown(evidenceMatrix: EvidenceMatrixItem[]) {
  return evidenceMatrix
    .filter((item) => item.status !== "not_applicable")
    .map((item) => {
      const configuration = evidenceMatrixImportance[item.id] ?? {
        importance: "medium" as const,
        maxScore: 10 as const,
        rationale:
          "Material evidence domain requiring complete and adequately supported documentation.",
      }
      const creditRate = evidenceMatrixStatusCredit[item.status]
      return {
        ...configuration,
        id: item.id,
        label: item.requirement,
        status: item.status,
        creditRate,
        earnedScore: Number((configuration.maxScore * creditRate).toFixed(2)),
      }
    })
}

export function scoreDeepReadiness(findings: DeepFinding[], evidenceMatrix: EvidenceMatrixItem[]) {
  const applicable = evidenceMatrix.filter((item) => item.status !== "not_applicable")
  if (applicable.length === 0) {
    const penalty = findings.reduce(
      (total, finding) =>
        total + (finding.severity === "critical" ? 10 : finding.severity === "major" ? 5 : 1),
      0
    )
    return {
      score: Math.max(0, 100 - penalty),
      signals: [],
      method: "legacy-severity-fallback-v1",
    }
  }

  const breakdown = getEvidenceMatrixScoreBreakdown(applicable)
  const weighted = breakdown.map((item) => {
    return {
      id: `domain-${item.id}`,
      label: item.label,
      score: item.earnedScore,
      maxScore: item.maxScore,
      summary: applicable.find((row) => row.id === item.id)?.assessment ?? "",
    }
  })
  const earned = weighted.reduce((total, signal) => total + signal.score, 0)
  const available = weighted.reduce((total, signal) => total + signal.maxScore, 0)
  return {
    score: available === 0 ? 0 : Math.round((earned / available) * 100),
    signals: weighted,
    method: "importance-and-evidence-grade-v2",
  }
}

export function calibrateFindings(findings: DeepFinding[]) {
  const filtered = findings.filter(
    (finding) =>
      !(
        finding.severity === "minor" &&
        finding.category === "safety_data" &&
        finding.evidenceRole === "supportive" &&
        finding.availability === "private"
      )
  )
  const retained: DeepFinding[] = []
  for (const finding of filtered.sort(
    (left, right) => findingPriority(right) - findingPriority(left)
  )) {
    const duplicate = retained.some(
      (candidate) =>
        candidate.category === finding.category &&
        ((finding.category === "incorporation_independent_conclusions" &&
          sharedGrnReferences(candidate, finding)) ||
          sharedFindingEvidence(candidate, finding))
    )
    if (!duplicate) retained.push(finding)
  }
  return retained
}

export function enforceEvidenceIntegrity(deep: DeepAnalysisResult): DeepAnalysisResult {
  const analyzedPages = new Set(deep.analyzedPages)
  const validCitation = (citation: { pageNumber: number; excerpt: string }) =>
    analyzedPages.has(citation.pageNumber) && citation.excerpt.trim().length > 0
  const findings = deep.findings.filter(
    (finding) =>
      finding.citations.length > 0 && finding.citations.every((citation) => validCitation(citation))
  )
  const findingIds = new Set(findings.map((finding) => finding.id))
  const evidenceMatrix = deep.evidenceMatrix.map((item) => {
    const citations = item.citations.filter(validCitation)
    const lostRequiredGrounding =
      item.status !== "missing" && item.status !== "not_applicable" && citations.length === 0
    return {
      ...item,
      status: lostRequiredGrounding ? ("missing" as const) : item.status,
      assessment: lostRequiredGrounding
        ? `Evidence grounding failed for the supplied assessment. ${item.assessment}`
        : item.assessment,
      citations,
      unresolvedQuestions: lostRequiredGrounding
        ? [
            ...new Set([
              "Locate and cite filing evidence for this requirement.",
              ...item.unresolvedQuestions,
            ]),
          ]
        : item.unresolvedQuestions,
      relatedFindingIds: item.relatedFindingIds.filter((id) => findingIds.has(id)),
    }
  })
  const safetySignals = deep.safetySignals.map((signal) => ({
    ...signal,
    citations: (signal.citations ?? []).filter(validCitation),
  }))

  return { ...deep, findings, evidenceMatrix, safetySignals }
}

function sharedFindingEvidence(left: DeepFinding, right: DeepFinding) {
  return left.citations.some((leftCitation) =>
    right.citations.some(
      (rightCitation) =>
        leftCitation.pageNumber === rightCitation.pageNumber &&
        normalizedEvidence(leftCitation.excerpt) === normalizedEvidence(rightCitation.excerpt)
    )
  )
}

function normalizedEvidence(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function calibrateSafetySignals(signals: SafetySignal[]) {
  const retained: SafetySignal[] = []
  const levelRank = { gap: 3, watch: 2, clear: 1 } as const
  for (const signal of [...signals].sort(
    (left, right) => levelRank[right.level] - levelRank[left.level]
  )) {
    const citations = signal.citations ?? []
    if ((signal.level === "gap" || signal.level === "watch") && citations.length === 0) {
      continue
    }
    const duplicate = retained.some(
      (candidate) =>
        normalizeSignal(candidate.label) === normalizeSignal(signal.label) ||
        sharedSignalEvidence(candidate, signal)
    )
    if (!duplicate) retained.push(signal)
    if (retained.length === 5) break
  }
  return retained
}

function normalizeSignal(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function sharedSignalEvidence(left: SafetySignal, right: SafetySignal) {
  const leftCitations = left.citations ?? []
  const rightCitations = right.citations ?? []
  return leftCitations.some((leftCitation) =>
    rightCitations.some(
      (rightCitation) =>
        leftCitation.pageNumber === rightCitation.pageNumber &&
        normalizeSignal(leftCitation.excerpt) === normalizeSignal(rightCitation.excerpt)
    )
  )
}

function sharedGrnReferences(left: DeepFinding, right: DeepFinding) {
  const references = (finding: DeepFinding) =>
    new Set(
      `${finding.title} ${finding.summary} ${finding.supportingMaterial ?? ""}`
        .match(/\bGRN\s*0*(\d{1,4})\b/gi)
        ?.map((value) => value.replace(/\D/g, "").replace(/^0+/, "")) ?? []
    )
  const leftReferences = references(left)
  return [...references(right)].some((reference) => leftReferences.has(reference))
}

function buildAmendmentOutline(findings: DeepFinding[], evidenceMatrix: EvidenceMatrixItem[]) {
  const sections = new Map<string, { id: string; title: string; findings: DeepFinding[] }>()

  for (const finding of findings) {
    const section = amendmentSection(finding.category)
    const current = sections.get(section.id) ?? { ...section, findings: [] }
    current.findings.push(finding)
    sections.set(section.id, current)
  }

  return [...sections.values()]
    .sort((left, right) => amendmentOrder.indexOf(left.id) - amendmentOrder.indexOf(right.id))
    .map((section) => {
      const findingIds = new Set(section.findings.map((finding) => finding.id))
      const matrixQuestions = evidenceMatrix
        .filter((item) => item.relatedFindingIds.some((findingId) => findingIds.has(findingId)))
        .flatMap((item) => item.unresolvedQuestions)

      return {
        id: `outline-${section.id}`,
        title: section.title,
        items: [
          ...section.findings.map(
            (finding) =>
              `[${finding.severity.toUpperCase()}] ${finding.title}: ${finding.recommendedAction}`
          ),
          ...matrixQuestions.map((question) => `Resolve evidence question: ${question}`),
        ],
        priority: highestSeverity(section.findings),
        domains: [...new Set(section.findings.map((finding) => finding.domain))],
        relatedFindingIds: [...findingIds],
        citations: uniqueCitations(section.findings.flatMap((finding) => finding.citations)),
      }
    })
}

const amendmentOrder = [
  "part-1-identity-manufacturing",
  "part-2-intended-use",
  "part-3-gras-basis",
  "part-4-safety",
  "part-5-dietary-exposure",
  "part-6-evidence-synthesis",
]

function amendmentSection(category: DeepFinding["category"]) {
  if (category === "identity_characterization" || category === "manufacturing_process") {
    return {
      id: "part-1-identity-manufacturing",
      title: "Part 1 — Identity, manufacturing, and specifications",
    }
  }
  if (category === "conditions_of_use") {
    return { id: "part-2-intended-use", title: "Part 2 — Intended use" }
  }
  if (category === "general_acceptance") {
    return {
      id: "part-3-gras-basis",
      title: "Part 3 — Basis for the conclusion",
    }
  }
  if (
    category === "safety_data" ||
    category === "general_availability" ||
    category === "public_pivotal_evidence" ||
    category === "test_article_bridge"
  ) {
    return { id: "part-4-safety", title: "Part 4 — Safety evidence" }
  }
  if (category === "dietary_exposure") {
    return {
      id: "part-5-dietary-exposure",
      title: "Part 5 — Dietary exposure",
    }
  }
  return {
    id: "part-6-evidence-synthesis",
    title: "Part 6 — Evidence synthesis and independent conclusion",
  }
}

function highestSeverity(findings: DeepFinding[]) {
  if (findings.some((finding) => finding.severity === "critical")) {
    return "critical" as const
  }
  if (findings.some((finding) => finding.severity === "major")) {
    return "major" as const
  }
  return "minor" as const
}

function uniqueCitations(citations: DeepFinding["citations"]) {
  return [
    ...new Map(
      citations.map((citation) => [`${citation.pageNumber}:${citation.excerpt}`, citation])
    ).values(),
  ]
}

function findingPriority(finding: DeepFinding) {
  const severity = { critical: 300, major: 200, minor: 100 }[finding.severity]
  const confidence = { high: 30, medium: 20, low: 10 }[finding.confidence]
  return severity + confidence
}

function applyAdequacySignals(
  benchmark: DocumentationBenchmarkItem[],
  findings: DeepFinding[],
  evidenceMatrix: EvidenceMatrixItem[]
): DocumentationBenchmarkItem[] {
  if (evidenceMatrix.length > 0) {
    return evidenceMatrix
      .filter((item) => item.status !== "not_applicable")
      .map((item) => ({
        id: item.id,
        label: item.requirement,
        status:
          item.status === "present" ? "present" : item.status === "missing" ? "missing" : "weak",
        summary: item.assessment,
        evidence: item.citations.map(
          (citation) => `PDF page ${citation.pageNumber}: ${citation.excerpt}`
        ),
      }))
  }

  const weakened = new Set<string>()

  for (const finding of findings) {
    if (finding.category === "incorporation_independent_conclusions") {
      weakened.add("references")
    }
    if (
      finding.category === "public_pivotal_evidence" ||
      finding.category === "test_article_bridge"
    ) {
      weakened.add("safety")
    }
    if (finding.category === "dietary_exposure") {
      weakened.add("exposure")
      weakened.add("intended-use")
    }
  }

  return benchmark.map((item) =>
    weakened.has(item.id)
      ? {
          ...item,
          status: "weak",
          summary: `${item.label} is present, but deep analysis identified an adequacy issue.`,
        }
      : item
  )
}

function buildFilingDiff(evidenceMatrix: EvidenceMatrixItem[]) {
  return evidenceMatrix
    .filter((item) => item.status !== "not_applicable")
    .map((item) => ({
      id: `diff-${item.id}`,
      label: item.requirement,
      status:
        item.status === "present"
          ? ("aligned" as const)
          : item.status === "missing"
            ? "missing"
            : "partial",
      baselineExpectation: item.requirement,
      draftSignal: item.assessment,
      recommendedAction:
        item.unresolvedQuestions.length > 0
          ? `Resolve: ${item.unresolvedQuestions.join("; ")}`
          : item.status === "present"
            ? "Preserve the cited support and traceability in the filing."
            : "Add evidence that directly addresses this requirement.",
    }))
}
