import { demoReport } from "@greenlit/core"
import { render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App from "./App"

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input)
      if (url.endsWith("/analyses")) {
        return jsonResponse({
          analyses: [],
        })
      }

      if (url.endsWith("/notes")) {
        return jsonResponse({
          notes: [],
        })
      }

      return jsonResponse({}, 404)
    })
  )
})

describe("App", () => {
  it("renders the upload backbone and demo report path", async () => {
    render(<App />)

    await waitFor(() => expect(screen.getByText("0 saved")).toBeInTheDocument())

    expect(screen.getByRole("button", { name: "Open demo" })).toBeInTheDocument()
    expect(screen.getByLabelText("Choose PDF")).toBeInTheDocument()
    expect(
      within(screen.getByLabelText("Readiness summary")).getByText("Readiness score")
    ).toBeInTheDocument()
    const workflow = screen.getByLabelText("Core workflow steps")
    expect(within(workflow).getByText("Submit filing")).toBeInTheDocument()
    expect(within(workflow).getByText("Analysis progress")).toBeInTheDocument()
    expect(within(workflow).getByText("Report overview")).toBeInTheDocument()
    expect(within(workflow).getByText("Findings detail")).toBeInTheDocument()
    expect(within(workflow).getByText("Workbook")).toBeInTheDocument()
    expect(within(workflow).getByText("History")).toBeInTheDocument()
  })

  it("renders a saved completed report from history", async () => {
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
        const url = requestUrl(input)
        if (url.endsWith("/analyses")) {
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

        if (url.endsWith("/notes")) {
          return jsonResponse({
            notes: [],
          })
        }

        return jsonResponse({}, 404)
      })
    )

    render(<App />)

    await waitFor(() =>
      expect(screen.getAllByText("Saved GRAS Notice.pdf").length).toBeGreaterThan(0)
    )
    expect(screen.getByText("1 saved")).toBeInTheDocument()
    expect(within(screen.getByLabelText("Readiness summary")).getByText("81")).toBeInTheDocument()
    expect(screen.getByText("Identified Gaps")).toBeInTheDocument()
    expect(screen.getByText("Recommended Next Steps")).toBeInTheDocument()
    expect(screen.getByText("Documentation Benchmark")).toBeInTheDocument()
    expect(screen.getByText("Safety Signals")).toBeInTheDocument()
    expect(screen.getByText("Comparable Filings")).toBeInTheDocument()
    expect(screen.getByText("Filing Diff")).toBeInTheDocument()
    expect(screen.getByText("Research References")).toBeInTheDocument()
    expect(screen.getByText("Amendment Outline")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Outline" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument()
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
