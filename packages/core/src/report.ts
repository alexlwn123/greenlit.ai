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
  security: z
    .object({
      policyVersion: z.literal(1),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      inspectedAt: z.string(),
      malwareScan: z.discriminatedUnion("status", [
        z.object({ status: z.literal("not_configured") }),
        z.object({
          status: z.literal("clean"),
          engine: z.string(),
          engineVersion: z.string(),
          signatureVersion: z.string(),
          scannedAt: z.string(),
        }),
      ]),
    })
    .optional(),
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
export const EvidenceMatrixStatusSchema = z.enum([
  "present",
  "strong_with_minor_gaps",
  "substantial_gaps",
  "missing",
  "not_applicable",
  "weak",
])

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
  comparisonStrength: z.enum(["strong", "moderate", "weak"]).optional(),
  researchUse: z.enum(["evidence_candidate", "documentation_analog", "context_only"]).optional(),
  eligibilityRationale: z.string().optional(),
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
  changeType: z
    .enum([
      "support_added",
      "support_removed",
      "support_strengthened",
      "support_weakened",
      "support_modified",
      "unchanged",
      "not_comparable",
    ])
    .optional(),
  materiality: z.enum(["material", "potentially_material", "non_material"]).optional(),
  changeSummary: z.string().optional(),
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
  duplicateReferenceIds: z.array(z.string()).optional(),
  duplicateCount: z.number().int().positive().optional(),
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
  sourceVerification: z
    .object({
      source: z.enum(["pmc_full_text", "pubmed_abstract", "doi_resolver"]),
      checkedAt: z.string(),
      accessLevel: z.enum(["full_text", "abstract", "landing_page"]),
      identifier: z.string(),
      resolvedUrl: z.string(),
      contentCharacterCount: z.number().int().nonnegative(),
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
  filingName: "Sample Fermented Protein GRAS Notice",
  readinessScore: 51,
  status: "demo",
  summary:
    "The sample filing establishes identity and manufacturing controls, but material readiness risk remains in exposure bridging, public pivotal evidence, and the relationship between the tested article and the marketed ingredient.",
  caveats: [
    "Demo content is fixture data and is not a legal or FDA determination.",
    "All names, excerpts, page numbers, studies, and comparator conclusions in this sample are synthetic and demonstrate report behavior only.",
    "The domain-weighted score is a readiness signal, not a substitute for expert regulatory review.",
  ],
  generatedAt: "2026-06-04T00:00:00.000Z",
  textStats: {
    pageCount: 86,
    wordCount: 32140,
    characterCount: 198420,
  },
  signals: [
    {
      id: "foundational-evidence",
      label: "Foundational evidence",
      score: 27.5,
      maxScore: 30,
      summary: "Identity, manufacturing, and specifications are substantially documented.",
    },
    {
      id: "safety-exposure-evidence",
      label: "Safety and exposure evidence",
      score: 20,
      maxScore: 65,
      summary:
        "Exposure and pivotal-study support are incomplete for the proposed use and target population.",
    },
    {
      id: "supporting-documentation",
      label: "Supporting documentation",
      score: 3.75,
      maxScore: 5,
      summary: "Literature and allergenicity sections are useful but need reproducibility details.",
    },
  ],
  runMetadata: {
    pipelineVersion: "demo-fixture-v2",
    extractor: "page-aware synthetic fixture",
    scorer: "importance-and-evidence-grade-v2",
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
      citations: [
        {
          pageNumber: 54,
          section: "Part 6. Safety narrative",
          excerpt:
            "The 90-day study used fermentation batch FP-17 at dietary concentrations up to 5 percent.",
        },
        {
          pageNumber: 38,
          section: "Part 3. Dietary exposure",
          excerpt: "The estimated 90th percentile intake for consumers is 1.8 g/kg bw/day.",
        },
      ],
      gapType: "adequacy_gap",
      domain: "public_pivotal_evidence",
      confidence: "high",
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
      citations: [
        {
          pageNumber: 74,
          section: "Part 7. Regulatory context",
          excerpt:
            "Prior notices for fermented protein ingredients support the regulatory approach.",
        },
      ],
      gapType: "documentation_gap",
      domain: "independent_synthesis",
      confidence: "medium",
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
      citations: [
        {
          pageNumber: 24,
          section: "Part 2. Manufacturing",
          excerpt:
            "The biomass is heat treated, washed, dried, milled, and released for packaging.",
        },
      ],
      gapType: "documentation_gap",
      domain: "manufacturing",
      confidence: "high",
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
    evidenceMatrix: [
      {
        id: "identity-composition",
        domain: "identity",
        requirement: "Identity and composition of the notified substance",
        status: "present",
        assessment:
          "The organism, production strain, ingredient definition, and proximate composition are consistently described.",
        evidenceSummary: "Taxonomic confirmation and five-batch composition data are supplied.",
        citations: [
          {
            pageNumber: 12,
            section: "Part 1. Identity",
            excerpt:
              "FP-21 is the heat-inactivated and dried biomass of the production strain deposited as SAMPLE-101.",
          },
        ],
        unresolvedQuestions: [],
        relatedFindingIds: [],
      },
      {
        id: "manufacturing",
        domain: "manufacturing",
        requirement: "Manufacturing process and preventive controls",
        status: "strong_with_minor_gaps",
        assessment:
          "The process flow is described, but two critical control points lack quantitative operating ranges.",
        evidenceSummary:
          "Fermentation, heat treatment, washing, and drying are documented; release linkage is incomplete.",
        citations: [
          {
            pageNumber: 24,
            section: "Part 2. Manufacturing",
            excerpt:
              "The biomass is heat treated, washed, dried, milled, and released for packaging.",
          },
        ],
        unresolvedQuestions: [
          "What validated time-temperature range governs the kill step?",
          "Which release tests are linked to each critical control point?",
        ],
        relatedFindingIds: ["docs-001"],
      },
      {
        id: "specifications-batch-analysis",
        domain: "specifications",
        requirement: "Specifications, methods, and batch conformity",
        status: "present",
        assessment:
          "Chemical, microbiological, and contaminant limits are supported by methods and five production batches.",
        evidenceSummary:
          "The specification table maps acceptance criteria to methods and certificates of analysis.",
        citations: [
          {
            pageNumber: 31,
            section: "Part 2. Specifications",
            excerpt: "Each commercial lot must meet the limits in Table 2-6 before release.",
          },
        ],
        unresolvedQuestions: [],
        relatedFindingIds: [],
      },
      {
        id: "intended-uses-exposure",
        domain: "exposure",
        requirement: "Dietary exposure for proposed uses and populations",
        status: "substantial_gaps",
        assessment:
          "Consumer-only exposure is estimated, but background intake and non-consumer handling are not transparent.",
        evidenceSummary:
          "Mean and 90th percentile estimates are reported without reproducible food-code mappings.",
        citations: [
          {
            pageNumber: 38,
            section: "Part 3. Dietary exposure",
            excerpt: "The estimated 90th percentile intake for consumers is 1.8 g/kg bw/day.",
          },
        ],
        unresolvedQuestions: [
          "Which NHANES food codes and replacement factors produced the estimate?",
          "Does aggregate protein exposure change the margin to the study dose?",
        ],
        relatedFindingIds: ["safety-001"],
      },
      {
        id: "public-pivotal-safety-evidence",
        domain: "public_pivotal_evidence",
        requirement: "Publicly available pivotal safety evidence",
        status: "missing",
        assessment:
          "The pivotal 90-day study is summarized but neither published nor otherwise publicly available.",
        evidenceSummary: "A sponsor report is cited as the principal systemic-toxicity support.",
        citations: [
          {
            pageNumber: 54,
            section: "Part 6. Safety narrative",
            excerpt: "The unpublished 90-day study report is incorporated in Appendix F.",
          },
        ],
        unresolvedQuestions: [
          "What public evidence independently supports the pivotal conclusions?",
        ],
        relatedFindingIds: ["safety-001"],
      },
      {
        id: "independent-evidence-synthesis",
        domain: "independent_synthesis",
        requirement: "Independent synthesis and basis for the GRAS conclusion",
        status: "substantial_gaps",
        assessment:
          "The expert panel conclusion is provided, but its treatment of uncertainties is largely conclusory.",
        evidenceSummary:
          "Panel credentials and signed conclusion are present; uncertainty analysis is limited.",
        citations: [
          {
            pageNumber: 69,
            section: "Part 6. GRAS conclusion",
            excerpt: "The panel concluded that FP-21 is safe under the intended conditions of use.",
          },
        ],
        unresolvedQuestions: [
          "How did the panel resolve the test-article and exposure uncertainties?",
        ],
        relatedFindingIds: ["comparables-001"],
      },
      {
        id: "test-article-comparability",
        domain: "test_comparability",
        requirement: "Bridge from tested article to marketed ingredient",
        status: "substantial_gaps",
        assessment:
          "The tested batch predates the final drying process and is not analytically bridged to commercial lots.",
        evidenceSummary:
          "The study batch and market formulation share the strain but not fully documented processing conditions.",
        citations: [
          {
            pageNumber: 57,
            section: "Part 6. Test article",
            excerpt:
              "Batch FP-17 was produced before adoption of the current low-temperature drying step.",
          },
        ],
        unresolvedQuestions: [
          "Do composition and impurity profiles establish equivalence between FP-17 and commercial FP-21?",
        ],
        relatedFindingIds: ["safety-001"],
      },
      {
        id: "self-contained-literature-search",
        domain: "literature",
        requirement: "Reproducible literature search and adverse-evidence review",
        status: "strong_with_minor_gaps",
        assessment:
          "Search results are summarized, but databases, complete search strings, and cut-off dates are incomplete.",
        evidenceSummary:
          "Twenty-seven references are listed and adverse findings are discussed narratively.",
        citations: [
          {
            pageNumber: 72,
            section: "Part 6. Literature review",
            excerpt:
              "A literature search identified no evidence that would alter the safety conclusion.",
          },
        ],
        unresolvedQuestions: [
          "Can an independent reviewer reproduce the search and screening decisions?",
        ],
        relatedFindingIds: [],
      },
      {
        id: "allergenicity-assessment",
        domain: "allergenicity",
        requirement: "Allergenicity assessment for source and expressed proteins",
        status: "present",
        assessment:
          "Bioinformatic screening, digestibility, processing effects, and labeling implications are addressed.",
        evidenceSummary:
          "No sequence match above the stated threshold was reported; residual uncertainty is disclosed.",
        citations: [
          {
            pageNumber: 63,
            section: "Part 6. Allergenicity",
            excerpt:
              "No alignment met the predefined 35 percent identity threshold over 80 amino acids.",
          },
        ],
        unresolvedQuestions: [],
        relatedFindingIds: [],
      },
    ],
    safetySignals: [
      {
        id: "safety-mapping",
        label: "Pivotal evidence is not publicly available",
        level: "gap",
        summary:
          "The principal 90-day study is sponsor-held, limiting independent evaluation of the safety basis.",
        evidence: ["90-day study", "Public availability"],
        citations: [
          {
            pageNumber: 54,
            section: "Part 6. Safety narrative",
            excerpt: "The unpublished 90-day study report is incorporated in Appendix F.",
          },
        ],
      },
      {
        id: "test-article-bridge",
        label: "Study-to-market bridge remains unresolved",
        level: "watch",
        summary:
          "The study batch used a prior drying process and lacks a side-by-side impurity comparison.",
        evidence: ["Test article", "Commercial batches"],
        citations: [
          {
            pageNumber: 57,
            section: "Part 6. Test article",
            excerpt:
              "Batch FP-17 was produced before adoption of the current low-temperature drying step.",
          },
        ],
      },
      {
        id: "exposure-reproducibility",
        label: "Exposure estimate cannot be independently reproduced",
        level: "gap",
        summary:
          "The filing reports consumer intake outputs without the food-code crosswalk, replacement factors, or all-user sensitivity analysis needed to verify the margin to the study dose.",
        evidence: ["90th percentile intake", "Food-code crosswalk", "Margin of exposure"],
        citations: [
          {
            pageNumber: 38,
            section: "Part 3. Dietary exposure",
            excerpt: "The estimated 90th percentile intake for consumers is 1.8 g/kg bw/day.",
          },
        ],
      },
      {
        id: "uncertainty-synthesis",
        label: "Independent review does not resolve identified uncertainties",
        level: "watch",
        summary:
          "The expert panel conclusion does not explain how the exposure-model limitations and changed drying process affect confidence in the safety conclusion.",
        evidence: ["Expert panel", "Uncertainty analysis", "Weight of evidence"],
        citations: [
          {
            pageNumber: 69,
            section: "Part 6. GRAS conclusion",
            excerpt: "The panel concluded that FP-21 is safe under the intended conditions of use.",
          },
        ],
      },
      {
        id: "literature-search-reproducibility",
        label: "Adverse-evidence search is not reproducible",
        level: "watch",
        summary:
          "The filing states that no contrary evidence was found but omits complete search strings, database coverage, screening decisions, and a current cut-off date.",
        evidence: ["Literature search", "Contrary evidence", "Screening record"],
        citations: [
          {
            pageNumber: 72,
            section: "Part 6. Literature review",
            excerpt:
              "A literature search identified no evidence that would alter the safety conclusion.",
          },
        ],
      },
    ],
    comparableFilings: [
      {
        id: "sample-grn-1042",
        name: "Sample GRN 1042 — Fermented microbial protein",
        status: "no questions",
        rationale:
          "Strong production-family and intended-use match with a transparent exposure appendix and public pivotal publication.",
        sharedSignals: ["Fermented biomass", "Protein ingredient", "General-population uses"],
        differences: ["Different production organism", "Lower proposed maximum use level"],
        grnNumber: 1042,
        similarityScore: 0.86,
        matchCriteria: [
          "ingredient family",
          "production method",
          "intended use",
          "exposure method",
        ],
        comparisonStrength: "strong",
        researchUse: "evidence_candidate",
        eligibilityRationale:
          "May inform document structure and identify evidence to assess; it does not establish scientific equivalence.",
        evidenceMatches: [
          {
            requirementId: "exposure",
            requirement: "Dietary exposure for proposed uses and populations",
            relevanceScore: 0.91,
            rationale:
              "The comparator publishes food-code mappings and consumer/all-user estimates that directly answer the documentation question.",
            citations: [
              {
                pageNumber: 41,
                excerpt:
                  "Appendix C lists each food code, replacement factor, and resulting intake contribution.",
              },
            ],
            assessments: [
              {
                question: "Which food-code mappings should be disclosed?",
                conclusion: "supportive_with_limitations",
                rationale:
                  "The structure is transferable, but inputs and use levels must be specific to FP-21.",
                transferableElements: [
                  "food-code table structure",
                  "consumer and all-user sensitivity analysis",
                ],
                limitations: ["different organism", "lower maximum use level"],
                comparatorCitationPages: [41],
              },
            ],
          },
        ],
      },
      {
        id: "sample-grn-987",
        name: "Sample GRN 987 — Dried fungal protein concentrate",
        status: "no questions",
        rationale:
          "Moderate documentation analog with comparable biomass processing and a useful study-to-commercial-lot bridge, but a different organism and narrower food uses.",
        sharedSignals: ["Dried biomass", "Protein concentrate", "Commercial-lot bridge"],
        differences: [
          "Fungal rather than bacterial source",
          "Narrower intended-use categories",
          "Different allergenicity considerations",
        ],
        grnNumber: 987,
        similarityScore: 0.67,
        matchCriteria: ["production method", "ingredient form", "test-article documentation"],
        comparisonStrength: "moderate",
        researchUse: "documentation_analog",
        eligibilityRationale:
          "Useful for organizing the bridge analysis, but its scientific conclusions cannot be transferred to FP-21.",
        evidenceMatches: [
          {
            requirementId: "test-article-comparability",
            requirement: "Bridge from tested article to marketed ingredient",
            relevanceScore: 0.76,
            rationale:
              "The comparator uses a structured side-by-side table covering processing, composition, impurities, and lot release.",
            citations: [
              {
                pageNumber: 52,
                excerpt:
                  "Table 6-4 compares the study lot with three commercial lots across composition and impurity attributes.",
              },
            ],
            assessments: [
              {
                question: "How should the FP-17-to-FP-21 bridge be documented?",
                conclusion: "contextual_only",
                rationale:
                  "The comparison framework is useful, but the organism, drying process, and analytes differ.",
                transferableElements: [
                  "side-by-side bridge table",
                  "explicit difference disposition",
                ],
                limitations: ["different organism", "different process-specific impurities"],
                comparatorCitationPages: [52],
              },
            ],
          },
        ],
      },
      {
        id: "sample-grn-811",
        name: "Sample GRN 811 — Microbial biomass ingredient",
        status: "no questions",
        rationale:
          "A broad ingredient-family precedent with limited production and use-pattern similarity. Retained only for regulatory context.",
        sharedSignals: ["Microbial biomass", "Food ingredient", "General safety narrative"],
        differences: [
          "Distinct production organism and recovery process",
          "No comparable test-article bridge",
          "Different exposure population",
        ],
        grnNumber: 811,
        similarityScore: 0.38,
        matchCriteria: ["broad ingredient family", "regulatory pathway"],
        comparisonStrength: "weak",
        researchUse: "context_only",
        eligibilityRationale:
          "May orient the reviewer to the regulatory landscape; excluded from evidence transfer and action synthesis.",
      },
    ],
    comparableActions: [
      {
        id: "action-exposure-table",
        requirementId: "exposure",
        question: "Which food codes and replacement factors produced the intake estimate?",
        priority: "major",
        synthesis:
          "The subject filing reports outputs only; the strong comparator demonstrates a reproducible input table, with ingredient-specific limitations.",
        amendmentAction:
          "Add a food-code crosswalk, use-level assumptions, consumer/all-user outputs, and sensitivity analysis to Part 3.",
        researchAction:
          "Re-run the exposure model from the disclosed inputs and reconcile the result to the existing 90th-percentile estimate.",
        evidenceNeeded: [
          "Food-code crosswalk",
          "Use-level assumptions",
          "Reproducible model output",
        ],
        subjectCitationPages: [38],
        comparatorSupport: [
          {
            filingId: "sample-grn-1042",
            filingName: "Sample GRN 1042",
            conclusion: "supportive_with_limitations",
            pageNumbers: [41],
          },
        ],
      },
      {
        id: "action-test-article-bridge",
        requirementId: "test-article-comparability",
        question: "How should the FP-17-to-FP-21 bridge be documented?",
        priority: "critical",
        synthesis:
          "The subject filing identifies a process change but does not resolve its analytical relevance. The moderate comparator supplies a useful documentation pattern only.",
        amendmentAction:
          "Add a side-by-side bridge table covering process conditions, composition, impurities, specifications, and biological relevance, with an explicit disposition for every difference.",
        researchAction:
          "Generate targeted side-by-side analytical data for FP-17 and representative commercial FP-21 lots where the existing record cannot resolve comparability.",
        evidenceNeeded: [
          "Study-lot certificate and process record",
          "Commercial-lot analytical profiles",
          "Difference-by-difference biological relevance assessment",
        ],
        subjectCitationPages: [57],
        comparatorSupport: [
          {
            filingId: "sample-grn-987",
            filingName: "Sample GRN 987",
            conclusion: "contextual_only",
            pageNumbers: [52],
          },
        ],
      },
      {
        id: "action-public-evidence",
        requirementId: "public-pivotal-safety-evidence",
        question: "What public evidence independently supports the pivotal conclusions?",
        priority: "critical",
        synthesis:
          "The subject filing relies on an unpublished pivotal report. The strong comparator demonstrates how public evidence can be mapped to each endpoint without treating the comparator as substance-specific support.",
        amendmentAction:
          "Add a public-evidence table mapping each pivotal endpoint to accessible publications, the sponsor report, residual uncertainty, and the filing's independent conclusion.",
        researchAction:
          "Verify each candidate publication at full text, confirm test-material relevance, and document why it is pivotal, supportive, contextual, or not transferable.",
        evidenceNeeded: [
          "Verified public sources",
          "Endpoint-level evidence-role table",
          "Applicability and uncertainty assessment",
        ],
        subjectCitationPages: [54, 69],
        comparatorSupport: [
          {
            filingId: "sample-grn-1042",
            filingName: "Sample GRN 1042",
            conclusion: "supportive_with_limitations",
            pageNumbers: [41],
          },
        ],
      },
    ],
    filingDiff: [
      {
        id: "safety-diff",
        label: "Public pivotal evidence",
        status: "missing",
        baselineExpectation:
          "Pivotal evidence supporting the GRAS conclusion is publicly available for independent review.",
        draftSignal: "The sample relies principally on an unpublished sponsor report.",
        recommendedAction:
          "Provide a public pivotal source or a transparent independent evidence bridge.",
      },
      {
        id: "exposure-diff",
        label: "Exposure-model reproducibility",
        status: "partial",
        baselineExpectation:
          "Food codes, use levels, replacement factors, and population outputs can be independently reproduced.",
        draftSignal: "The result is reported, but the input crosswalk is omitted.",
        recommendedAction: "Add the complete input crosswalk and sensitivity analysis.",
      },
      {
        id: "identity-diff",
        label: "Substance identity",
        status: "aligned",
        baselineExpectation:
          "The notified substance, production strain, and composition are consistently defined.",
        draftSignal: "The identity definition is consistent across Parts 1, 2, and 6.",
        recommendedAction: "Maintain the current identity cross-references in the final filing.",
      },
    ],
    researchReferences: [
      {
        id: "demo-reference-90-day",
        title: "Synthetic 90-day dietary toxicity study of fermented protein FP-17",
        source: "Journal of Demonstration Toxicology",
        year: "2025",
        relevance:
          "Pivotal systemic-toxicity evidence cited by the notifier; the source is intentionally synthetic.",
        evidence:
          "Supports dose selection, clinical pathology, and no-observed-adverse-effect interpretation.",
        authors: ["A. Researcher", "B. Reviewer"],
        citation: "Researcher A, Reviewer B. 2025;12(3):100-118.",
        origin: "notifier_cited",
        verificationStatus: "extracted_unverified",
        citedPages: [54, 55, 58],
        duplicateCount: 2,
        duplicateReferenceIds: ["appendix-f-reference-12"],
      },
      {
        id: "demo-reference-allergenicity",
        title: "Synthetic bioinformatic allergenicity assessment of FP-21 proteins",
        source: "Notifier technical report",
        year: "2026",
        relevance: "Supports the sequence-comparison component of the allergenicity assessment.",
        evidence: "Reports search database, threshold, and alignment results.",
        authors: ["Sample Bioinformatics Group"],
        origin: "notifier_cited",
        verificationStatus: "metadata_verified",
        citedPages: [63, 64],
        verification: {
          source: "crossref",
          checkedAt: "2026-07-26T00:00:00.000Z",
          matchMethod: "title",
          confidence: 0.93,
          matchedTitle: "Synthetic bioinformatic allergenicity assessment of FP-21 proteins",
          matchedAuthors: ["Sample Bioinformatics Group"],
          matchedYear: "2026",
          matchedDoi: "DEMO-NOT-A-REAL-DOI",
          matchedUrl: "",
          conflicts: ["Demonstration metadata only; no external source is asserted."],
        },
      },
    ],
    amendmentOutline: [
      {
        id: "exposure-outline",
        title: "Part 3 — Rebuild the exposure appendix",
        items: [
          "Add the food-code and replacement-factor crosswalk.",
          "Report consumer, all-user, and sensitivity outputs.",
        ],
        priority: "major",
        domains: ["exposure"],
        relatedFindingIds: ["safety-001"],
        citations: [
          {
            pageNumber: 38,
            excerpt: "The estimated 90th percentile intake for consumers is 1.8 g/kg bw/day.",
          },
        ],
        sequence: 1,
        ownerRole: "Exposure scientist",
        dependencies: [],
        deliverables: ["Reproducible exposure workbook", "Part 3 replacement text"],
        sourceActionIds: ["action-exposure-table"],
        comparatorSources: [
          {
            filingName: "Sample GRN 1042",
            conclusion: "supportive_with_limitations",
            pageNumbers: [41],
          },
        ],
      },
      {
        id: "safety-outline",
        title: "Part 6 — Close the pivotal-evidence and test-article bridge",
        items: [
          "Create a study-by-study evidence table keyed to exposure.",
          "Compare FP-17 and commercial FP-21 composition and impurity profiles.",
          "Provide a public evidence basis for pivotal conclusions.",
        ],
        priority: "critical",
        domains: ["public_pivotal_evidence", "test_comparability"],
        relatedFindingIds: ["safety-001"],
        citations: [
          {
            pageNumber: 54,
            excerpt: "The unpublished 90-day study report is incorporated in Appendix F.",
          },
          {
            pageNumber: 57,
            excerpt:
              "Batch FP-17 was produced before adoption of the current low-temperature drying step.",
          },
        ],
        sequence: 2,
        ownerRole: "Toxicologist and CMC lead",
        dependencies: ["Reproducible exposure workbook"],
        deliverables: [
          "Test-article bridge memorandum",
          "Public-evidence appendix",
          "Revised weight-of-evidence narrative",
        ],
        sourceActionIds: [],
        comparatorSources: [],
      },
      {
        id: "manufacturing-outline",
        title: "Part 2 — Complete process controls and release linkage",
        items: [
          "State the validated kill-step time and temperature ranges.",
          "Map each critical control point to monitoring, deviation handling, and lot-release tests.",
          "Cross-reference representative certificates of analysis to the final specification table.",
        ],
        priority: "major",
        domains: ["manufacturing", "specifications"],
        relatedFindingIds: ["docs-001"],
        citations: [
          {
            pageNumber: 24,
            excerpt:
              "The biomass is heat treated, washed, dried, milled, and released for packaging.",
          },
        ],
        sequence: 3,
        ownerRole: "CMC and quality lead",
        dependencies: [],
        deliverables: [
          "Validated process-control table",
          "Deviation and release-test crosswalk",
          "Revised Part 2 narrative",
        ],
        sourceActionIds: [],
        comparatorSources: [],
      },
      {
        id: "literature-outline",
        title: "Part 6 — Make the literature review reproducible",
        items: [
          "Document databases, complete search strings, date ranges, and final search date.",
          "Provide inclusion and exclusion criteria with a screening disposition table.",
          "Separate supportive, neutral, and potentially contrary evidence and explain each disposition.",
        ],
        priority: "major",
        domains: ["literature", "independent_synthesis"],
        relatedFindingIds: [],
        citations: [
          {
            pageNumber: 72,
            excerpt:
              "A literature search identified no evidence that would alter the safety conclusion.",
          },
        ],
        sequence: 4,
        ownerRole: "Scientific information specialist",
        dependencies: ["Public-evidence appendix"],
        deliverables: [
          "Search protocol and reproducible strings",
          "Screening log",
          "Updated contrary-evidence narrative",
        ],
        sourceActionIds: [],
        comparatorSources: [],
      },
      {
        id: "panel-outline",
        title: "Part 6 — Refresh the independent GRAS synthesis",
        items: [
          "Present the corrected exposure margin and test-article bridge to the expert reviewers.",
          "Require an explicit uncertainty-by-uncertainty disposition.",
          "Update the signed conclusion and cross-reference the final public evidence set.",
        ],
        priority: "critical",
        domains: ["independent_synthesis", "exposure", "test_comparability"],
        relatedFindingIds: ["safety-001", "comparables-001"],
        citations: [
          {
            pageNumber: 69,
            excerpt: "The panel concluded that FP-21 is safe under the intended conditions of use.",
          },
        ],
        sequence: 5,
        ownerRole: "Regulatory lead and independent expert panel",
        dependencies: [
          "Reproducible exposure workbook",
          "Test-article bridge memorandum",
          "Updated contrary-evidence narrative",
        ],
        deliverables: [
          "Uncertainty disposition matrix",
          "Updated signed GRAS conclusion",
          "Final Part 6 cross-reference audit",
        ],
        sourceActionIds: [],
        comparatorSources: [],
      },
    ],
  },
}
