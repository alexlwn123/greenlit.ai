import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const evidenceDir = path.join(root, ".artifacts")
const sbomPath = path.join(evidenceDir, "sbom.cdx.json")
await mkdir(evidenceDir, { recursive: true })
execFileSync(
  process.execPath,
  [path.join(root, "scripts", "generate-sbom.mjs"), `--output=${sbomPath}`],
  {
    cwd: root,
    stdio: "inherit",
  }
)

const command = (name, args) => execFileSync(name, args, { cwd: root, encoding: "utf8" }).trim()
const sha256File = async (file) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex")
const commit = process.env.GITHUB_SHA ?? command("git", ["rev-parse", "HEAD"])
const trackedStatus = command("git", ["status", "--porcelain", "--untracked-files=no"])
if (process.env.CI === "true" && trackedStatus.length > 0) {
  throw new Error(`Release evidence requires unchanged tracked source files:\n${trackedStatus}`)
}
const rootPackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
const workflowPaths = [".github/workflows/ci.yml", ".github/dependabot.yml"]
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  repository: process.env.GITHUB_REPOSITORY ?? "jsplatkin/greenlit.ai",
  commit,
  ref: process.env.GITHUB_REF ?? command("git", ["branch", "--show-current"]),
  workflowRunId: process.env.GITHUB_RUN_ID ?? null,
  workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  trackedSourceTreeClean: trackedStatus.length === 0,
  runtime: {
    node: process.version,
    packageManager: rootPackage.packageManager,
  },
  evidence: {
    lockfile: {
      path: "pnpm-lock.yaml",
      sha256: await sha256File(path.join(root, "pnpm-lock.yaml")),
    },
    sbom: { path: "sbom.cdx.json", sha256: await sha256File(sbomPath) },
    automation: await Promise.all(
      workflowPaths.map(async (workflowPath) => ({
        path: workflowPath,
        sha256: await sha256File(path.join(root, workflowPath)),
      }))
    ),
  },
}
await writeFile(
  path.join(evidenceDir, "release-evidence.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
)
console.log(`Release evidence: ${commit.slice(0, 12)} -> .artifacts/release-evidence.json`)
