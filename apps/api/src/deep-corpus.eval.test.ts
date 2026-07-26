import { readFile, writeFile } from "node:fs/promises"
import { expect, test } from "vitest"
import { DeepAnalysisResultSchema } from "../../../packages/core/src/index.js"
import { analyzeNoticeWithAnthropic } from "./deep-analysis.js"
import { extractPdfText } from "./pdf.js"

test.skipIf(process.env.GREENLIT_RUN_PAID_EVALS !== "true" || !process.env.GREENLIT_EVAL_PDF)(
  "runs the ported deep analyzer against an evaluation filing",
  async () => {
    const sourcePath = process.env.GREENLIT_EVAL_PDF
    const fixtureId = process.env.GREENLIT_EVAL_ID ?? "local"
    const fixtureVersion = process.env.GREENLIT_EVAL_VERSION ?? "v2"
    const filingName = process.env.GREENLIT_EVAL_NAME ?? "Evaluation GRAS notice"
    expect(sourcePath).toBeTruthy()
    expect(fixtureId).toMatch(/^[a-z0-9-]+$/)
    expect(fixtureVersion).toMatch(/^v[0-9]+$/)

    const resultUrl = new URL(
      `../../../fixtures/evaluations/results/${fixtureId}-deep-evidence-${fixtureVersion}.raw.json`,
      import.meta.url
    )
    if (process.env.GREENLIT_FORCE_PAID_RERUN !== "true") {
      try {
        const existing = DeepAnalysisResultSchema.parse(
          JSON.parse(await readFile(resultUrl, "utf8"))
        )
        expect(existing.modelProvider).toBeTruthy()
        return
      } catch {
        // Missing or invalid fixtures may proceed to a paid run.
      }
    }

    const extracted = await extractPdfText(new Uint8Array(await readFile(sourcePath as string)))
    const result = await analyzeNoticeWithAnthropic({
      filingName,
      pages: extracted.pages,
    })

    await writeFile(resultUrl, `${JSON.stringify(result, null, 2)}\n`)
    console.log(
      JSON.stringify({
        findings: result.findings.length,
        safetySignals: result.safetySignals.length,
        categories: result.findings.map((finding) => finding.category),
      })
    )
  },
  900_000
)
