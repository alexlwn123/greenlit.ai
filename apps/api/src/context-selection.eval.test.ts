import { readFile, writeFile } from "node:fs/promises"
import { expect, test } from "vitest"
import { DeepAnalysisResultSchema } from "../../../packages/core/src/index.js"
import { selectPageAwareText, selectTargetedPageAwareText } from "./deep-analysis.js"
import { extractPdfText } from "./pdf.js"

const noticeRoot = "C:\\Users\\jason\\gras-tool\\data\\Notices"
const controls = [
  [
    "lemna-grn-1160-deep-evidence-v2.raw.json",
    `${noticeRoot}\\Withdrawn\\GRN-1160_lemna-leaf-protein.pdf`,
  ],
  [
    "lemna-grn-1256-deep-evidence-v2.raw.json",
    `${noticeRoot}\\Approved\\GRN-1256_lemna-leaf-protein-resubmission-of-grn-1160.pdf`,
  ],
  [
    "grn-0755-d-psicose-deep-evidence-v1.raw.json",
    `${noticeRoot}\\Withdrawn\\GRN-0755_d-psicose.pdf`,
  ],
  [
    "grn-0828-d-psicose-deep-evidence-v1.raw.json",
    `${noticeRoot}\\Approved\\GRN-0828_d-psicose-resubmission-of-grn-755.pdf`,
  ],
  [
    "grn-0867-rebaudioside-m-deep-evidence-v1.raw.json",
    `${noticeRoot}\\Withdrawn\\GRN-0867_rebaudioside-m.pdf`,
  ],
  [
    "grn-0882-rebaudioside-m-deep-evidence-v1.raw.json",
    `${noticeRoot}\\Approved\\GRN-0882_rebaudioside-m-resubmission-of-grn-867.pdf`,
  ],
  [
    "grn-0866-lipase-deep-evidence-v1.raw.json",
    `${noticeRoot}\\Withdrawn\\GRN-0866_lipase-from-penicillium-camemberti.pdf`,
  ],
  [
    "grn-0908-lipase-deep-evidence-v1.raw.json",
    `${noticeRoot}\\Approved\\GRN-0908_lipase-from-penicillium-camemberti-resubmission-of-grn-866.pdf`,
  ],
] as const

test.skipIf(process.env.GREENLIT_CONTEXT_SHADOW !== "true")(
  "measures targeted-context citation recall without model calls",
  async () => {
    const results = []
    for (const [fixtureName, pdfPath] of controls) {
      const [fixture, extracted] = await Promise.all([
        readFile(
          new URL(`../../../fixtures/evaluations/results/${fixtureName}`, import.meta.url),
          "utf8"
        ).then((text) => DeepAnalysisResultSchema.parse(JSON.parse(text))),
        readFile(pdfPath).then((bytes) => extractPdfText(new Uint8Array(bytes))),
      ])
      const full = selectPageAwareText(extracted.pages)
      const targeted = selectTargetedPageAwareText(extracted.pages)
      const goldPages = new Set([
        ...fixture.findings.flatMap((finding) =>
          finding.citations.map((citation) => citation.pageNumber)
        ),
        ...fixture.evidenceMatrix.flatMap((item) =>
          item.citations.map((citation) => citation.pageNumber)
        ),
        ...fixture.safetySignals.flatMap((signal) =>
          (signal.citations ?? []).map((citation) => citation.pageNumber)
        ),
      ])
      const targetedPages = new Set(targeted.pageNumbers)
      const recalled = [...goldPages].filter((page) => targetedPages.has(page)).length
      results.push({
        fixtureName,
        pageCount: extracted.pageCount,
        fullCharacters: full.text.length,
        targetedCharacters: targeted.text.length,
        characterReduction: Number((1 - targeted.text.length / full.text.length).toFixed(3)),
        goldCitationPages: goldPages.size,
        recalledCitationPages: recalled,
        citationRecall: goldPages.size === 0 ? 1 : Number((recalled / goldPages.size).toFixed(3)),
        missedPages: [...goldPages].filter((page) => !targetedPages.has(page)),
      })
    }
    if (process.env.GREENLIT_UPDATE_EVAL_FIXTURES === "true") {
      await writeFile(
        new URL(
          "../../../fixtures/evaluations/results/targeted-context-shadow-v1.json",
          import.meta.url
        ),
        `${JSON.stringify({ fixtureVersion: "1.0.0", results }, null, 2)}\n`
      )
    }

    expect(results.every((result) => result.citationRecall >= 0.95)).toBe(true)
    expect(results.reduce((total, result) => total + result.targetedCharacters, 0)).toBeLessThan(
      results.reduce((total, result) => total + result.fullCharacters, 0) * 0.92
    )
  },
  180_000
)
