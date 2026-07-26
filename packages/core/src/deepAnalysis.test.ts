import { describe, expect, it } from "vitest"
import {
  applyDeepAnalysis,
  calibrateFindings,
  calibrateSafetySignals,
  type DeepFinding,
  enforceEvidenceIntegrity,
  scoreDeepReadiness,
} from "./deepAnalysis"
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
    expect(report.runMetadata.scorer).toBe("legacy-severity-fallback-v1")
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

  it("requires grounding and deduplicates safety signals by cited evidence", () => {
    const citation = { pageNumber: 12, excerpt: "A treatment-related liver finding was observed." }
    const signals = calibrateSafetySignals([
      {
        id: "ungrounded",
        label: "Uncited concern",
        level: "gap",
        summary: "This concern has no filing support.",
        evidence: [],
        citations: [],
      },
      {
        id: "primary",
        label: "Treatment-related liver finding",
        level: "gap",
        summary: "The filing reports a treatment-related observation.",
        evidence: ["Liver finding"],
        citations: [citation],
      },
      {
        id: "duplicate",
        label: "Liver observation",
        level: "watch",
        summary: "The same passage was classified twice.",
        evidence: ["Liver finding"],
        citations: [citation],
      },
    ])

    expect(signals.map((signal) => signal.id)).toEqual(["primary"])
  })

  it("removes invalid model citations and downgrades unsupported matrix claims", () => {
    const valid = finding({ id: "valid", citations: [{ pageNumber: 2, excerpt: "Valid excerpt" }] })
    const invalid = finding({
      id: "invalid",
      citations: [{ pageNumber: 99, excerpt: "Page was not supplied" }],
    })
    const result = enforceEvidenceIntegrity({
      summary: "Integrity check",
      analyzedPages: [2],
      truncated: false,
      modelProvider: "test/provider",
      findings: [valid, invalid],
      evidenceMatrix: [
        {
          id: "safety",
          domain: "safety",
          requirement: "Safety support",
          status: "present",
          assessment: "The model claimed support.",
          evidenceSummary: "Unsupported citation.",
          citations: [{ pageNumber: 99, excerpt: "Unavailable page" }],
          unresolvedQuestions: [],
          relatedFindingIds: ["valid", "invalid", "unknown"],
        },
      ],
      researchReferences: [],
      safetySignals: [
        {
          id: "invalid-signal",
          label: "Invalid signal",
          level: "gap",
          summary: "Unsupported",
          evidence: [],
          citations: [{ pageNumber: 99, excerpt: "Unavailable page" }],
        },
      ],
    })

    expect(result.findings.map((item) => item.id)).toEqual(["valid"])
    expect(result.evidenceMatrix[0]).toMatchObject({
      status: "missing",
      citations: [],
      relatedFindingIds: ["valid"],
    })
    expect(result.evidenceMatrix[0]?.unresolvedQuestions).toContain(
      "Locate and cite filing evidence for this requirement."
    )
    expect(calibrateSafetySignals(result.safetySignals)).toEqual([])
  })

  it("collapses same-category findings grounded in the same passage", () => {
    const citation = { pageNumber: 8, excerpt: "The notice incorporates GRN 68 by reference." }
    const findings = [
      finding({ id: "major", severity: "major", citations: [citation] }),
      finding({ id: "minor", severity: "minor", citations: [citation] }),
    ]

    expect(calibrateFindings(findings).map((item) => item.id)).toEqual(["major"])
  })

  it("scores canonical domains transparently and excludes non-applicable rows", () => {
    const matrix = [
      matrixRow("identity-composition", "present"),
      matrixRow("public-pivotal-safety-evidence", "strong_with_minor_gaps"),
      matrixRow("allergenicity-assessment", "not_applicable"),
    ]
    const result = scoreDeepReadiness([], matrix)

    expect(result.method).toBe("importance-and-evidence-grade-v2")
    expect(result.score).toBe(85)
    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "domain-identity-composition", score: 10, maxScore: 10 }),
        expect.objectContaining({
          id: "domain-public-pivotal-safety-evidence",
          score: 11.25,
          maxScore: 15,
        }),
      ])
    )
    expect(result.signals.some((signal) => signal.id.includes("allergenicity"))).toBe(false)
  })
})

function matrixRow(
  id: string,
  status:
    | "present"
    | "strong_with_minor_gaps"
    | "substantial_gaps"
    | "weak"
    | "missing"
    | "not_applicable"
) {
  return {
    id,
    domain: id,
    requirement: id.replaceAll("-", " "),
    status,
    assessment: `${status} assessment`,
    evidenceSummary: "Evidence summary",
    citations:
      status === "not_applicable" || status === "missing"
        ? []
        : [{ pageNumber: 1, excerpt: "Evidence" }],
    unresolvedQuestions: [],
    relatedFindingIds: [],
  }
}

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
