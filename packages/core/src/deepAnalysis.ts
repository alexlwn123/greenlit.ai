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
  const deep = DeepAnalysisResultSchema.parse(deepInput)
  const findings = calibrateFindings(deep.findings)
    .sort((left, right) => findingPriority(right) - findingPriority(left))
    .slice(0, 10)
  const safetySignals = deep.safetySignals.slice(0, 5)
  const penalty = findings.reduce((total, finding) => {
    if (finding.severity === "critical") {
      return total + 10
    }
    if (finding.severity === "major") {
      return total + 5
    }
    return total + 1
  }, 0)
  const documentationBenchmark = applyAdequacySignals(
    minimumReport.modules.documentationBenchmark,
    findings,
    deep.evidenceMatrix
  )
  const filingDiff = buildFilingDiff(deep.evidenceMatrix)

  return ReadinessReportSchema.parse({
    ...minimumReport,
    readinessScore: Math.max(0, 100 - penalty),
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
      scorer: "original-domain-analysis-port-v1",
      modelProvider: deep.modelProvider,
      modelUsage: deep.modelUsage ?? [],
      estimatedCostUsd: deep.estimatedCostUsd ?? 0,
      cacheHit: deep.cacheHit ?? false,
    },
  })
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
        finding.category === "incorporation_independent_conclusions" &&
        candidate.category === finding.category &&
        sharedGrnReferences(candidate, finding)
    )
    if (!duplicate) retained.push(finding)
  }
  return retained
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
        status: item.status === "not_applicable" ? "present" : item.status,
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
          : item.status === "weak"
            ? "partial"
            : "missing",
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
