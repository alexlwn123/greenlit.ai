import { describe, expect, it, vi } from "vitest"
import type { ResearchReference } from "../../../packages/core/src/index.js"
import { verifyReferenceSources } from "./source-verification.js"

const reference: ResearchReference = {
  id: "source",
  title: "Safety study",
  source: "Journal",
  doi: "10.1000/safety",
  relevance: "Pivotal evidence",
  evidence: "Cited by notifier",
  verificationStatus: "metadata_verified",
}

describe("reference source verification", () => {
  it("verifies PMC full text through official NCBI services", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("idconv")) {
        return jsonResponse({ records: [{ doi: "10.1000/safety", pmcid: "PMC123", pmid: 456 }] })
      }
      return new Response(
        JSON.stringify([{ documents: [{ passages: [{ text: "Full article text" }] }] }])
      )
    })

    const [result] = await verifyReferenceSources([reference], {
      fetchImpl: fetchImpl as typeof fetch,
      email: "maintainer@example.com",
      now: () => "2026-07-26T00:00:00.000Z",
    })

    expect(result).toMatchObject({
      verificationStatus: "source_verified",
      sourceVerification: {
        source: "pmc_full_text",
        accessLevel: "full_text",
        identifier: "PMC123",
      },
    })
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("email=maintainer%40example.com")
  })

  it("uses PubMed abstracts when PMC full text is unavailable", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("idconv")) return jsonResponse({ records: [{ pmid: 456 }] })
      return new Response(
        JSON.stringify([{ documents: [{ passages: [{ text: "Abstract text" }] }] }])
      )
    })

    const [result] = await verifyReferenceSources([reference], {
      fetchImpl: fetchImpl as typeof fetch,
    })
    expect(result?.sourceVerification).toMatchObject({
      source: "pubmed_abstract",
      accessLevel: "abstract",
      identifier: "456",
    })
  })

  it("records DOI resolution without claiming full-text verification", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("idconv")) return jsonResponse({ records: [] })
      return new Response("publisher", { status: 200 })
    })

    const [result] = await verifyReferenceSources([reference], {
      fetchImpl: fetchImpl as typeof fetch,
    })
    expect(result).toMatchObject({
      verificationStatus: "metadata_verified",
      sourceVerification: { source: "doi_resolver", accessLevel: "landing_page" },
    })
  })
})

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  })
}
