import { describe, expect, it } from "vitest"
import { applyDeepAnalysis, calibrateFindings, type DeepFinding } from "./deepAnalysis"
import { createMinimumReadinessReport } from "./minimumScore"

describe("applyDeepAnalysis", () => {
  it("replaces keyword findings with grounded evidence findings", () => {
    const minimum = createMinimumReadinessReport({
      analysisId: "analysis-deep",
      filingName: "notice.pdf",
      extractedText:
        "Identity composition intended use manufacturing specifications safety exposure references.",
      generatedAt: "2026-07-24T00:00:00.000Z",
    })

    const report = applyDeepAnalysis(minimum, {
      summary: "The evidence bridge is incomplete.",
      analyzedPages: [10],
      truncated: false,
      modelProvider: "test/provider",
      evidenceMatrix: [],
      researchReferences: [],
      findings: [
        {
          id: "test-article-bridge",
          category: "test_article_bridge",
          severity: "critical",
          title: "Test-article bridge is incomplete",
          summary: "The studied material differs from the target ingredient.",
          recommendedAction: "Provide a structured composition and exposure comparison.",
          evidence: ["Comparator composition differs"],
          citations: [
            {
              pageNumber: 10,
              excerpt: "Plantible draws upon safety information for a related product.",
            },
          ],
          gapType: "adequacy_gap",
          domain: "safety_data",
          confidence: "high",
          evidenceRole: "pivotal",
          availability: "public_peer_reviewed",
          supportingMaterial: "Related duckweed powder",
          targetMaterial: "LLP",
          testArticle: "Related duckweed powder",
          bridgeAssessment: "partial",
        },
      ],
      safetySignals: [],
    })

    expect(report.readinessScore).toBe(90)
    expect(report.findings[0]?.citations?.[0]?.pageNumber).toBe(10)
    expect(report.modules.documentationBenchmark.find((item) => item.id === "safety")?.status).toBe(
      "weak"
    )
    expect(report.modules.amendmentOutline[0]).toMatchObject({
      id: "outline-part-4-safety",
      priority: "critical",
      relatedFindingIds: ["test-article-bridge"],
    })
    expect(report.modules.amendmentOutline[0]?.citations?.[0]?.pageNumber).toBe(10)
    expect(report.runMetadata.scorer).toBe("original-domain-analysis-port-v1")
  })

  it("derives the benchmark and filing diff from the evidence matrix", () => {
    const minimum = createMinimumReadinessReport({
      analysisId: "analysis-matrix",
      filingName: "notice.pdf",
      extractedText: "Identity and composition are described.",
      generatedAt: "2026-07-24T00:00:00.000Z",
    })

    const report = applyDeepAnalysis(minimum, {
      summary: "Identity is documented but incompletely supported.",
      analyzedPages: [4],
      truncated: false,
      modelProvider: "test/provider",
      findings: [],
      evidenceMatrix: [
        {
          id: "identity-composition",
          domain: "identity_characterization",
          requirement: "Identity, source, composition, and specifications",
          status: "weak",
          assessment: "Identity is present, but composition support is incomplete.",
          evidenceSummary: "The filing names the ingredient and source.",
          citations: [{ pageNumber: 4, excerpt: "The ingredient is Lemna leaf protein." }],
          unresolvedQuestions: ["Are the batches representative of commercial production?"],
          relatedFindingIds: [],
        },
      ],
      researchReferences: [],
      safetySignals: [],
    })

    expect(report.modules.evidenceMatrix).toHaveLength(1)
    expect(report.modules.documentationBenchmark[0]?.status).toBe("weak")
    expect(report.modules.filingDiff[0]).toMatchObject({
      status: "partial",
      label: "Identity, source, composition, and specifications",
    })
    expect(report.modules.filingDiff[0]?.recommendedAction).toContain("representative")
  })

  it("suppresses low-value private supportive findings and duplicate GRN incorporation findings", () => {
    const findings = [
      finding({
        id: "incorporation-major",
        category: "incorporation_independent_conclusions",
        severity: "major",
        supportingMaterial: "GRN 68 Appendix I",
      }),
      finding({
        id: "incorporation-minor",
        category: "incorporation_independent_conclusions",
        severity: "minor",
        supportingMaterial: "GRN 0068",
      }),
      finding({
        id: "private-supportive",
        category: "safety_data",
        severity: "minor",
        evidenceRole: "supportive",
        availability: "private",
      }),
    ]

    expect(calibrateFindings(findings).map((item) => item.id)).toEqual(["incorporation-major"])
  })
})

function finding(overrides: Partial<DeepFinding> & Pick<DeepFinding, "id">): DeepFinding {
  return {
    category: "safety_data",
    severity: "major",
    title: "Evidence finding",
    summary: "The filing contains an evidence issue.",
    recommendedAction: "Resolve the evidence issue.",
    evidence: ["Evidence"],
    citations: [{ pageNumber: 1, excerpt: "Filing excerpt" }],
    gapType: "adequacy_gap",
    domain: "safety_data",
    confidence: "high",
    evidenceRole: "pivotal",
    availability: "unknown",
    supportingMaterial: null,
    targetMaterial: null,
    testArticle: null,
    bridgeAssessment: "unknown",
    ...overrides,
  }
}
