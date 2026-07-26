import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadNoticeCorpus } from "./corpus.js"

const cleanup: string[] = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((target) => rm(target, { recursive: true })))
})

describe("loadNoticeCorpus", () => {
  it("loads valid legacy sidecars and skips malformed records", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "greenlit-corpus-"))
    cleanup.push(root)
    await mkdir(path.join(root, "Approved"))
    await mkdir(path.join(root, "Withdrawn"))
    await writeFile(
      path.join(root, "Approved", "grn-742.json"),
      JSON.stringify({
        grn_number: 742,
        substance_name: "Lemna protein concentrate",
        status: "no_questions",
        substance_type: "botanical_extract",
        production_method: "extraction",
        intended_uses: ["protein_products"],
        target_population: "general_population",
        gras_basis: "scientific_procedures",
        safety_data_available: ["subchronic_toxicity"],
      })
    )
    await writeFile(path.join(root, "Withdrawn", "broken.json"), "{}")

    const corpus = await loadNoticeCorpus(root)

    expect(corpus).toHaveLength(1)
    expect(corpus[0]).toMatchObject({
      grnNumber: 742,
      substanceName: "Lemna protein concentrate",
    })
    expect(corpus[0]?.localPdfPath).toMatch(/grn-742\.pdf$/i)
  })
})
