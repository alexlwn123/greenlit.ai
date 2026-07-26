import { readFile, writeFile } from "node:fs/promises"
import { expect, test } from "vitest"
import {
  ComparableFilingSchema,
  DeepAnalysisResultSchema,
} from "../../../packages/core/src/index.js"
import { synthesizeComparableActionsWithAnthropic } from "./comparable-actions.js"

const analysisUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1256-deep-evidence-v2.raw.json",
  import.meta.url
)
const assessmentUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1256-comparable-assessment-v1.json",
  import.meta.url
)
const resultUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1256-comparable-actions-v1.json",
  import.meta.url
)

test.skipIf(process.env.GREENLIT_RUN_PAID_EVALS !== "true" || !process.env.ANTHROPIC_API_KEY)(
  "turns the GRN 1256 comparator judgments into targeted actions",
  async () => {
    const [analysis, assessmentFixture] = await Promise.all([
      readFile(analysisUrl, "utf8").then((text) =>
        DeepAnalysisResultSchema.parse(JSON.parse(text))
      ),
      readFile(assessmentUrl, "utf8").then(
        (text) => JSON.parse(text) as { comparables: unknown[] }
      ),
    ])
    const filings = assessmentFixture.comparables.map((filing) =>
      ComparableFilingSchema.parse(filing)
    )
    const actions = await synthesizeComparableActionsWithAnthropic({
      evidenceMatrix: analysis.evidenceMatrix,
      filings,
    })

    await writeFile(
      resultUrl,
      `${JSON.stringify(
        {
          fixtureVersion: "1.0.0",
          subjectGrn: 1256,
          actions,
        },
        null,
        2
      )}\n`
    )

    expect(actions).toHaveLength(5)
    expect(
      actions.every(
        (action) =>
          action.amendmentAction.length > 40 &&
          action.researchAction.length > 40 &&
          action.evidenceNeeded.length > 0 &&
          action.subjectCitationPages.length > 0 &&
          action.comparatorSupport.length > 0
      )
    ).toBe(true)
    expect(
      actions.some((action) =>
        /existing|record|verify|confirm|compile/i.test(action.researchAction)
      )
    ).toBe(true)
  },
  180_000
)
