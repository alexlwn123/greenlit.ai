import { describe, expect, it } from "vitest"
import type { ComparableFiling, EvidenceMatrixItem } from "../../../packages/core/src/index.js"
import { mergeAssessments } from "./comparable-assessment.js"

const matrix: EvidenceMatrixItem[] = [
  {
    id: "manufacturing",
    domain: "manufacturing",
    requirement: "Process description and controls",
    status: "weak",
    assessment: "A scale-up question remains.",
    evidenceSummary: "The commercial process is described.",
    citations: [{ pageNumber: 20, excerpt: "Subject evidence" }],
    unresolvedQuestions: ["Is the commercial process representative?"],
    relatedFindingIds: [],
  },
]

const filings: ComparableFiling[] = [
  {
    id: "grn-1",
    name: "GRN 1",
    status: "no_questions",
    rationale: "Comparable process",
    sharedSignals: [],
    differences: [],
    evidenceMatches: [
      {
        requirementId: "manufacturing",
        requirement: "Process description and controls",
        relevanceScore: 0.8,
        rationale: "Matched passage",
        citations: [{ pageNumber: 12, excerpt: "Comparator evidence" }],
      },
    ],
  },
]

describe("mergeAssessments", () => {
  it("attaches assessments grounded in an allowed question and cited comparator page", () => {
    const result = mergeAssessments(
      filings,
      [
        {
          filingId: "grn-1",
          requirementId: "manufacturing",
          question: "Is the commercial process representative?",
          conclusion: "contextual_only",
          rationale: "The comparator shows a documentation pattern but uses a different process.",
          transferableElements: ["Process-control presentation"],
          limitations: ["Different ingredient and process"],
          comparatorCitationPages: [12],
        },
      ],
      matrix
    )

    expect(result[0]?.evidenceMatches?.[0]?.assessments?.[0]).toMatchObject({
      conclusion: "contextual_only",
      comparatorCitationPages: [12],
    })
  })

  it("rejects hallucinated questions and citation pages", () => {
    const result = mergeAssessments(
      filings,
      [
        {
          filingId: "grn-1",
          requirementId: "manufacturing",
          question: "An invented question",
          conclusion: "directly_supportive",
          rationale: "Unsupported",
          transferableElements: [],
          limitations: [],
          comparatorCitationPages: [99],
        },
      ],
      matrix
    )

    expect(result[0]?.evidenceMatches?.[0]?.assessments).toEqual([
      expect.objectContaining({
        conclusion: "insufficient_information",
        comparatorCitationPages: [12],
      }),
    ])
  })
})
