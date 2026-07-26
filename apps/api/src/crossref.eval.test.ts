import { readFile, writeFile } from "node:fs/promises"
import { expect, test } from "vitest"
import { DeepAnalysisResultSchema } from "../../../packages/core/src/index.js"
import { verifyReferencesWithCrossref } from "./crossref.js"

const sourceUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1160-deep-evidence-v3.raw.json",
  import.meta.url
)
const resultUrl = new URL(
  "../../../fixtures/evaluations/results/lemna-grn-1160-crossref-verification-v1.json",
  import.meta.url
)

test.skipIf(process.env.GREENLIT_RUN_CROSSREF_EVAL !== "true")(
  "verifies the GRN 1160 notifier-cited reference set",
  async () => {
    const result = DeepAnalysisResultSchema.parse(JSON.parse(await readFile(sourceUrl, "utf8")))
    const references = await verifyReferencesWithCrossref(result.researchReferences, {
      mailto: process.env.GREENLIT_CROSSREF_MAILTO,
    })
    const verified = references.filter(
      (reference) => reference.verificationStatus === "metadata_verified"
    )

    await writeFile(
      resultUrl,
      `${JSON.stringify(
        {
          fixtureVersion: "1.0.0",
          subject: "GRN 1160 Lemna leaf protein",
          source: "Crossref REST API",
          checkedAt: new Date().toISOString(),
          counts: {
            total: references.length,
            metadataVerified: verified.length,
            unverified: references.length - verified.length,
            conflicts: verified.filter(
              (reference) => (reference.verification?.conflicts.length ?? 0) > 0
            ).length,
          },
          references,
        },
        null,
        2
      )}\n`
    )

    expect(references).toHaveLength(result.researchReferences.length)
    expect(verified.length).toBeGreaterThan(5)
  },
  120_000
)
