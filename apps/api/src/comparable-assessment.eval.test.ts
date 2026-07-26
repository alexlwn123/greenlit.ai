import { readFile, writeFile } from "node:fs/promises"
import { expect, test } from "vitest"
import {
  ComparableFilingSchema,
  DeepAnalysisResultSchema,
} from "../../../packages/core/src/index.js"
import { assessComparableEvidenceWithAnthropic } from "./comparable-assessment.js"
import { loadNoticeCorpus } from "./corpus.js"

const analysisUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1256-deep-evidence-v2.raw.json",
  import.meta.url
)
const comparablesUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1256-comparable-evidence-v1.json",
  import.meta.url
)
const resultUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1256-comparable-assessment-v1.json",
  import.meta.url
)

test.skipIf(
  process.env.GREENLIT_RUN_PAID_EVALS !== "true" ||
    !process.env.ANTHROPIC_API_KEY ||
    !process.env.GREENLIT_CORPUS_METADATA_PATH
)(
  "assesses whether Lemna comparator passages answer unresolved questions",
  async () => {
    const [analysis, comparableFixture, corpus] = await Promise.all([
      readFile(analysisUrl, "utf8").then((text) =>
        DeepAnalysisResultSchema.parse(JSON.parse(text))
      ),
      readFile(comparablesUrl, "utf8").then(
        (text) =>
          JSON.parse(text) as {
            comparables: unknown[]
          }
      ),
      loadNoticeCorpus(process.env.GREENLIT_CORPUS_METADATA_PATH as string),
    ])
    const subject = corpus.find((profile) => profile.grnNumber === 1256)
    if (!subject) throw new Error("GRN 1256 is missing from the corpus")
    const comparables = comparableFixture.comparables.map((filing) =>
      ComparableFilingSchema.parse(filing)
    )

    const assessed = await assessComparableEvidenceWithAnthropic({
      subjectProfile: subject,
      evidenceMatrix: analysis.evidenceMatrix,
      filings: comparables,
    })
    await writeFile(
      resultUrl,
      `${JSON.stringify(
        {
          fixtureVersion: "1.0.0",
          subjectGrn: 1256,
          comparables: assessed,
        },
        null,
        2
      )}\n`
    )

    const assessments = assessed.flatMap((filing) =>
      (filing.evidenceMatches ?? []).flatMap((match) => match.assessments ?? [])
    )
    expect(assessments).toHaveLength(15)
    expect(
      assessments.every(
        (assessment) =>
          assessment.comparatorCitationPages.length > 0 && assessment.rationale.length > 40
      )
    ).toBe(true)
    expect(assessments.some((assessment) => assessment.conclusion === "contextual_only")).toBe(true)
  },
  180_000
)
