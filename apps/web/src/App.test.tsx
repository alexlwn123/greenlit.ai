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
    expect(screen.getByRole("heading", { name: "Filing diff" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Research references" })).not.toBeInTheDocument()
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
