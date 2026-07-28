import { demoReport } from "@greenlit/core"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App from "./App"

beforeEach(() => {
  window.history.replaceState({}, "", "/")
  window.localStorage.clear()
  window.scrollTo = vi.fn()
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input)
      if (url.endsWith("/analyses")) {
        return jsonResponse({ analyses: [] })
      }

      return jsonResponse({}, 404)
    })
  )
})

describe("App", () => {
  it("renders the landing experience and sample analysis", async () => {
    render(<App />)

    expect(
      screen.getByRole("heading", { name: /know if your filing\s*is ready before they do/i })
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Choose PDF")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("00 FILES")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /explore sample analysis/i }))

    expect(screen.getByRole("heading", { name: "Submission readiness" })).toBeInTheDocument()
    expect(screen.getByText("SAMPLE REPORT")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Priority findings" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Documentation benchmark" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Safety evidence" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Comparable filings" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Revision comparison" })).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Research references" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Amendment plan" })).toBeInTheDocument()
  })

  it("opens a saved completed report from recent work", async () => {
    const savedReport = {
      ...demoReport,
      id: "saved-report",
      analysisId: "saved-analysis",
      filingName: "Saved GRAS Notice.pdf",
      readinessScore: 81,
      status: "complete" as const,
    }

    vi.mocked(fetch).mockImplementation(
      vi.fn(async (input: RequestInfo | URL) => {
        if (requestUrl(input).endsWith("/analyses")) {
          return jsonResponse({
            analyses: [
              {
                id: "saved-analysis",
                ownerId: "test-session",
                filingName: "Saved GRAS Notice.pdf",
                status: "complete",
                report: savedReport,
                createdAt: "2026-07-06T00:00:00.000Z",
                updatedAt: "2026-07-06T00:01:00.000Z",
              },
            ],
          })
        }

        return jsonResponse({}, 404)
      })
    )

    render(<App />)

    const filingButtons = await screen.findAllByRole("button", { name: /saved gras notice\.pdf/i })
    fireEvent.click(filingButtons[0])

    expect(screen.getByRole("heading", { name: "Submission readiness" })).toBeInTheDocument()
    expect(screen.getByText("81")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Outline" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Export report" })).toBeInTheDocument()
  })

  it("previews the complete dossier workflow without creating workspace data", async () => {
    window.history.replaceState({}, "", "/dossiers")
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: /explore a complete sample dossier/i }))

    expect(screen.getByText(/read-only sample/i)).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Fermented pea protein isolate" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Source-to-claim traceability" })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Fact Book" }))
    expect(
      screen.getByRole("heading", { name: "One governed source of truth" })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Evidence room" }))
    fireEvent.click(screen.getByRole("button", { name: /review and accept fact/i }))
    expect(screen.getByRole("button", { name: /accepted into fact book/i })).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "Live draft" }))
    fireEvent.click(screen.getByRole("button", { name: "Facts" }))
    fireEvent.click(screen.getByRole("button", { name: /insert governed fact/i }))
    expect(screen.getByText(/fact book change applied/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Consultant review" }))
    fireEvent.click(screen.getByRole("button", { name: /resolve and document rationale/i }))
    expect(screen.getByText("Review complete")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Submission lifecycle" }))
    expect(screen.getByRole("heading", { name: "FDA GRAS notice" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /lock release 1.0/i }))
    expect(screen.getByText("Submission package is reproducible")).toBeInTheDocument()
  })

  it("provides document modes, source support, and explicit lifecycle controls", async () => {
    const dossier = {
      id: "draft-demo",
      ownerId: "test-session",
      name: "Draft demo",
      status: "drafting",
      intake: {
        substanceName: "Fermented protein",
        companyName: "Example Foods",
        substanceType: "protein",
        intendedEffect: "Nutrition",
        intendedUses: "Selected foods",
        manufacturingSummary: "Controlled process",
        targetPopulation: "General U.S. population",
        grasBasis: "scientific_procedures",
      },
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
    }
    const workspace = {
      dossier,
      requirements: [],
      evidence: [],
      sections: [
        {
          id: "section-1",
          dossierId: dossier.id,
          ownerId: dossier.ownerId,
          part: "Part 1",
          title: "Signed statements and certification",
          content:
            "This section contains a controlled working draft with sufficient detail for review.",
          status: "draft",
          createdAt: dossier.createdAt,
          updatedAt: dossier.updatedAt,
        },
      ],
      claims: [],
      auditEvents: [],
      evidenceRequests: [],
      evidenceRequestLinks: [],
      attestations: [],
      releases: [],
      handoffs: [],
      reviewIssues: [],
      reviewLinks: [],
      submissions: [],
      agencyQuestions: [],
      extractionCandidates: [],
      factBookEntries: [],
      factBookRevisions: [],
    }

    window.history.replaceState({}, "", "/dossiers/draft-demo")
    vi.mocked(fetch).mockImplementation(
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url.endsWith("/analyses")) return jsonResponse({ analyses: [] })
        if (url.endsWith("/dossiers/draft-demo/sections/section-1/versions")) {
          return jsonResponse({ versions: [] })
        }
        if (url.endsWith("/dossiers/draft-demo")) return jsonResponse(workspace)
        if (url.endsWith("/dossiers")) return jsonResponse({ dossiers: [dossier] })
        return jsonResponse({}, 404)
      })
    )

    render(<App />)
    fireEvent.click(await screen.findByRole("button", { name: "Draft sections" }))

    expect(screen.getByRole("group", { name: "Draft view" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Section draft" })).toBeInTheDocument()
    expect(screen.getByText("All changes saved")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sources" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Read" }))
    expect(screen.queryByRole("textbox", { name: "Section draft" })).not.toBeInTheDocument()
    expect(screen.getByText("DOCUMENT VIEW")).toBeInTheDocument()
  })
})

function requestUrl(input: RequestInfo | URL) {
  return input instanceof Request ? input.url : String(input)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
    },
    status,
  })
}
