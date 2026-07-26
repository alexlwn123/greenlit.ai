import { readFile, writeFile } from "node:fs/promises"
import { expect, test } from "vitest"
import {
  ComparableFilingSchema,
  DeepAnalysisResultSchema,
} from "../../../packages/core/src/index.js"
import { assessAndSynthesizeComparablesWithAnthropic } from "./comparable-pipeline.js"

const resultsRoot = "../../../fixtures/evaluations/results/"
const analysisUrl = new URL(
  `${resultsRoot}lemna-grn-1256-deep-evidence-v2.raw.json`,
  import.meta.url
)
const comparablesUrl = new URL(
  `${resultsRoot}lemna-grn-1256-comparable-evidence-v1.json`,
  import.meta.url
)
const resultUrl = new URL(
  `${resultsRoot}lemna-grn-1256-comparable-pipeline-v1.json`,
  import.meta.url
)

test.skipIf(process.env.GREENLIT_RUN_PAID_EVALS !== "true" || !process.env.ANTHROPIC_API_KEY)(
  "produces complete GRN 1256 comparator assessments and actions in one request",
  async () => {
    const [analysis, fixture] = await Promise.all([
      readFile(analysisUrl, "utf8").then((text) =>
        DeepAnalysisResultSchema.parse(JSON.parse(text))
      ),
      readFile(comparablesUrl, "utf8").then(
        (text) => JSON.parse(text) as { comparables: unknown[] }
      ),
    ])
    const subjectProfile = analysis.filingProfile ?? {
      grnNumber: 1256,
      substanceName: "Lemna leaf protein",
      substanceType: "botanical_extract",
      productionMethod: "extraction",
      sourceOrganismType: "plant",
      intendedUses: ["protein_products", "bakery"],
      targetPopulation: "general_population",
      grasBasis: "scientific_procedures",
      safetyDataAvailable: ["subchronic_toxicity", "genotoxicity", "allergenicity"],
      dietaryExposureMethod: "WWEIA",
    }
    const result = await assessAndSynthesizeComparablesWithAnthropic({
      subjectProfile,
      evidenceMatrix: analysis.evidenceMatrix,
      filings: fixture.comparables.map((filing) => ComparableFilingSchema.parse(filing)),
    })
    const assessments = result.comparableFilings.flatMap((filing) =>
      (filing.evidenceMatches ?? []).flatMap((match) => match.assessments ?? [])
    )
    await writeFile(
      resultUrl,
      `${JSON.stringify({ fixtureVersion: "1.0.0", subjectGrn: 1256, ...result }, null, 2)}\n`
    )

    expect(assessments).toHaveLength(15)
    expect(result.comparableActions).toHaveLength(5)
    expect(
      assessments.every(
        (item) => item.comparatorCitationPages.length > 0 && item.rationale.length > 40
      )
    ).toBe(true)
    expect(
      result.comparableActions.every(
        (item) =>
          item.amendmentAction.length > 40 &&
          item.researchAction.length > 40 &&
          item.evidenceNeeded.length > 0
      )
    ).toBe(true)
  },
  180_000
)
