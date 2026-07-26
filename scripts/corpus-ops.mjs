import { copyFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

const workspaceRoot = path.resolve(import.meta.dirname, "..")
const indexPath = path.join(workspaceRoot, "data", "corpus", "gras-notice-metadata.json")
const backupDir = path.join(workspaceRoot, ".local-data", "corpus-backups")
const command = process.argv[2] ?? "validate"

if (command === "validate") {
  const profiles = await readIndex(indexPath)
  printSummary(validateCorpus(profiles), "Corpus is valid")
} else if (command === "refresh") {
  const noticesRoot = process.argv[3]
  if (!noticesRoot) throw new Error("Usage: pnpm corpus:refresh <path-to-Notices-folder>")

  const profiles = await loadNoticeCorpus(path.resolve(noticesRoot))
  const summary = validateCorpus(profiles)
  await mkdir(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, `gras-notice-metadata-${timestamp()}.json`)
  await copyFile(indexPath, backupPath)

  const temporaryPath = `${indexPath}.next`
  await writeFile(temporaryPath, `${JSON.stringify(sortProfiles(profiles), null, 2)}\n`, "utf8")
  await rename(temporaryPath, indexPath)
  printSummary(summary, `Corpus refreshed; previous index backed up to ${backupPath}`)
} else if (command === "rollback") {
  await mkdir(backupDir, { recursive: true })
  const backups = (await readdir(backupDir))
    .filter((fileName) => /^gras-notice-metadata-.*\.json$/.test(fileName))
    .sort()
    .reverse()
  const selected = process.argv[3] ?? backups[0]
  if (!selected) throw new Error("No corpus backup is available to restore.")

  const backupPath = path.join(backupDir, path.basename(selected))
  const profiles = await readIndex(backupPath)
  const summary = validateCorpus(profiles)
  await copyFile(backupPath, indexPath)
  printSummary(summary, `Corpus restored from ${backupPath}`)
} else {
  throw new Error(`Unknown corpus command: ${command}`)
}

async function loadNoticeCorpus(root) {
  const profiles = []
  for (const folder of ["Approved", "Withdrawn"]) {
    const folderPath = path.join(root, folder)
    let fileNames = []
    try {
      fileNames = await readdir(folderPath)
    } catch {
      continue
    }

    for (const fileName of fileNames.filter((name) => name.endsWith(".json"))) {
      try {
        const raw = JSON.parse(await readFile(path.join(folderPath, fileName), "utf8"))
        profiles.push(
          validateProfile(
            {
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
              localPdfPath: path.join(folderPath, fileName.replace(/\.json$/i, ".pdf")),
            },
            fileName
          )
        )
      } catch {
        // Malformed sidecars are excluded; corpus-level validation still blocks empty/duplicate output.
      }
    }
  }
  return profiles
}

function validateCorpus(profiles) {
  if (profiles.length === 0) throw new Error("Corpus is empty.")
  const grnNumbers = profiles.flatMap((profile) =>
    profile.grnNumber === undefined ? [] : [profile.grnNumber]
  )
  const duplicates = grnNumbers.filter((value, index) => grnNumbers.indexOf(value) !== index)
  if (duplicates.length > 0) {
    throw new Error(`Duplicate GRN numbers: ${[...new Set(duplicates)].join(", ")}`)
  }

  const approved = profiles.filter((profile) => profile.status === "no_questions").length
  const withdrawn = profiles.filter((profile) => profile.status === "withdrawn").length
  const withPdf = profiles.filter((profile) => profile.localPdfPath).length
  return { approved, total: profiles.length, withdrawn, withPdf }
}

async function readIndex(sourcePath) {
  const parsed = JSON.parse(await readFile(sourcePath, "utf8"))
  if (!Array.isArray(parsed)) throw new Error(`Corpus index is not an array: ${sourcePath}`)
  return parsed.map((profile, index) => validateProfile(profile, `record ${index + 1}`))
}

function validateProfile(profile, label) {
  const requiredStrings = [
    "substanceName",
    "substanceType",
    "productionMethod",
    "targetPopulation",
    "grasBasis",
  ]
  for (const field of requiredStrings) {
    if (typeof profile[field] !== "string" || !profile[field]) {
      throw new Error(`Invalid ${label}: ${field} is required.`)
    }
  }
  if (!Array.isArray(profile.intendedUses) || !Array.isArray(profile.safetyDataAvailable)) {
    throw new Error(`Invalid ${label}: intendedUses and safetyDataAvailable must be arrays.`)
  }
  if (
    profile.grnNumber !== undefined &&
    (!Number.isInteger(profile.grnNumber) || profile.grnNumber <= 0)
  ) {
    throw new Error(`Invalid ${label}: grnNumber must be a positive integer.`)
  }
  return profile
}

function sortProfiles(profiles) {
  return [...profiles].sort((left, right) => (left.grnNumber ?? 0) - (right.grnNumber ?? 0))
}

function timestamp() {
  return new Date().toISOString().replaceAll(/[:.]/g, "-")
}

function printSummary(summary, message) {
  console.log(message)
  console.log(
    `${summary.total} records (${summary.approved} no-questions, ${summary.withdrawn} withdrawn, ${summary.withPdf} with local PDFs)`
  )
}
