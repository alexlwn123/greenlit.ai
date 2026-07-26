import { describe, expect, it, vi } from "vitest"
import type { ResearchReference } from "../../../packages/core/src/index.js"
import { verifyReferencesWithCrossref } from "./crossref.js"

const baseReference: ResearchReference = {
  id: "reference",
  title: "Genotoxicity and repeated-dose toxicity evaluation of dried Wolffia globosa",
  source: "Toxicology Reports",
  year: "2020",
  relevance: "Pivotal subchronic evidence.",
  evidence: "Cited by the notifier.",
  origin: "notifier_cited",
  verificationStatus: "extracted_unverified",
  citedPages: [38],
}

describe("verifyReferencesWithCrossref", () => {
  it("verifies a printed DOI while preserving notifier metadata and recording conflicts", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        message: {
          DOI: "10.1016/j.toxrep.2020.01.001",
          URL: "https://doi.org/10.1016/j.toxrep.2020.01.001",
          title: ["Genotoxicity and repeated-dose toxicity evaluation of dried Wolffia globosa"],
          author: [{ given: "Taro", family: "Kawamata" }],
          published: { "date-parts": [[2021]] },
        },
      })
    )

    const [verified] = await verifyReferencesWithCrossref(
      [{ ...baseReference, doi: "10.1016/j.toxrep.2020.01.001" }],
      {
        fetchImpl: fetchImpl as typeof fetch,
        now: () => "2026-07-24T00:00:00.000Z",
      }
    )

    expect(verified).toMatchObject({
      title: baseReference.title,
      year: "2020",
      verificationStatus: "metadata_verified",
      verification: {
        source: "crossref",
        matchMethod: "doi",
        matchedYear: "2021",
        conflicts: ["Year differs: filing 2020; Crossref 2021"],
      },
    })
  })

  it("uses title matching when no DOI was printed", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        message: {
          items: [
            {
              DOI: "10.1000/unrelated",
              title: ["An unrelated paper about cereal processing"],
              published: { "date-parts": [[2020]] },
            },
            {
              DOI: "10.1000/wolffia-title-match",
              title: [baseReference.title],
              published: { "date-parts": [[2020]] },
            },
          ],
        },
      })
    )

    const [verified] = await verifyReferencesWithCrossref([baseReference], {
      fetchImpl: fetchImpl as typeof fetch,
      mailto: "metadata@example.com",
    })

    expect(verified?.verification).toMatchObject({
      matchMethod: "title",
      confidence: 1,
      matchedDoi: "10.1000/wolffia-title-match",
      conflicts: [],
    })
    const firstCall = fetchImpl.mock.calls[0] as unknown[] | undefined
    expect(String(firstCall?.[0])).toContain("mailto=metadata%40example.com")
  })

  it("leaves a reference unverified when title similarity is too low", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        message: {
          items: [
            {
              DOI: "10.1000/no-match",
              title: ["Completely unrelated fermentation engineering"],
            },
          ],
        },
      })
    )

    const [result] = await verifyReferencesWithCrossref(
      [{ ...baseReference, id: "low-similarity-reference" }],
      { fetchImpl: fetchImpl as typeof fetch }
    )

    expect(result?.verificationStatus).toBe("extracted_unverified")
    expect(result?.verification).toBeUndefined()
  })
})

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  })
}
