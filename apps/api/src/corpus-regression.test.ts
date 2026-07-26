import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import {
  compareEvidenceMatrices,
  DeepAnalysisResultSchema,
} from "../../../packages/core/src/index.js"

const grn1256ResultUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1256-deep-evidence-v2.raw.json",
  import.meta.url
)
const grn1160MatrixResultUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1160-deep-evidence-v2.raw.json",
  import.meta.url
)
const grn1160ReferenceResultUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1160-deep-evidence-v3.raw.json",
  import.meta.url
)
const grn1160CrossrefResultUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1160-crossref-verification-v1.json",
  import.meta.url
)
const grn1256ComparableEvidenceUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1256-comparable-evidence-v1.json",
  import.meta.url
)
const grn1256ComparableAssessmentUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1256-comparable-assessment-v1.json",
  import.meta.url
)
const grn1256ComparableActionsUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1256-comparable-actions-v1.json",
  import.meta.url
)
const grn1256AmendmentExecutionUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1256-amendment-execution-v1.json",
  import.meta.url
)
const additionalPairPassagesUrl = new URL(
  "../../../fixtures/evaluations/results/additional-resubmission-pairs-passage-baseline-v1.json",
  import.meta.url
)
const grn755DeepResultUrl = new URL(
  "../../../fixtures/evaluations/results/grn-0755-d-psicose-deep-evidence-v1.raw.json",
  import.meta.url
)
const additionalPairDeepComparisonUrl = new URL(
  "../../../fixtures/evaluations/results/additional-resubmission-pairs-deep-comparison-v1.json",
  import.meta.url
)

const expectedMatrixIds = [
  "identity-composition",
  "manufacturing",
  "specifications-batch-analysis",
  "intended-uses-exposure",
  "public-pivotal-safety-evidence",
  "independent-evidence-synthesis",
  "test-article-comparability",
  "self-contained-literature-search",
  "allergenicity-assessment",
]

describe("GRN 1160 evidence-matrix control", () => {
  it("covers every canonical requirement with grounded evidence", async () => {
    const result = DeepAnalysisResultSchema.parse(
      JSON.parse(await readFile(grn1160MatrixResultUrl, "utf8"))
    )

    expect(result.evidenceMatrix.map((item) => item.id)).toEqual(expectedMatrixIds)
    expect(
      result.evidenceMatrix.every((item) => item.status === "missing" || item.citations.length > 0)
    ).toBe(true)
  })

  it("marks the three FDA-confirmed evidence foundations weak and links valid findings", async () => {
    const result = DeepAnalysisResultSchema.parse(
      JSON.parse(await readFile(grn1160MatrixResultUrl, "utf8"))
    )
    const matrixById = new Map(result.evidenceMatrix.map((item) => [item.id, item]))
    const findingIds = new Set(result.findings.map((finding) => finding.id))

    expect(matrixById.get("public-pivotal-safety-evidence")?.status).toBe("weak")
    expect(matrixById.get("independent-evidence-synthesis")?.status).toBe("weak")
    expect(matrixById.get("test-article-comparability")?.status).toBe("weak")
    expect(
      result.evidenceMatrix
        .flatMap((item) => item.relatedFindingIds)
        .every((findingId) => findingIds.has(findingId))
    ).toBe(true)
  })
})

describe("GRN 1160 reference-extraction control", () => {
  it("extracts a corpus-compatible filing profile and prioritized notifier references", async () => {
    const result = await readResult(grn1160ReferenceResultUrl)

    expect(result.filingProfile).toMatchObject({
      substanceType: "protein",
      productionMethod: "extraction",
    })
    expect(result.researchReferences.length).toBeGreaterThan(10)
    expect(result.researchReferences.length).toBeLessThanOrEqual(15)
    expect(
      result.researchReferences.some((reference) =>
        reference.title.toLowerCase().includes("repeated-dose toxicity")
      )
    ).toBe(true)
  })

  it("preserves notifier provenance without claiming independent verification", async () => {
    const result = await readResult(grn1160ReferenceResultUrl)

    expect(
      result.researchReferences.every(
        (reference) =>
          reference.origin === "notifier_cited" &&
          reference.verificationStatus === "extracted_unverified" &&
          (reference.citedPages?.length ?? 0) > 0
      )
    ).toBe(true)
  })
})

describe("GRN 1160 Crossref-verification control", () => {
  it("preserves all references and records metadata conflicts", async () => {
    const result = JSON.parse(await readFile(grn1160CrossrefResultUrl, "utf8")) as {
      counts: {
        total: number
        metadataVerified: number
        unverified: number
        conflicts: number
      }
      references: Array<{
        verificationStatus: string
        verification?: { conflicts: string[] }
      }>
    }

    expect(result.counts).toEqual({
      total: 15,
      metadataVerified: 15,
      unverified: 0,
      conflicts: 4,
    })
    expect(
      result.references.every((reference) => reference.verificationStatus === "metadata_verified")
    ).toBe(true)
  })
})

describe("GRN 1256 approved-resubmission control", () => {
  it("covers the canonical matrix and resolves every row beyond missing", async () => {
    const result = DeepAnalysisResultSchema.parse(
      JSON.parse(await readFile(grn1256ResultUrl, "utf8"))
    )
    const matrixById = new Map(result.evidenceMatrix.map((item) => [item.id, item]))

    expect(result.evidenceMatrix.map((item) => item.id)).toEqual(expectedMatrixIds)
    expect(result.evidenceMatrix.every((item) => item.status !== "missing")).toBe(true)
    expect(matrixById.get("public-pivotal-safety-evidence")?.status).toBe("present")
    expect(matrixById.get("independent-evidence-synthesis")?.status).not.toBe("missing")
    expect(matrixById.get("test-article-comparability")?.status).not.toBe("missing")
  })

  it("does not repeat the three GRN 1160 deficiencies as absent", async () => {
    const result = DeepAnalysisResultSchema.parse(
      JSON.parse(await readFile(grn1256ResultUrl, "utf8"))
    )

    const incorporation = result.findings.find(
      (finding) => finding.category === "incorporation_independent_conclusions"
    )
    const publicEvidence = result.findings.find(
      (finding) => finding.category === "public_pivotal_evidence"
    )
    const pivotalBridge = result.findings.find(
      (finding) => finding.category === "test_article_bridge" && finding.evidenceRole === "pivotal"
    )

    expect(incorporation?.bridgeAssessment).not.toBe("missing")
    expect(publicEvidence?.evidenceRole).toBe("supportive")
    expect(pivotalBridge?.bridgeAssessment).not.toBe("missing")
  })

  it("keeps every citation inside the selected page set", async () => {
    const result = DeepAnalysisResultSchema.parse(
      JSON.parse(await readFile(grn1256ResultUrl, "utf8"))
    )
    const analyzedPages = new Set(result.analyzedPages)
    const citations = [
      ...result.findings.flatMap((finding) => finding.citations),
      ...result.safetySignals.flatMap((signal) => signal.citations ?? []),
    ]

    expect(citations.length).toBeGreaterThan(0)
    expect(citations.every((citation) => analyzedPages.has(citation.pageNumber))).toBe(true)
    expect(citations.every((citation) => citation.excerpt.trim().length > 0)).toBe(true)
  })
})

describe("GRN 1256 comparable-evidence control", () => {
  it("retrieves substantive passages for every requirement from the top three comparators", async () => {
    const result = JSON.parse(await readFile(grn1256ComparableEvidenceUrl, "utf8")) as {
      comparables: Array<{
        grnNumber: number
        evidenceMatches?: Array<{
          requirementId: string
          citations: Array<{ pageNumber: number; excerpt: string }>
        }>
      }>
    }
    const topThree = result.comparables.slice(0, 3)

    expect(topThree.map((filing) => filing.grnNumber)).toEqual([1160, 1072, 1151])
    expect(topThree.every((filing) => filing.evidenceMatches?.length === 9)).toBe(true)
    expect(
      topThree
        .flatMap((filing) => filing.evidenceMatches ?? [])
        .every(
          (match) =>
            match.citations.length > 0 &&
            match.citations.every(
              (citation) =>
                citation.pageNumber > 0 &&
                citation.excerpt.length > 80 &&
                !citation.excerpt.toLowerCase().includes("table of contents")
            )
        )
    ).toBe(true)
  })

  it("classifies all unresolved question/comparator pairs conservatively", async () => {
    const result = JSON.parse(await readFile(grn1256ComparableAssessmentUrl, "utf8")) as {
      comparables: Array<{
        evidenceMatches?: Array<{
          assessments?: Array<{
            conclusion: string
            comparatorCitationPages: number[]
            rationale: string
          }>
        }>
      }>
    }
    const assessments = result.comparables.flatMap((filing) =>
      (filing.evidenceMatches ?? []).flatMap((match) => match.assessments ?? [])
    )

    expect(assessments).toHaveLength(15)
    expect(
      assessments.every(
        (assessment) =>
          assessment.comparatorCitationPages.length > 0 && assessment.rationale.length > 40
      )
    ).toBe(true)
    expect(
      assessments.filter((assessment) => assessment.conclusion === "directly_supportive")
    ).toHaveLength(0)
    expect(assessments.some((assessment) => assessment.conclusion === "not_transferable")).toBe(
      true
    )
  })

  it("turns each unresolved question into a citation-backed amendment and research action", async () => {
    const result = JSON.parse(await readFile(grn1256ComparableActionsUrl, "utf8")) as {
      actions: Array<{
        amendmentAction: string
        researchAction: string
        subjectCitationPages: number[]
        comparatorSupport: Array<{ pageNumbers: number[] }>
      }>
    }

    expect(result.actions).toHaveLength(5)
    expect(
      result.actions.every(
        (action) =>
          action.amendmentAction.length > 40 &&
          action.researchAction.length > 40 &&
          action.subjectCitationPages.length > 0 &&
          action.comparatorSupport.every((support) => support.pageNumbers.length > 0)
      )
    ).toBe(true)
    expect(
      result.actions.some((action) =>
        /no new (evidence|study)|existing [^.]{0,40}records/i.test(action.researchAction)
      )
    ).toBe(true)
  })

  it("orders the five actions into owned, dependency-aware work packages", async () => {
    const result = JSON.parse(await readFile(grn1256AmendmentExecutionUrl, "utf8")) as {
      workPackages: Array<{
        sequence: number
        ownerRole: string
        dependencies: string[]
        deliverables: string[]
        citations: Array<{ pageNumber: number }>
        comparatorSources: Array<{ pageNumbers: number[] }>
        domains: string[]
      }>
    }

    expect(result.workPackages.map((section) => section.sequence)).toEqual([1, 2, 3, 4, 5])
    expect(
      result.workPackages.every(
        (section) =>
          section.ownerRole &&
          section.deliverables.length > 0 &&
          section.citations.length > 0 &&
          section.comparatorSources.every((source) => source.pageNumbers.length > 0)
      )
    ).toBe(true)
    expect(result.workPackages.at(-1)).toMatchObject({
      domains: ["independent-evidence-synthesis"],
      dependencies: expect.arrayContaining(["outline-action-action-001"]),
    })
  })
})

describe("GRN 1160 to GRN 1256 filing diff", () => {
  it("identifies four citation-backed documentation improvements", async () => {
    const [baseline, draft] = await Promise.all([
      readResult(grn1160MatrixResultUrl),
      readResult(grn1256ResultUrl),
    ])
    const diff = compareEvidenceMatrices(baseline.evidenceMatrix, draft.evidenceMatrix)

    expect(diff).toHaveLength(9)
    expect(diff.filter((item) => item.change === "improved").map((item) => item.label)).toEqual([
      "Process description and process-related controls",
      "Specifications and representative batch results",
      "Public availability and peer review of pivotal evidence",
      "Search methods, scope, and unfavorable information",
    ])
    expect(diff.every((item) => item.baselineCitations?.length)).toBeTruthy()
    expect(diff.every((item) => item.draftCitations?.length)).toBeTruthy()
  })

  it("retains partial status for unresolved bridge and synthesis questions", async () => {
    const [baseline, draft] = await Promise.all([
      readResult(grn1160MatrixResultUrl),
      readResult(grn1256ResultUrl),
    ])
    const byId = new Map(
      compareEvidenceMatrices(baseline.evidenceMatrix, draft.evidenceMatrix).map((item) => [
        item.id,
        item,
      ])
    )

    expect(byId.get("diff-independent-evidence-synthesis")).toMatchObject({
      change: "unchanged",
      status: "partial",
    })
    expect(byId.get("diff-test-article-comparability")).toMatchObject({
      change: "unchanged",
      status: "partial",
    })
  })
})

describe("additional resubmission-pair calibration", () => {
  it("retains page-level passage coverage across three diverse pairs", async () => {
    const result = JSON.parse(await readFile(additionalPairPassagesUrl, "utf8")) as {
      pairs: Array<{
        baseline: { requirements: Array<{ citations: unknown[] }> }
        revised: { requirements: Array<{ citations: unknown[] }> }
      }>
    }

    expect(result.pairs).toHaveLength(3)
    expect(
      result.pairs.every(
        (pair) =>
          pair.baseline.requirements.length === 9 &&
          pair.revised.requirements.length === 9 &&
          pair.baseline.requirements.filter((item) => item.citations.length > 0).length >= 8 &&
          pair.revised.requirements.filter((item) => item.citations.length > 0).length >=
            pair.baseline.requirements.filter((item) => item.citations.length > 0).length
      )
    ).toBe(true)
  })

  it("produces a fully cited exploratory deep analysis for withdrawn GRN 755", async () => {
    const result = await readResult(grn755DeepResultUrl)

    expect(result.evidenceMatrix.map((item) => item.id)).toEqual(expectedMatrixIds)
    expect(result.findings.length).toBeGreaterThan(0)
    expect(
      result.findings.every(
        (finding) =>
          finding.citations.length > 0 &&
          finding.citations.every((citation) => citation.excerpt.length > 0)
      )
    ).toBe(true)
  })

  it("captures cross-pair resolution signals and calibrated finding counts", async () => {
    const result = JSON.parse(await readFile(additionalPairDeepComparisonUrl, "utf8")) as {
      comparisons: Array<{
        baseline: { rawFindingCount: number; calibratedFindingCount: number }
        revised: { rawFindingCount: number; calibratedFindingCount: number }
        matrixDiff: Array<{
          id: string
          change: string
          baselineStatus?: string
          draftStatus?: string
          consistencyAdjustment?: string
        }>
      }>
    }

    expect(result.comparisons).toHaveLength(3)
    expect(result.comparisons[0]?.matrixDiff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "diff-intended-uses-exposure",
          change: "improved",
        }),
      ])
    )
    expect(result.comparisons[2]?.matrixDiff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "diff-test-article-comparability",
          change: "improved",
        }),
        expect.objectContaining({
          id: "diff-public-pivotal-safety-evidence",
          change: "unchanged",
          consistencyAdjustment: "shared_evidence_regression_suppressed",
        }),
      ])
    )
    expect(result.comparisons[0]?.baseline.calibratedFindingCount).toBe(5)
    expect(result.comparisons[2]?.revised.calibratedFindingCount).toBe(4)
  })
})

async function readResult(url: URL) {
  return DeepAnalysisResultSchema.parse(JSON.parse(await readFile(url, "utf8")))
}
