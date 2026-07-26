import { mkdir, writeFile } from "node:fs/promises"
import { expect, test } from "vitest"
import { rankComparableFilings } from "../../../packages/core/src/index.js"
import { loadNoticeCorpus } from "./corpus.js"

test.skipIf(!process.env.GREENLIT_CORPUS_METADATA_PATH)(
  "loads and ranks the legacy GRAS metadata corpus",
  async () => {
    const corpus = await loadNoticeCorpus(process.env.GREENLIT_CORPUS_METADATA_PATH as string)
    const subject = corpus.find((item) => item.grnNumber === 1256)

    expect(corpus.length).toBeGreaterThan(600)
    expect(subject).toBeTruthy()
    if (!subject) {
      throw new Error("GRN 1256 is missing from the configured corpus")
    }

    const ranked = rankComparableFilings(subject, corpus, 5)
    const corpusDirectory = new URL("../../../data/corpus/", import.meta.url)
    await mkdir(corpusDirectory, { recursive: true })
    await writeFile(
      new URL("gras-notice-metadata.json", corpusDirectory),
      `${JSON.stringify(corpus, null, 2)}\n`
    )
    await writeFile(
      new URL(
        "../../../fixtures/evaluations/results/lemna-grn-1256-comparables-v1.json",
        import.meta.url
      ),
      `${JSON.stringify(
        {
          corpusRecords: corpus.length,
          topComparables: ranked.map((item) => ({
            grnNumber: item.grnNumber,
            name: item.name,
            similarityScore: item.similarityScore,
            differences: item.differences.length,
          })),
        },
        null,
        2
      )}\n`
    )
  }
)
