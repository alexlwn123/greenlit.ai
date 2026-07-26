import { readFile, writeFile } from "node:fs/promises"
import { expect, test } from "vitest"
import type { EvidenceMatrixItem } from "../../../packages/core/src/index.js"
import { retrieveRequirementEvidence } from "./comparable-evidence.js"
import { extractPdfText } from "./pdf.js"

const requirements = [
  ["identity-composition", "Identity, source, composition, and specifications"],
  ["manufacturing", "Process description and process-related controls"],
  ["specifications-batch-analysis", "Specifications and representative batch results"],
  ["intended-uses-exposure", "Intended uses, use levels, and dietary exposure"],
  ["public-pivotal-safety-evidence", "Public availability and peer review of pivotal evidence"],
  ["independent-evidence-synthesis", "Specific incorporation and independent conclusions"],
  ["test-article-comparability", "Target/test-article bridge"],
  ["self-contained-literature-search", "Search methods, scope, and unfavorable information"],
  ["allergenicity-assessment", "Protein allergenicity and cross-reactivity where applicable"],
] as const

const noticeRoot = "C:\\Users\\jason\\gras-tool\\data\\Notices"
const pairs = [
  {
    id: "d-psicose-755-828",
    baselineGrn: 755,
    revisedGrn: 828,
    baseline: `${noticeRoot}\\Withdrawn\\GRN-0755_d-psicose.pdf`,
    revised: `${noticeRoot}\\Approved\\GRN-0828_d-psicose-resubmission-of-grn-755.pdf`,
  },
  {
    id: "rebaudioside-m-867-882",
    baselineGrn: 867,
    revisedGrn: 882,
    baseline: `${noticeRoot}\\Withdrawn\\GRN-0867_rebaudioside-m.pdf`,
    revised: `${noticeRoot}\\Approved\\GRN-0882_rebaudioside-m-resubmission-of-grn-867.pdf`,
  },
  {
    id: "lipase-866-908",
    baselineGrn: 866,
    revisedGrn: 908,
    baseline: `${noticeRoot}\\Withdrawn\\GRN-0866_lipase-from-penicillium-camemberti.pdf`,
    revised: `${noticeRoot}\\Approved\\GRN-0908_lipase-from-penicillium-camemberti-resubmission-of-grn-866.pdf`,
  },
]

test.skipIf(process.env.GREENLIT_PAIR_CALIBRATION !== "true")(
  "builds a deterministic passage-coverage baseline for three resubmission pairs",
  async () => {
    const results = []
    for (const pair of pairs) {
      const [baseline, revised] = await Promise.all([
        extractPdfText(new Uint8Array(await readFile(pair.baseline))),
        extractPdfText(new Uint8Array(await readFile(pair.revised))),
      ])
      results.push({
        id: pair.id,
        baselineGrn: pair.baselineGrn,
        revisedGrn: pair.revisedGrn,
        baseline: summarize(baseline.pages),
        revised: summarize(revised.pages),
      })
    }
    await writeFile(
      new URL(
        "../../../fixtures/evaluations/results/additional-resubmission-pairs-passage-baseline-v1.json",
        import.meta.url
      ),
      `${JSON.stringify({ fixtureVersion: "1.0.0", pairs: results }, null, 2)}\n`
    )

    expect(results).toHaveLength(3)
    expect(
      results.every(
        (pair) =>
          pair.baseline.requirements.length === 9 &&
          pair.revised.requirements.length === 9 &&
          pair.baseline.requirements.filter((item) => item.citations.length > 0).length >= 8 &&
          pair.revised.requirements.filter((item) => item.citations.length > 0).length >=
            pair.baseline.requirements.filter((item) => item.citations.length > 0).length
      )
    ).toBe(true)
  },
  180_000
)

function summarize(pages: Array<{ pageNumber: number; text: string }>) {
  return {
    pageCount: pages.length,
    characterCount: pages.reduce((total, page) => total + page.text.length, 0),
    requirements: requirements.map(([id, requirement]) => {
      const matches = retrieveRequirementEvidence(
        pages,
        { id, requirement } as Pick<EvidenceMatrixItem, "id" | "requirement">,
        2
      )
      return {
        id,
        topScore: matches[0]?.score ?? 0,
        citations: matches.map(({ pageNumber, excerpt }) => ({ pageNumber, excerpt })),
      }
    }),
  }
}
