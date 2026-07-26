import { describe, expect, it } from "vitest"
import type {
  ComparableAction,
  ComparableFiling,
  EvidenceMatrixItem,
} from "../../../packages/core/src/index.js"
import { validateActions } from "./comparable-actions.js"

const matrix: EvidenceMatrixItem[] = [
  {
    id: "identity-composition",
    domain: "identity",
    requirement: "Identity and composition",
    status: "weak",
    assessment: "Representativeness is unresolved.",
    evidenceSummary: "Proteomics data are supplied.",
    citations: [{ pageNumber: 10, excerpt: "Subject excerpt" }],
    unresolvedQuestions: ["Was the analysis performed on a commercial batch?"],
    relatedFindingIds: [],
  },
]

const filings: ComparableFiling[] = [
  {
    id: "grn-1160",
    name: "GRN 1160 — Comparator",
    status: "withdrawn",
    rationale: "Direct predecessor",
    sharedSignals: [],
    differences: [],
    evidenceMatches: [
      {
        requirementId: "identity-composition",
        requirement: "Identity and composition",
        relevanceScore: 1,
        rationale: "Matched",
        citations: [{ pageNumber: 14, excerpt: "Comparator excerpt" }],
        assessments: [
          {
            question: "Was the analysis performed on a commercial batch?",
            conclusion: "supportive_with_limitations",
            rationale: "Relevant but incomplete.",
            transferableElements: ["Analytical framework"],
            limitations: ["Batch provenance is unclear"],
            comparatorCitationPages: [14],
          },
        ],
      },
    ],
  },
]

const action: ComparableAction = {
  id: "commercial-batch-analysis",
  requirementId: "identity-composition",
  question: "Was the analysis performed on a commercial batch?",
  priority: "major",
  synthesis: "The comparator supplies an analytical framework but not batch provenance.",
  amendmentAction: "Identify the tested lot and map it to commercial manufacturing records.",
  researchAction: "Verify existing chain-of-custody records before generating new data.",
  evidenceNeeded: ["Lot identifier", "Manufacturing record"],
  subjectCitationPages: [10],
  comparatorSupport: [
    {
      filingId: "grn-1160",
      filingName: "GRN 1160 — Comparator",
      conclusion: "supportive_with_limitations",
      pageNumbers: [14],
    },
  ],
}

describe("validateActions", () => {
  it("retains actions grounded in the exact question and comparator assessment", () => {
    expect(validateActions([action], matrix, filings)).toEqual([action])
  })

  it("rejects actions with unsupported comparator pages", () => {
    const invalid = {
      ...action,
      comparatorSupport: [
        {
          filingId: "grn-1160",
          filingName: "GRN 1160 — Comparator",
          conclusion: "supportive_with_limitations" as const,
          pageNumbers: [99],
        },
      ],
    }
    expect(validateActions([invalid], matrix, filings)).toEqual([])
  })
})
