import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const outputArgument = process.argv.find((argument) => argument.startsWith("--output="))
const outputPath = path.resolve(
  root,
  outputArgument?.slice("--output=".length) ?? ".artifacts/sbom.cdx.json"
)
const lock = await readFile(path.join(root, "pnpm-lock.yaml"), "utf8")
const packagesSection = lock.match(/(?:^|\n)packages:\s*\n(?<body>[\s\S]*?)(?:\nsnapshots:\s*\n|$)/)
  ?.groups?.body
if (!packagesSection) throw new Error("pnpm-lock.yaml does not contain a packages section")

const headings = [
  ...packagesSection.matchAll(/^ {2}(?<key>'(?:[^']|'')+'|[^ \t:\r\n][^:\r\n]*):\r?$/gm),
]
const components = headings.map((heading, index) => {
  const rawKey = heading.groups?.key ?? ""
  const key = rawKey.startsWith("'") ? rawKey.slice(1, -1).replaceAll("''", "'") : rawKey
  const splitAt = key.startsWith("@")
    ? key.indexOf("@", key.indexOf("/") + 1)
    : key.lastIndexOf("@")
  if (splitAt <= 0) throw new Error(`Unable to parse locked package key: ${key}`)
  const name = key.slice(0, splitAt)
  const version = key.slice(splitAt + 1)
  const start = (heading.index ?? 0) + heading[0].length
  const end = headings[index + 1]?.index ?? packagesSection.length
  const block = packagesSection.slice(start, end)
  const integrity = block.match(/integrity:\s*(?<value>sha(?:256|384|512)-[A-Za-z0-9+/=]+)/)?.groups
    ?.value
  const hashes = integrity
    ? [
        {
          alg: integrity.slice(0, integrity.indexOf("-")).toUpperCase().replace("SHA", "SHA-"),
          content: Buffer.from(integrity.slice(integrity.indexOf("-") + 1), "base64").toString(
            "hex"
          ),
        },
      ]
    : undefined
  return {
    type: "library",
    "bom-ref": `pkg:npm/${encodeURIComponent(name)}@${version}`,
    name,
    version,
    purl: `pkg:npm/${encodeURIComponent(name)}@${version}`,
    ...(hashes ? { hashes } : {}),
    properties: [{ name: "greenlit:source", value: "pnpm-lock.yaml/packages" }],
  }
})

components.sort((left, right) => left.purl.localeCompare(right.purl))
const rootPackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: {
      type: "application",
      name: rootPackage.name,
      version: rootPackage.version,
      "bom-ref": `pkg:npm/${rootPackage.name}@${rootPackage.version}`,
    },
    properties: [
      { name: "greenlit:lockfile-sha256", value: createHash("sha256").update(lock).digest("hex") },
      {
        name: "greenlit:inventory-scope",
        value: "complete lockfile including development tooling",
      },
    ],
  },
  components,
}

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(bom, null, 2)}\n`)
console.log(
  `CycloneDX SBOM: ${components.length} locked components -> ${path.relative(root, outputPath)}`
)
