import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const workspaceRoot = path.resolve(import.meta.dirname, "..")
const corpusPath = path.join(workspaceRoot, "data", "corpus", "gras-notice-metadata.json")
const outputRoot = path.join(workspaceRoot, ".local-data", "blind-review")
const seed = process.argv[2] ?? new Date().toISOString().slice(0, 10)
const requestedPerStatus = Number(process.argv[3] ?? 4)
const excludedGrns = new Set([755, 828, 866, 867, 882, 908, 1160, 1256])

if (!Number.isInteger(requestedPerStatus) || requestedPerStatus < 1 || requestedPerStatus > 20) {
  throw new Error("Cases per status must be an integer from 1 to 20.")
}

const corpus = JSON.parse(await readFile(corpusPath, "utf8"))
const eligible = corpus.filter(
  (profile) =>
    Number.isInteger(profile.grnNumber) &&
    !excludedGrns.has(profile.grnNumber) &&
    profile.localPdfPath &&
    ["no_questions", "withdrawn"].includes(profile.status)
)
const selected = ["no_questions", "withdrawn"].flatMap((status) =>
  selectDiverse(
    eligible.filter((profile) => profile.status === status),
    requestedPerStatus,
    seed
  )
)
const shuffled = [...selected].sort((left, right) =>
  hash(`${seed}:blind:${left.grnNumber}`).localeCompare(hash(`${seed}:blind:${right.grnNumber}`))
)
const outputDir = path.join(outputRoot, seed.replaceAll(/[^a-z0-9_-]/gi, "-"))
await mkdir(outputDir, { recursive: true })

const cases = shuffled.map((profile, index) => ({
  caseId: `CASE-${String(index + 1).padStart(2, "0")}`,
  profile,
}))
await writeFile(
  path.join(outputDir, "review-cases.csv"),
  toCsv([
    [
      "case_id",
      "substance_name",
      "source_pdf",
      "citation_accuracy_1_to_5",
      "major_gap_recall_1_to_5",
      "false_positive_control_1_to_5",
      "action_usefulness_1_to_5",
      "highest_missed_severity",
      "unsupported_greenlit_findings",
      "missed_major_findings",
      "reviewer_notes",
    ],
    ...cases.map(({ caseId, profile }) => [caseId, profile.substanceName, profile.localPdfPath]),
  ]),
  "utf8"
)
await writeFile(
  path.join(outputDir, "answer-key.csv"),
  toCsv([
    ["case_id", "grn_number", "regulatory_outcome", "substance_type"],
    ...cases.map(({ caseId, profile }) => [
      caseId,
      profile.grnNumber,
      profile.status,
      profile.substanceType,
    ]),
  ]),
  "utf8"
)
await writeFile(
  path.join(outputDir, "finding-labels.csv"),
  toCsv([
    [
      "case_id",
      "finding_id",
      "verdict_confirmed_false_positive_missed",
      "domain",
      "severity_critical_major_minor",
      "citation_accuracy_1_to_5",
      "action_usefulness_1_to_5",
      "reviewer_notes",
    ],
  ]),
  "utf8"
)
await writeFile(
  path.join(outputDir, "README.md"),
  `# Blind Review ${seed}\n\nGive the reviewer \`review-cases.csv\`, \`finding-labels.csv\`, and the listed source PDFs. Keep \`answer-key.csv\` concealed until every case is scored. Generate and attach the Greenlit report for each case without revealing the FDA outcome.\n\nIn \`finding-labels.csv\`, enter one row for every Greenlit finding. Use verdict \`confirmed\` or \`false_positive\` and preserve its finding ID. Add every material finding Greenlit missed as a separate \`missed\` row with a blank finding ID. Every predicted finding must be reviewed.\n\nPassing recommendation: no unsupported critical finding; at least 75% finding precision and 80% major-gap recall; at least 4/5 median citation accuracy; at least 3/5 median action usefulness; and no systematic outcome leakage.\n`,
  "utf8"
)

console.log(`Created ${cases.length} blinded cases in ${outputDir}`)

function selectDiverse(candidates, limit, selectionSeed) {
  const ordered = [...candidates].sort((left, right) =>
    hash(`${selectionSeed}:${left.grnNumber}`).localeCompare(
      hash(`${selectionSeed}:${right.grnNumber}`)
    )
  )
  const selected = []
  const usedTypes = new Set()
  for (const candidate of ordered) {
    if (selected.length >= limit) break
    if (usedTypes.has(candidate.substanceType)) continue
    selected.push(candidate)
    usedTypes.add(candidate.substanceType)
  }
  for (const candidate of ordered) {
    if (selected.length >= limit) break
    if (!selected.includes(candidate)) selected.push(candidate)
  }
  return selected
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex")
}

function toCsv(rows) {
  const width = Math.max(...rows.map((row) => row.length))
  return `${rows
    .map((row) => Array.from({ length: width }, (_, index) => csvCell(row[index] ?? "")).join(","))
    .join("\n")}\n`
}

function csvCell(value) {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
