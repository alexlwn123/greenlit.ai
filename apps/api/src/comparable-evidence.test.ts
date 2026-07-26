import type { ComparableFiling, EvidenceMatrixItem, NoticeProfile } from "@greenlit/core"
import { describe, expect, it } from "vitest"
import { enrichComparableEvidence, retrieveRequirementEvidence } from "./comparable-evidence.js"

describe("retrieveRequirementEvidence", () => {
  it("ranks requirement-specific comparator passages with page citations", () => {
    const matches = retrieveRequirementEvidence(
      [
        {
          pageNumber: 4,
          text: "General identity and administrative information.",
        },
        {
          pageNumber: 38,
          text: `Subchronic toxicology
          A 90-day oral toxicity study identified a NOAEL for the test article.
          The published study evaluated repeated-dose endpoints.`,
        },
        {
          pageNumber: 52,
          text: "The manufacturing process uses filtration and quality control.",
        },
      ],
      {
        id: "public-pivotal-safety-evidence",
        requirement: "Public availability and peer review of pivotal evidence",
      }
    )

    expect(matches[0]).toMatchObject({
      pageNumber: 38,
      section: undefined,
    })
    expect(matches[0]?.score).toBeGreaterThan(0.5)
    expect(matches[0]?.excerpt).toContain("90-day")
  })

  it("returns no match when a filing has no requirement-specific terms", () => {
    const matches = retrieveRequirementEvidence(
      [{ pageNumber: 1, text: "Cover page and table of contents." }],
      {
        id: "allergenicity-assessment",
        requirement: "Protein allergenicity and cross-reactivity assessment",
      }
    )

    expect(matches).toEqual([])
  })

  it("does not retrieve passages for context-only metadata matches", async () => {
    const filing: ComparableFiling = {
      id: "weak-match",
      name: "Weak match",
      status: "no_questions",
      rationale: "Broad category only",
      sharedSignals: [],
      differences: [],
      grnNumber: 999,
      researchUse: "context_only",
    }
    const profile = {
      grnNumber: 999,
      substanceName: "Weak match",
      substanceType: "other",
      productionMethod: "unknown",
      intendedUses: [],
      targetPopulation: "general_population",
      grasBasis: "scientific_procedures",
      safetyDataAvailable: [],
      localPdfPath: "this-file-must-not-be-read.pdf",
    } satisfies NoticeProfile
    const matrix: EvidenceMatrixItem[] = [
      {
        id: "identity-composition",
        domain: "identity",
        requirement: "Identity",
        status: "weak",
        assessment: "Unresolved",
        evidenceSummary: "Limited",
        citations: [],
        unresolvedQuestions: ["What is the identity?"],
        relatedFindingIds: [],
      },
    ]

    const [result] = await enrichComparableEvidence({
      filings: [filing],
      profiles: [profile],
      evidenceMatrix: matrix,
    })
    expect(result?.evidenceMatches).toBeUndefined()
  })
})
