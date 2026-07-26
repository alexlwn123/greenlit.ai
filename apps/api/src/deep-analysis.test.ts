import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  analyzeNoticeWithAnthropic,
  deepAnalysisOutputSchema,
  estimateFullPipelineCost,
  selectAnalysisPageAwareText,
  selectPageAwareText,
} from "./deep-analysis"

const originalAnthropicKey = process.env.ANTHROPIC_API_KEY

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalAnthropicKey) process.env.ANTHROPIC_API_KEY = originalAnthropicKey
  else delete process.env.ANTHROPIC_API_KEY
})

describe("selectPageAwareText", () => {
  it("preserves PDF page markers for evidence citations", () => {
    const selected = selectPageAwareText([
      { pageNumber: 1, text: "Identity and composition" },
      { pageNumber: 2, text: "Safety evidence" },
    ])

    expect(selected.text).toContain("=== PDF PAGE 1 ===")
    expect(selected.text).toContain("=== PDF PAGE 2 ===")
    expect(selected.pageNumbers).toEqual([1, 2])
    expect(selected.truncated).toBe(false)
  })

  it("retains evidence-heavy appendix pages when a long filing is truncated", () => {
    const pages = Array.from({ length: 220 }, (_, index) => ({
      pageNumber: index + 1,
      text:
        index === 189
          ? `Pivotal 90-day test article bridge ${"evidence ".repeat(20_000)}`
          : `routine filing text ${"content ".repeat(300)}`,
    }))

    const selected = selectPageAwareText(pages)

    expect(selected.pageNumbers).toContain(190)
    expect(selected.pageNumbers).toContain(220)
    expect(selected.truncated).toBe(true)
  })
})

describe("selectAnalysisPageAwareText", () => {
  it("uses targeted context for filings at or below the 500-page limit", () => {
    const pages = Array.from({ length: 230 }, (_, index) => ({
      pageNumber: index + 1,
      text: `routine filing text ${"content ".repeat(300)}`,
    }))

    const selected = selectAnalysisPageAwareText(pages)

    expect(selected.text.length).toBeLessThan(selectPageAwareText(pages).text.length)
  })

  it("uses full context selection above the 500-page limit", () => {
    const pages = Array.from({ length: 501 }, (_, index) => ({
      pageNumber: index + 1,
      text: `page ${index + 1} ${"content ".repeat(300)}`,
    }))

    expect(selectAnalysisPageAwareText(pages)).toEqual(selectPageAwareText(pages))
  })
})

describe("deepAnalysisOutputSchema", () => {
  it("requires closed structured output objects", () => {
    expect(deepAnalysisOutputSchema.additionalProperties).toBe(false)
    expect(deepAnalysisOutputSchema.properties.findings.items.additionalProperties).toBe(false)
    expect(deepAnalysisOutputSchema.properties.safetySignals.items.additionalProperties).toBe(false)
  })
})

describe("deep-analysis cost controls", () => {
  it("reserves budget for both core and combined comparator stages", () => {
    const expected = estimateFullPipelineCost("x".repeat(350_000))

    expect(expected).toBeGreaterThan(0.9)
    expect(expected).toBeLessThan(1.25)
  })

  it("records usage and serves an identical second analysis from durable cache", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "greenlit-model-cache-"))
    process.env.ANTHROPIC_API_KEY = "test-key"
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                summary: "Grounded analysis",
                filingProfile: {
                  substanceName: "Test ingredient",
                  notifier: "Test notifier",
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
                },
                findings: [],
                evidenceMatrix: [],
                safetySignals: [],
              }),
            },
          ],
          usage: { input_tokens: 1000, output_tokens: 200 },
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal("fetch", fetchMock)

    try {
      const input = {
        filingName: "test.pdf",
        pages: [{ pageNumber: 1, text: "Identity manufacturing safety references" }],
        cacheDir,
      }
      const first = await analyzeNoticeWithAnthropic(input)
      const second = await analyzeNoticeWithAnthropic(input)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(first.cacheHit).toBe(false)
      expect(first.modelUsage).toHaveLength(1)
      expect(first.estimatedCostUsd).toBeGreaterThan(0)
      expect(second.cacheHit).toBe(true)
      expect(second.estimatedCostUsd).toBe(0)
      expect(second.modelUsage).toEqual([])
    } finally {
      await rm(cacheDir, { force: true, recursive: true })
    }
  })
})
