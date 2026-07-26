import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { type NoticeProfile, NoticeProfileSchema } from "../../../packages/core/src/index.js"

let configuredCorpusPromise: Promise<NoticeProfile[]> | undefined

export async function loadConfiguredCorpus() {
  const corpusPath = process.env.GREENLIT_CORPUS_METADATA_PATH
  if (corpusPath) {
    configuredCorpusPromise ??= loadNoticeCorpus(corpusPath)
    return configuredCorpusPromise
  }
  configuredCorpusPromise ??= loadCorpusIndex(
    new URL("../../../data/corpus/gras-notice-metadata.json", import.meta.url)
  )
  return configuredCorpusPromise
}

export async function loadCorpusIndex(source: URL) {
  try {
    const parsed = JSON.parse(await readFile(source, "utf8"))
    return zodCorpus(parsed)
  } catch {
    return []
  }
}

export async function loadNoticeCorpus(root: string) {
  const profiles: NoticeProfile[] = []

  for (const folder of ["Approved", "Withdrawn"]) {
    let fileNames: string[]
    try {
      fileNames = await readdir(path.join(root, folder))
    } catch {
      continue
    }

    for (const fileName of fileNames.filter((name) => name.endsWith(".json"))) {
      try {
        const raw = JSON.parse(await readFile(path.join(root, folder, fileName), "utf8")) as Record<
          string,
          unknown
        >
        profiles.push(
          NoticeProfileSchema.parse(
            mapSidecar(raw, path.join(root, folder, fileName.replace(/\.json$/i, ".pdf")))
          )
        )
      } catch {
        // A malformed sidecar must not prevent the remaining corpus from loading.
      }
    }
  }

  return profiles
}

function zodCorpus(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item) => {
    const parsed = NoticeProfileSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

function mapSidecar(raw: Record<string, unknown>, localPdfPath: string) {
  return {
    grnNumber: raw.grn_number,
    substanceName: raw.substance_name,
    notifier: raw.notifier,
    status: raw.status,
    substanceType: raw.substance_type,
    productionMethod: raw.production_method,
    sourceOrganismType: raw.source_organism_type,
    sourceOrganismName: raw.source_organism_name,
    intendedUses: raw.intended_uses,
    targetPopulation: raw.target_population,
    grasBasis: raw.gras_basis,
    safetyDataAvailable: raw.safety_data_available,
    dietaryExposureMethod: raw.dietary_exposure_method,
    sourceUrl: raw.source_pdf_url,
    localPdfPath,
  }
}
