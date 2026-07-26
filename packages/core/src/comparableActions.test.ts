import { describe, expect, it } from "vitest"
import { mergeComparableActionsIntoOutline } from "./comparableActions.js"
import type { AmendmentOutlineSection, ComparableAction, EvidenceMatrixItem } from "./report.js"

const matrix: EvidenceMatrixItem[] = [
  {
    id: "identity-composition",
    domain: "identity",
    requirement: "Identity and composition",
    status: "weak",
    assessment: "Batch provenance is unresolved.",
    evidenceSummary: "Proteomics data are supplied.",
    citations: [{ pageNumber: 13, excerpt: "Subject identity evidence" }],
    unresolvedQuestions: ["Was the tested lot commercially produced?"],
    relatedFindingIds: [],
  },
  {
    id: "independent-evidence-synthesis",
    domain: "evidence synthesis",
    requirement: "Independent conclusion",
    status: "weak",
    assessment: "The conclusion needs independent framing.",
    evidenceSummary: "A panel statement is supplied.",
    citations: [{ pageNumber: 257, excerpt: "Panel statement" }],
    unresolvedQuestions: ["Did the panel reach an independent conclusion?"],
    relatedFindingIds: [],
  },
]

const actions: ComparableAction[] = [
  action({
    id: "batch-provenance",
    requirementId: "identity-composition",
    question: "Was the tested lot commercially produced?",
  }),
  action({
    id: "panel-conclusion",
    requirementId: "independent-evidence-synthesis",
    question: "Did the panel reach an independent conclusion?",
    priority: "critical",
  }),
]

describe("mergeComparableActionsIntoOutline", () => {
  it("creates ordered work packages with owners, dependencies, and citations", () => {
    const original: AmendmentOutlineSection[] = [
      { id: "outline-part-1", title: "Part 1", items: ["Existing action"] },
    ]
    const merged = mergeComparableActionsIntoOutline(original, actions, matrix)

    expect(merged.map((section) => section.id)).toEqual([
      "outline-action-batch-provenance",
      "outline-action-panel-conclusion",
      "outline-part-1",
    ])
    expect(merged[0]).toMatchObject({
      sequence: 1,
      ownerRole: "Analytical lead",
      citations: [{ pageNumber: 13 }],
    })
    expect(merged[1]?.dependencies).toEqual(["outline-action-batch-provenance"])
  })
})

function action(
  overrides: Partial<ComparableAction> & Pick<ComparableAction, "id" | "requirementId" | "question">
): ComparableAction {
  return {
    priority: "major",
    synthesis: "Comparator synthesis",
    amendmentAction: "Add a traceable explanation to the filing.",
    researchAction: "Verify the existing records before commissioning new work.",
    evidenceNeeded: ["Verification memo"],
    subjectCitationPages: [13],
    comparatorSupport: [
      {
        filingId: "grn-1160",
        filingName: "GRN 1160",
        conclusion: "supportive_with_limitations",
        pageNumbers: [14],
      },
    ],
    ...overrides,
  }
}
