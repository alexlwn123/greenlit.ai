import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { assessSoc2Readiness, readinessLines } from "./lib/soc2-readiness.mjs"

const root = process.cwd()
const outputArg = process.argv.find((argument) => argument.startsWith("--output="))
const output = path.resolve(
  root,
  outputArg?.slice("--output=".length) || ".artifacts/soc2-evidence-pack"
)
const artifactsRoot = path.resolve(root, ".artifacts")
if (output !== artifactsRoot && !output.startsWith(`${artifactsRoot}${path.sep}`)) {
  throw new Error("Evidence pack output must remain inside .artifacts")
}

const command = (name, args) => execFileSync(name, args, { cwd: root, encoding: "utf8" }).trim()
const relative = (file) => path.relative(output, file).replaceAll(path.sep, "/")
const sha256 = async (file) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex")

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })

const matrix = JSON.parse(
  await readFile(path.join(root, "docs", "trust-center", "soc2-control-matrix.json"), "utf8")
)
const publicEvidence = new Set([
  "SECURITY.md",
  "docs/security.md",
  "docs/confidential-processing.md",
  "docs/trust-center",
  ".github/workflows/ci.yml",
  ".github/dependabot.yml",
  "package.json",
  ...matrix.controls.flatMap((control) => control.evidence),
])
for (const source of publicEvidence) {
  const absoluteSource = path.resolve(root, source)
  if (absoluteSource !== root && !absoluteSource.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Evidence path escapes the repository: ${source}`)
  }
  await cp(absoluteSource, path.join(output, "public-evidence", source), {
    recursive: true,
  })
}

const assessment = await assessSoc2Readiness(root)
await writeFile(
  path.join(output, "readiness-assessment.json"),
  `${JSON.stringify(assessment, null, 2)}\n`
)
await writeFile(
  path.join(output, "readiness-summary.txt"),
  `${readinessLines(assessment).join("\n")}\n`
)

const evidenceMap = {
  generatedAt: assessment.assessedAt,
  controls: matrix.controls.map((control) => ({
    controlId: control.id,
    owner: control.owner,
    designStatus: control.designStatus,
    evidence: control.evidence,
    evidenceCount: control.evidence.length,
  })),
}
await writeFile(
  path.join(output, "control-evidence-map.json"),
  `${JSON.stringify(evidenceMap, null, 2)}\n`
)

const files = []
async function inventory(directory) {
  const { readdir } = await import("node:fs/promises")
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) await inventory(fullPath)
    else if (entry.name !== "manifest.json") {
      files.push({
        path: relative(fullPath),
        bytes: (await readFile(fullPath)).byteLength,
        sha256: await sha256(fullPath),
      })
    }
  }
}
await inventory(output)
files.sort((left, right) => left.path.localeCompare(right.path))

const status = command("git", ["status", "--porcelain"])
const manifest = {
  schemaVersion: 1,
  generatedAt: assessment.assessedAt,
  purpose: "SOC 2 Type I readiness and independent CPA examination support",
  repository: process.env.GITHUB_REPOSITORY ?? "jsplatkin/greenlit.ai",
  commit: process.env.GITHUB_SHA ?? command("git", ["rev-parse", "HEAD"]),
  ref: process.env.GITHUB_REF ?? command("git", ["branch", "--show-current"]),
  sourceTreeClean: status.length === 0,
  readinessDecision: assessment.decision,
  limitations: [
    "This package is management-prepared evidence and is not a SOC report or auditor opinion.",
    "Restricted personnel, access, contract, vendor-report, and penetration-test evidence must be supplied separately from the controlled audit room.",
    "A hash proves file integrity from package generation; it does not independently prove source-system completeness or control operation.",
  ],
  files,
}
await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`SOC 2 evidence pack: ${files.length} hashed files -> ${path.relative(root, output)}`)
console.log(`Readiness: ${assessment.decision}`)
if (process.argv.includes("--strict") && !assessment.ready) process.exitCode = 2
