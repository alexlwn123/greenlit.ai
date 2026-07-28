import { access, readFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const registerPath = path.join(root, "docs", "trust-center", "control-register.json")
const register = JSON.parse(await readFile(registerPath, "utf8"))
const allowedStatuses = new Set(["implemented", "partial", "planned", "customer_dependent"])
const ids = new Set()
const errors = []

if (!/^\d{4}-\d{2}-\d{2}$/.test(register.lastReviewed ?? "")) {
  errors.push("lastReviewed must use YYYY-MM-DD")
}
if (!Array.isArray(register.controls) || register.controls.length < 20) {
  errors.push("control register must contain at least 20 controls")
}

for (const control of register.controls ?? []) {
  if (!/^[A-Z]+-\d{2}$/.test(control.id ?? "")) errors.push(`invalid control id: ${control.id}`)
  if (ids.has(control.id)) errors.push(`duplicate control id: ${control.id}`)
  ids.add(control.id)
  if (!allowedStatuses.has(control.status)) errors.push(`${control.id}: invalid status`)
  if (!control.domain || !control.control) errors.push(`${control.id}: missing domain/control`)
  if (!Array.isArray(control.evidence) || control.evidence.length === 0) {
    errors.push(`${control.id}: evidence is required`)
  }
  if (control.status !== "implemented" && !control.gap) {
    errors.push(`${control.id}: incomplete controls require an explicit gap`)
  }
  for (const evidence of control.evidence ?? []) {
    try {
      await access(path.join(root, evidence))
    } catch {
      errors.push(`${control.id}: missing evidence file ${evidence}`)
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"))
  process.exitCode = 1
} else {
  const counts = Object.groupBy(register.controls, (control) => control.status)
  console.log(
    `Trust center validated: ${register.controls.length} controls (${Object.entries(counts)
      .map(([status, controls]) => `${status}=${controls.length}`)
      .join(", ")})`
  )
}
