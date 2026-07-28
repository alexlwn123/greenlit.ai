import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const packArg = process.argv.find((argument) => argument.startsWith("--pack="))
const pack = path.resolve(root, packArg?.slice("--pack=".length) || ".artifacts/soc2-evidence-pack")
const artifactsRoot = path.resolve(root, ".artifacts")
if (pack !== artifactsRoot && !pack.startsWith(`${artifactsRoot}${path.sep}`)) {
  throw new Error("Evidence pack must remain inside .artifacts")
}

const manifestPath = path.join(pack, "manifest.json")
const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
const actualPaths = []
async function inventory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) await inventory(fullPath)
    else if (fullPath !== manifestPath) {
      actualPaths.push(path.relative(pack, fullPath).replaceAll(path.sep, "/"))
    }
  }
}
await inventory(pack)
actualPaths.sort()

const expectedPaths = manifest.files.map((file) => file.path).sort()
if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
  throw new Error("Evidence pack contents do not match the manifest")
}
for (const expected of manifest.files) {
  const contents = await readFile(path.join(pack, expected.path))
  const digest = createHash("sha256").update(contents).digest("hex")
  if (digest !== expected.sha256 || contents.byteLength !== expected.bytes) {
    throw new Error(`Evidence integrity check failed: ${expected.path}`)
  }
}
console.log(
  `SOC 2 evidence pack verified: ${manifest.files.length} files, commit ${manifest.commit.slice(0, 12)}`
)
