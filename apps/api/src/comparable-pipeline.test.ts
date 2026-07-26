import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  ComparableFiling,
  EvidenceMatrixItem,
  NoticeProfile,
} from "../../../packages/core/src/index.js"
import { assessAndSynthesizeComparablesWithAnthropic } from "./comparable-pipeline.js"

afterEach(() => vi.unstubAllGlobals())

describe("combined comparator pipeline", () => {
  it("validates assessments and actions from one model request", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key"
    const question = "Was the analysis performed on a commercial batch?"
    const matrix: EvidenceMatrixItem[] = [
      {
        id: "identity-composition",
        domain: "identity",
        requirement: "Identity and composition",
        status: "weak",
        assessment: "Representativeness is unresolved.",
        evidenceSummary: "Proteomics supplied.",
        citations: [{ pageNumber: 10, excerpt: "Subject excerpt" }],
        unresolvedQuestions: [question],
        relatedFindingIds: [],
      },
    ]
    const filings: ComparableFiling[] = [
      {
        id: "grn-1160",
        name: "GRN 1160 — Comparator",
        status: "withdrawn",
        rationale: "Predecessor",
        sharedSignals: [],
        differences: [],
        evidenceMatches: [
          {
            requirementId: "identity-composition",
            requirement: "Identity and composition",
            relevanceScore: 1,
            rationale: "Matched",
            citations: [{ pageNumber: 14, excerpt: "Comparator excerpt" }],
          },
        ],
      },
    ]
    const response = {
      assessments: [
        {
          filingId: "grn-1160",
          requirementId: "identity-composition",
          question,
          conclusion: "supportive_with_limitations",
          rationale: "Relevant but incomplete.",
          transferableElements: ["Analytical framework"],
          limitations: ["Provenance unclear"],
          comparatorCitationPages: [14],
        },
      ],
      actions: [
        {
          id: "commercial-batch",
          requirementId: "identity-composition",
          question,
          priority: "major",
          synthesis: "The comparator is relevant but incomplete.",
          amendmentAction: "Identify the tested lot.",
          researchAction: "Verify existing batch records.",
          evidenceNeeded: ["Lot identifier"],
          subjectCitationPages: [10],
          comparatorSupport: [
            {
              filingId: "grn-1160",
              filingName: "GRN 1160 — Comparator",
              conclusion: "supportive_with_limitations",
              pageNumbers: [14],
            },
          ],
        },
      ],
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ content: [{ type: "text", text: JSON.stringify(response) }] }),
          { status: 200 }
        )
      )
    vi.stubGlobal("fetch", fetchMock)

    const result = await assessAndSynthesizeComparablesWithAnthropic({
      subjectProfile: {
        substanceName: "Test",
        notifier: "Notifier",
        status: "draft",
        substanceType: "other",
        productionMethod: "unknown",
        sourceOrganismType: "unknown",
        sourceOrganismName: "unknown",
        intendedUses: [],
        targetPopulation: "general_population",
        grasBasis: "scientific_procedures",
        safetyDataAvailable: [],
        dietaryExposureMethod: "unknown",
      } as NoticeProfile,
      evidenceMatrix: matrix,
      filings,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.comparableFilings[0]?.evidenceMatches?.[0]?.assessments).toHaveLength(1)
    expect(result.comparableActions).toHaveLength(1)
    expect(result.modelUsage).toHaveLength(1)
  })
})
