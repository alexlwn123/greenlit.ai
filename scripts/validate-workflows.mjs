import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const workflowDirectory = path.join(root, ".github", "workflows")
const workflowNames = (await readdir(workflowDirectory)).filter((name) => /\.ya?ml$/i.test(name))
const errors = []
let actionCount = 0

for (const name of workflowNames) {
  const contents = await readFile(path.join(workflowDirectory, name), "utf8")
  if (!/^permissions:\s*$/m.test(contents))
    errors.push(`${name}: explicit permissions are required`)
  if (/^\s*permissions:\s*write-all\s*$/m.test(contents))
    errors.push(`${name}: write-all is forbidden`)
  if (/^\s*pull_request_target:\s*$/m.test(contents)) {
    errors.push(`${name}: pull_request_target requires a separately approved threat model`)
  }
  if (/persist-credentials:\s*true\b/.test(contents)) {
    errors.push(`${name}: persisted checkout credentials are forbidden`)
  }

  for (const match of contents.matchAll(/uses:\s*([^@\s]+)@([^\s#]+)/g)) {
    actionCount += 1
    const [, action, revision] = match
    if (action.startsWith("./")) continue
    if (!/^[a-f0-9]{40}$/.test(revision)) {
      errors.push(`${name}: ${action} must use an immutable 40-character commit revision`)
    }
    if (action === "actions/checkout") {
      const followingStep = contents.slice(match.index, match.index + 300)
      if (!/persist-credentials:\s*false\b/.test(followingStep)) {
        errors.push(`${name}: actions/checkout must disable persisted credentials`)
      }
    }
  }

  const jobs =
    contents.match(/^ {2}[a-zA-Z0-9_-]+:\s*$[\s\S]*?(?=^ {2}[a-zA-Z0-9_-]+:\s*$|\s*$)/gm) ?? []
  for (const job of jobs.filter((candidate) => /^\s{4}runs-on:/m.test(candidate))) {
    const jobName = job.match(/^ {2}([a-zA-Z0-9_-]+):/)?.[1] ?? "unknown"
    if (!/^\s{4}timeout-minutes:\s*\d+\s*$/m.test(job)) {
      errors.push(`${name}: job ${jobName} requires timeout-minutes`)
    }
  }
}

if (workflowNames.length === 0) errors.push("at least one workflow is required")
if (actionCount === 0) errors.push("at least one third-party action reference is required")

if (errors.length > 0) {
  console.error(errors.join("\n"))
  process.exitCode = 1
} else {
  console.log(
    `Workflow security validated: ${workflowNames.length} workflows, ${actionCount} immutable action references`
  )
}
