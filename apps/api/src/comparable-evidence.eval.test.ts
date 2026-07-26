import { readFile, writeFile } from "node:fs/promises"
import { expect, test } from "vitest"
import {
  DeepAnalysisResultSchema,
  rankComparableFilings,
} from "../../../packages/core/src/index.js"
import { enrichComparableEvidence } from "./comparable-evidence.js"
import { loadNoticeCorpus } from "./corpus.js"

const matrixUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1256-deep-evidence-v2.raw.json",
  import.meta.url
)
const resultUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1256-comparable-evidence-v1.json",
  import.meta.url
)

test.skipIf(!process.env.GREENLIT_CORPUS_METADATA_PATH)(
  "retrieves evidence passages from the top Lemna comparators",
  async () => {
    const [corpus, analysis] = await Promise.all([
      loadNoticeCorpus(process.env.GREENLIT_CORPUS_METADATA_PATH as string),
      readFile(matrixUrl, "utf8").then((text) => DeepAnalysisResultSchema.parse(JSON.parse(text))),
    ])
    const subject = corpus.find((profile) => profile.grnNumber === 1256)
    expect(subject).toBeTruthy()
    if (!subject) throw new Error("GRN 1256 is missing from the corpus")

    const filings = rankComparableFilings(subject, corpus, 5)
    const enriched = await enrichComparableEvidence({
      filings,
      profiles: corpus,
      evidenceMatrix: analysis.evidenceMatrix,
      maxFilings: 3,
    })
    await writeFile(
      resultUrl,
      `${JSON.stringify(
        {
          fixtureVersion: "1.0.0",
          subjectGrn: 1256,
          comparables: enriched,
        },
        null,
        2
      )}\n`
    )

    expect(enriched.slice(0, 3).every((filing) => filing.evidenceMatches?.length)).toBe(true)
    expect(
      enriched
        .slice(0, 3)
        .flatMap((filing) => filing.evidenceMatches ?? [])
        .every((match) => match.citations.every((citation) => citation.excerpt.length > 0))
    ).toBe(true)
  },
  180_000
)
