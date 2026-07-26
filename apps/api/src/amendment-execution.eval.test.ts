import { readFile, writeFile } from "node:fs/promises"
import { expect, test } from "vitest"
import {
  ComparableActionSchema,
  DeepAnalysisResultSchema,
  mergeComparableActionsIntoOutline,
} from "../../../packages/core/src/index.js"

const analysisUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1256-deep-evidence-v2.raw.json",
  import.meta.url
)
const actionsUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1256-comparable-actions-v1.json",
  import.meta.url
)
const resultUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1256-amendment-execution-v1.json",
  import.meta.url
)

test("builds an ordered GRN 1256 amendment execution plan", async () => {
  const [analysis, actionFixture] = await Promise.all([
    readFile(analysisUrl, "utf8").then((text) => DeepAnalysisResultSchema.parse(JSON.parse(text))),
    readFile(actionsUrl, "utf8").then((text) => JSON.parse(text) as { actions: unknown[] }),
  ])
  const actions = actionFixture.actions.map((action) => ComparableActionSchema.parse(action))
  const outline = mergeComparableActionsIntoOutline([], actions, analysis.evidenceMatrix)
  if (process.env.GREENLIT_UPDATE_EVAL_FIXTURES === "true") {
    await writeFile(
      resultUrl,
      `${JSON.stringify(
        {
          fixtureVersion: "1.0.0",
          subjectGrn: 1256,
          workPackages: outline,
        },
        null,
        2
      )}\n`
    )
  }

  expect(outline).toHaveLength(5)
  expect(outline.map((section) => section.sequence)).toEqual([1, 2, 3, 4, 5])
  expect(
    outline.every(
      (section) =>
        section.ownerRole &&
        section.deliverables?.length &&
        section.citations?.length &&
        section.comparatorSources?.length
    )
  ).toBeTruthy()
  expect(outline.at(-1)?.domains).toEqual(["independent-evidence-synthesis"])
  expect(outline.at(-1)?.dependencies).toHaveLength(4)
})
