import { readFile, writeFile } from "node:fs/promises"
import { expect, test } from "vitest"
import {
  calibrateFindings,
  compareEvidenceMatrices,
  DeepAnalysisResultSchema,
} from "../../../packages/core/src/index.js"

const pairs = [
  ["grn-0755-d-psicose", "grn-0828-d-psicose"],
  ["grn-0867-rebaudioside-m", "grn-0882-rebaudioside-m"],
  ["grn-0866-lipase", "grn-0908-lipase"],
] as const

test("compares three withdrawn and resubmitted deep-analysis controls", async () => {
  const comparisons = []
  for (const [baselineId, revisedId] of pairs) {
    const [baseline, revised] = await Promise.all([readResult(baselineId), readResult(revisedId)])
    comparisons.push({
      id: `${baselineId}-to-${revisedId}`,
      baseline: summarize(baseline),
      revised: summarize(revised),
      matrixDiff: compareEvidenceMatrices(baseline.evidenceMatrix, revised.evidenceMatrix, {
        pairAware: true,
      }),
    })
  }
  if (process.env.GREENLIT_UPDATE_EVAL_FIXTURES === "true") {
    await writeFile(
      new URL(
        "../../../fixtures/evaluations/results/additional-resubmission-pairs-deep-comparison-v1.json",
        import.meta.url
      ),
      `${JSON.stringify({ fixtureVersion: "1.0.0", comparisons }, null, 2)}\n`
    )
  }

  expect(comparisons).toHaveLength(3)
  expect(comparisons.every((pair) => pair.matrixDiff.length === 9)).toBe(true)
  expect(comparisons[0]?.matrixDiff.some((item) => item.change === "improved")).toBe(true)
  expect(comparisons[2]?.matrixDiff.some((item) => item.change === "improved")).toBe(true)
  expect(
    comparisons[2]?.matrixDiff.find((item) => item.id === "diff-public-pivotal-safety-evidence")
  ).toMatchObject({
    change: "unchanged",
    consistencyAdjustment: "shared_evidence_regression_suppressed",
  })
})

async function readResult(id: string) {
  const text = await readFile(
    new URL(
      `../../../fixtures/evaluations/results/${id}-deep-evidence-v1.raw.json`,
      import.meta.url
    ),
    "utf8"
  )
  return DeepAnalysisResultSchema.parse(JSON.parse(text))
}

function summarize(result: Awaited<ReturnType<typeof readResult>>) {
  const calibrated = calibrateFindings(result.findings)
  return {
    matrixStatusCounts: Object.fromEntries(
      ["present", "weak", "missing", "not_applicable"].map((status) => [
        status,
        result.evidenceMatrix.filter((item) => item.status === status).length,
      ])
    ),
    rawFindingCount: result.findings.length,
    calibratedFindingCount: calibrated.length,
    findings: calibrated.map((finding) => ({
      id: finding.id,
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      pages: finding.citations.map((citation) => citation.pageNumber),
    })),
    safetySignalCount: result.safetySignals.length,
  }
}
