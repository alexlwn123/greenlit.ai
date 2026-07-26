import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

export async function readModelStageCache<T>(
  cacheDir: string | undefined,
  stage: string,
  input: unknown
) {
  if (!cacheDir || process.env.GREENLIT_FORCE_MODEL_STAGE_RERUN === "true") return undefined
  try {
    return JSON.parse(await readFile(cachePath(cacheDir, stage, input), "utf8")) as T
  } catch {
    return undefined
  }
}

export async function writeModelStageCache(
  cacheDir: string | undefined,
  stage: string,
  input: unknown,
  output: unknown
) {
  if (!cacheDir) return
  try {
    const file = cachePath(cacheDir, stage, input)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, `${JSON.stringify(output, null, 2)}\n`)
  } catch {
    // Cache persistence must never discard a successful model result.
  }
}

function cachePath(cacheDir: string, stage: string, input: unknown) {
  const digest = createHash("sha256")
    .update("model-stage-cache-v1")
    .update("\0")
    .update(stage)
    .update("\0")
    .update(JSON.stringify(input))
    .digest("hex")
  return path.join(cacheDir, `${stage}-${digest}.json`)
}
