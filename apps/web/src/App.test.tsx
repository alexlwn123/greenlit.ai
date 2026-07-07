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
  it("renders the upload backbone without default demo data", async () => {
    render(<App />)

    await waitFor(() => expect(screen.getByText("0 saved")).toBeInTheDocument())

    expect(screen.queryByRole("button", { name: "Open demo" })).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Readiness summary")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Choose PDF")).toBeInTheDocument()
    expect(screen.getByText("Ready for upload")).toBeInTheDocument()
    expect(screen.getByLabelText("Analysis status")).toHaveTextContent("No report selected")
    const workflow = screen.getByLabelText("Core workflow steps")
    expect(within(workflow).getByRole("link", { name: "Submit filing" })).toHaveAttribute(
      "href",
      "#submit-filing"
    )
    expect(within(workflow).getByRole("link", { name: "Analysis progress" })).toHaveAttribute(
      "href",
      "#submit-filing"
    )
    expect(within(workflow).getByRole("link", { name: "Report overview" })).toHaveAttribute(
      "href",
      "#readiness-report"
    )
    expect(within(workflow).getByRole("link", { name: "Findings detail" })).toHaveAttribute(
      "href",
      "#readiness-report"
    )
    expect(within(workflow).getByRole("link", { name: "Workbook" })).toHaveAttribute(
      "href",
      "#workbook-notes"
    )
    expect(within(workflow).getByRole("link", { name: "History" })).toHaveAttribute(
      "href",
      "#analysis-history"
    )
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
