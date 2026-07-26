import { z } from "zod"

export const AnalysisStatusSchema = z.enum(["queued", "running", "complete", "failed"])
export const ReportStatusSchema = z.enum(["demo", "queued", "running", "complete", "failed"])
export const FindingSeveritySchema = z.enum(["critical", "major", "minor"])
export const GapTypeSchema = z.enum(["documentation_gap", "evidentiary_gap", "adequacy_gap"])
export const FindingConfidenceSchema = z.enum(["high", "medium", "low"])

export const ArtifactReferenceSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().nonnegative(),
  storageKey: z.string(),
  createdAt: z.string(),
})

export const TextStatsSchema = z.object({
  pageCount: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  characterCount: z.number().int().nonnegative(),
})

export const ScoreSignalSchema = z.object({
  id: z.string(),
  label: z.string(),
  score: z.number().min(0),
  maxScore: z.number().positive(),
  summary: z.string(),
})

export const RunMetadataSchema = z.object({
  pipelineVersion: z.string(),
  extractor: z.string(),
  scorer: z.string(),
  modelProvider: z.string().nullable(),
  modelUsage: z
    .array(
      z.object({
        stage: z.string(),
        model: z.string(),
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        cacheCreationInputTokens: z.number().int().nonnegative().default(0),
        cacheReadInputTokens: z.number().int().nonnegative().default(0),
        estimatedCostUsd: z.number().nonnegative(),
      })
    )
    .default([]),
  estimatedCostUsd: z.number().nonnegative().default(0),
  cacheHit: z.boolean().default(false),
})

export const BenchmarkStatusSchema = z.enum(["present", "weak", "missing"])
export const SafetySignalLevelSchema = z.enum(["clear", "watch", "gap"])
export const DiffStatusSchema = z.enum(["aligned", "partial", "missing"])
export const EvidenceMatrixChangeSchema = z.enum([
  "improved",
  "unchanged",
  "regressed",
  "not_comparable",
])
export const WorkbookNoteStatusSchema = z.enum(["open", "in_progress", "done"])
export const EvidenceMatrixStatusSchema = z.enum(["present", "weak", "missing", "not_applicable"])

export const EvidenceCitationSchema = z.object({
  pageNumber: z.number().int().positive(),
  excerpt: z.string(),
  section: z.string().optional(),
})

export const FindingSchema = z.object({
  id: z.string(),
  severity: FindingSeveritySchema,
  title: z.string(),
  summary: z.string(),
  recommendedAction: z.string(),
  evidence: z.array(z.string()).default([]),
  citations: z.array(EvidenceCitationSchema).optional(),
  gapType: GapTypeSchema.optional(),
  domain: z.string().optional(),
  confidence: FindingConfidenceSchema.optional(),
})

export const DocumentationBenchmarkItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: BenchmarkStatusSchema,
  summary: z.string(),
  evidence: z.array(z.string()),
})

export const SafetySignalSchema = z.object({
  id: z.string(),
  label: z.string(),
  level: SafetySignalLevelSchema,
  summary: z.string(),
  evidence: z.array(z.string()),
  citations: z.array(EvidenceCitationSchema).optional(),
})

export const ComparableEvidenceMatchSchema = z.object({
  requirementId: z.string(),
  requirement: z.string(),
  relevanceScore: z.number().min(0).max(1),
  rationale: z.string(),
  citations: z.array(EvidenceCitationSchema),
  assessments: z
    .array(
      z.object({
        question: z.string(),
        conclusion: z.enum([
          "directly_supportive",
          "supportive_with_limitations",
          "contextual_only",
          "not_transferable",
          "conflicting",
          "insufficient_information",
        ]),
        rationale: z.string(),
        transferableElements: z.array(z.string()),
        limitations: z.array(z.string()),
        comparatorCitationPages: z.array(z.number().int().positive()),
      })
    )
    .optional(),
})

export const ComparableFilingSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  rationale: z.string(),
  sharedSignals: z.array(z.string()),
  differences: z.array(z.string()),
  grnNumber: z.number().int().positive().optional(),
  sourceUrl: z.string().optional(),
  similarityScore: z.number().min(0).max(1).optional(),
  matchCriteria: z.array(z.string()).optional(),
  evidenceMatches: z.array(ComparableEvidenceMatchSchema).optional(),
})

export const ComparableActionSchema = z.object({
  id: z.string(),
  requirementId: z.string(),
  question: z.string(),
  priority: FindingSeveritySchema,
  synthesis: z.string(),
  amendmentAction: z.string(),
  researchAction: z.string(),
  evidenceNeeded: z.array(z.string()),
  subjectCitationPages: z.array(z.number().int().positive()),
  comparatorSupport: z.array(
    z.object({
      filingId: z.string(),
      filingName: z.string(),
      conclusion: z.enum([
        "directly_supportive",
        "supportive_with_limitations",
        "contextual_only",
        "not_transferable",
        "conflicting",
        "insufficient_information",
      ]),
      pageNumbers: z.array(z.number().int().positive()),
    })
  ),
})

export const FilingDiffItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: DiffStatusSchema,
  baselineExpectation: z.string(),
  draftSignal: z.string(),
  recommendedAction: z.string(),
  baselineStatus: EvidenceMatrixStatusSchema.optional(),
  draftStatus: EvidenceMatrixStatusSchema.optional(),
  change: EvidenceMatrixChangeSchema.optional(),
  baselineCitations: z.array(EvidenceCitationSchema).optional(),
  draftCitations: z.array(EvidenceCitationSchema).optional(),
  consistencyAdjustment: z.enum(["shared_evidence_regression_suppressed"]).optional(),
  consistencyReason: z.string().optional(),
})

export const ResearchReferenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.string(),
  year: z.string().optional(),
  relevance: z.string(),
  evidence: z.string(),
  authors: z.array(z.string()).optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  citation: z.string().optional(),
  origin: z.enum(["notifier_cited", "greenlit_recommended"]).optional(),
  verificationStatus: z
    .enum(["extracted_unverified", "metadata_verified", "source_verified"])
    .optional(),
  citedPages: z.array(z.number().int().positive()).optional(),
  verification: z
    .object({
      source: z.enum(["crossref"]),
      checkedAt: z.string(),
      matchMethod: z.enum(["doi", "title"]),
      confidence: z.number().min(0).max(1),
      matchedTitle: z.string(),
      matchedAuthors: z.array(z.string()),
      matchedYear: z.string(),
      matchedDoi: z.string(),
      matchedUrl: z.string(),
      conflicts: z.array(z.string()),
    })
    .optional(),
})

export const AmendmentOutlineSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  items: z.array(z.string()),
  priority: FindingSeveritySchema.optional(),
  domains: z.array(z.string()).optional(),
  relatedFindingIds: z.array(z.string()).optional(),
  citations: z.array(EvidenceCitationSchema).optional(),
  sequence: z.number().int().positive().optional(),
  ownerRole: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  deliverables: z.array(z.string()).optional(),
  sourceActionIds: z.array(z.string()).optional(),
  comparatorSources: z
    .array(
      z.object({
        filingName: z.string(),
        conclusion: z.string(),
        pageNumbers: z.array(z.number().int().positive()),
      })
    )
    .optional(),
})

export const EvidenceMatrixItemSchema = z.object({
  id: z.string(),
  domain: z.string(),
  requirement: z.string(),
  status: EvidenceMatrixStatusSchema,
  assessment: z.string(),
  evidenceSummary: z.string(),
  citations: z.array(EvidenceCitationSchema),
  unresolvedQuestions: z.array(z.string()),
  relatedFindingIds: z.array(z.string()),
})

export const ReportModulesSchema = z.object({
  documentationBenchmark: z.array(DocumentationBenchmarkItemSchema),
  evidenceMatrix: z.array(EvidenceMatrixItemSchema).default([]),
  safetySignals: z.array(SafetySignalSchema),
  comparableFilings: z.array(ComparableFilingSchema),
  comparableActions: z.array(ComparableActionSchema).default([]),
  filingDiff: z.array(FilingDiffItemSchema),
  researchReferences: z.array(ResearchReferenceSchema),
  amendmentOutline: z.array(AmendmentOutlineSectionSchema),
})

export const ReadinessReportSchema = z.object({
  id: z.string(),
  analysisId: z.string(),
  filingName: z.string(),
  readinessScore: z.number().min(0).max(100),
  status: ReportStatusSchema,
  summary: z.string(),
  caveats: z.array(z.string()),
  generatedAt: z.string(),
  textStats: TextStatsSchema,
  signals: z.array(ScoreSignalSchema),
  runMetadata: RunMetadataSchema,
  findings: z.array(FindingSchema),
  modules: ReportModulesSchema,
})

export const AnalysisRecordSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  filingName: z.string(),
  status: AnalysisStatusSchema,
  upload: ArtifactReferenceSchema.optional(),
  textArtifact: ArtifactReferenceSchema.optional(),
  report: ReadinessReportSchema.optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const WorkbookNoteSchema = z.object({
  id: z.string(),
  analysisId: z.string(),
  ownerId: z.string(),
  body: z.string(),
  status: WorkbookNoteStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>
export type ArtifactReference = z.infer<typeof ArtifactReferenceSchema>
export type TextStats = z.infer<typeof TextStatsSchema>
export type ScoreSignal = z.infer<typeof ScoreSignalSchema>
export type RunMetadata = z.infer<typeof RunMetadataSchema>
export type FindingSeverity = z.infer<typeof FindingSeveritySchema>
export type GapType = z.infer<typeof GapTypeSchema>
export type FindingConfidence = z.infer<typeof FindingConfidenceSchema>
export type EvidenceCitation = z.infer<typeof EvidenceCitationSchema>
export type WorkbookNoteStatus = z.infer<typeof WorkbookNoteStatusSchema>
export type Finding = z.infer<typeof FindingSchema>
export type DocumentationBenchmarkItem = z.infer<typeof DocumentationBenchmarkItemSchema>
export type EvidenceMatrixItem = z.infer<typeof EvidenceMatrixItemSchema>
export type SafetySignal = z.infer<typeof SafetySignalSchema>
export type ComparableFiling = z.infer<typeof ComparableFilingSchema>
export type ComparableAction = z.infer<typeof ComparableActionSchema>
export type FilingDiffItem = z.infer<typeof FilingDiffItemSchema>
export type ResearchReference = z.infer<typeof ResearchReferenceSchema>
export type AmendmentOutlineSection = z.infer<typeof AmendmentOutlineSectionSchema>
export type ReportModules = z.infer<typeof ReportModulesSchema>
export type ReadinessReport = z.infer<typeof ReadinessReportSchema>
export type AnalysisRecord = z.infer<typeof AnalysisRecordSchema>
export type WorkbookNote = z.infer<typeof WorkbookNoteSchema>

export const demoReport: ReadinessReport = {
  id: "demo-gras-report",
  analysisId: "demo-analysis",
  filingName: "Demo GRAS Notice",
  readinessScore: 72,
  status: "demo",
  summary:
    "The demo filing has enough structure for a preliminary review, with the largest risk in how safety evidence maps to the proposed use.",
  caveats: [
    "Demo content is fixture data and is not a legal or FDA determination.",
    "The minimum score is a readiness signal, not a substitute for expert review.",
  ],
  generatedAt: "2026-06-04T00:00:00.000Z",
  textStats: {
    pageCount: 18,
    wordCount: 8900,
    characterCount: 54000,
  },
  signals: [
    {
      id: "required-sections",
      label: "Required sections",
      score: 32,
      maxScore: 45,
      summary:
        "Most expected filing sections are present, but several need clearer evidence links.",
    },
    {
      id: "supporting-evidence",
      label: "Supporting evidence",
      score: 18,
      maxScore: 30,
      summary:
        "Safety and exposure evidence is present but not consistently mapped to intended use.",
    },
    {
      id: "extraction-quality",
      label: "Extraction quality",
      score: 22,
      maxScore: 25,
      summary: "The document is long enough for a useful first-pass analysis.",
    },
  ],
  runMetadata: {
    pipelineVersion: "demo-fixture-v1",
    extractor: "fixture",
    scorer: "fixture",
    modelProvider: null,
    modelUsage: [],
    estimatedCostUsd: 0,
    cacheHit: false,
  },
  findings: [
    {
      id: "safety-001",
      severity: "major",
      title: "Safety narrative needs tighter evidence mapping",
      summary:
        "The draft includes safety studies, but the report should connect each study to the intended use level and population more directly.",
      recommendedAction:
        "Add a study-by-study evidence table with dose, exposure, population, endpoint, and relevance to the proposed use.",
      evidence: ["Safety studies", "Dietary exposure", "Intended use"],
    },
    {
      id: "comparables-001",
      severity: "major",
      title: "Comparable filings need clearer rationale",
      summary:
        "Comparable notices are referenced, but the draft does not explain why they are the closest regulatory analogs.",
      recommendedAction:
        "Document the matching criteria for each comparable filing and call out material differences from the draft notice.",
      evidence: ["Comparable filings", "Regulatory history"],
    },
    {
      id: "docs-001",
      severity: "minor",
      title: "Manufacturing controls are under-specified",
      summary:
        "The manufacturing section describes the process flow but leaves several control points and release tests implicit.",
      recommendedAction:
        "Add the missing control points, acceptance criteria, and certificate-of-analysis references before submission review.",
      evidence: ["Manufacturing process", "Specifications"],
    },
  ],
  modules: {
    documentationBenchmark: [
      {
        id: "identity",
        label: "Substance identity",
        status: "present",
        summary: "The demo includes identity and composition context.",
        evidence: ["Identity", "Composition"],
      },
      {
        id: "safety",
        label: "Safety evidence",
        status: "weak",
        summary: "Safety evidence exists but needs clearer mapping to intended use.",
        evidence: ["Safety studies", "Dietary exposure"],
      },
    ],
    evidenceMatrix: [],
    safetySignals: [
      {
        id: "safety-mapping",
        label: "Safety-to-use mapping",
        level: "watch",
        summary: "Safety studies should be tied more directly to exposure and population.",
        evidence: ["Safety studies", "Intended use"],
      },
    ],
    comparableFilings: [
      {
        id: "general-gras-comparable",
        name: "Recent GRAS notice with similar safety narrative structure",
        status: "directional",
        rationale: "Useful as a structural comparator for evidence mapping.",
        sharedSignals: ["Safety narrative", "Dietary exposure", "Specifications"],
        differences: ["Exact substance and use pattern must be reviewed by a human."],
      },
    ],
    comparableActions: [],
    filingDiff: [
      {
        id: "safety-diff",
        label: "Safety narrative",
        status: "partial",
        baselineExpectation: "Each study maps to dose, endpoint, exposure, and intended use.",
        draftSignal: "The demo has safety content but incomplete mapping.",
        recommendedAction: "Add a safety evidence table keyed to intended use.",
      },
    ],
    researchReferences: [
      {
        id: "demo-reference",
        title: "Demo safety reference",
        source: "Fixture",
        year: "2026",
        relevance: "Represents the source context expected in a full report.",
        evidence: "Fixture evidence",
      },
    ],
    amendmentOutline: [
      {
        id: "safety-outline",
        title: "Safety evidence revisions",
        items: [
          "Add a study-by-study evidence table.",
          "Map each endpoint to intended use and exposure.",
        ],
      },
    ],
  },
}
