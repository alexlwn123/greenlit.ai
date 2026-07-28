import { access, readFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const registerPath = path.join(root, "docs", "trust-center", "control-register.json")
const register = JSON.parse(await readFile(registerPath, "utf8"))
const allowedStatuses = new Set(["implemented", "partial", "planned", "customer_dependent"])
const ids = new Set()
const errors = []

const soc2Matrix = JSON.parse(
  await readFile(path.join(root, "docs", "trust-center", "soc2-control-matrix.json"), "utf8")
)
const riskRegister = JSON.parse(
  await readFile(path.join(root, "docs", "trust-center", "soc2-risk-register.json"), "utf8")
)
const remediationRegister = JSON.parse(
  await readFile(path.join(root, "docs", "trust-center", "soc2-remediation-register.json"), "utf8")
)
const vendorScorecard = JSON.parse(
  await readFile(path.join(root, "docs", "trust-center", "soc2-vendor-scorecard.json"), "utf8")
)

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

const soc2Ids = new Set()
for (const control of soc2Matrix.controls ?? []) {
  if (!/^SOC-[A-Z]+-\d{2}$/.test(control.id ?? "")) errors.push(`invalid SOC 2 id: ${control.id}`)
  if (soc2Ids.has(control.id)) errors.push(`duplicate SOC 2 id: ${control.id}`)
  soc2Ids.add(control.id)
  if (!new Set(["implemented", "partial", "gap"]).has(control.designStatus)) {
    errors.push(`${control.id}: invalid design status`)
  }
  for (const evidence of control.evidence ?? []) {
    try {
      await access(path.join(root, evidence))
    } catch {
      errors.push(`${control.id}: missing evidence file ${evidence}`)
    }
  }
}

const riskIds = new Set()
for (const risk of riskRegister.risks ?? []) {
  if (!/^R-\d{2}$/.test(risk.id ?? "")) errors.push(`invalid risk id: ${risk.id}`)
  if (riskIds.has(risk.id)) errors.push(`duplicate risk id: ${risk.id}`)
  riskIds.add(risk.id)
  if (risk.inherentScore !== risk.likelihood * risk.impact) {
    errors.push(`${risk.id}: inherent score does not equal likelihood x impact`)
  }
  if (risk.residualScore > risk.inherentScore) {
    errors.push(`${risk.id}: residual score exceeds inherent score`)
  }
}

const remediationIds = new Set()
for (const item of remediationRegister.items ?? []) {
  if (!/^REM-\d{2}$/.test(item.id ?? "")) errors.push(`invalid remediation id: ${item.id}`)
  if (remediationIds.has(item.id)) errors.push(`duplicate remediation id: ${item.id}`)
  remediationIds.add(item.id)
  if (!remediationRegister.statuses.includes(item.status)) {
    errors.push(`${item.id}: invalid remediation status`)
  }
  if (!new Set(["P0", "P1", "P2"]).has(item.priority)) {
    errors.push(`${item.id}: invalid priority`)
  }
  for (const controlId of item.controlIds ?? []) {
    if (!soc2Ids.has(controlId)) errors.push(`${item.id}: unknown control ${controlId}`)
  }
}

const selectionIds = new Set()
let totalSelectionWeight = 0
for (const criterion of vendorScorecard.criteria ?? []) {
  if (!/^SEL-\d{2}$/.test(criterion.id ?? "")) errors.push(`invalid selection id: ${criterion.id}`)
  if (selectionIds.has(criterion.id)) errors.push(`duplicate selection id: ${criterion.id}`)
  selectionIds.add(criterion.id)
  if (!Number.isInteger(criterion.weight) || criterion.weight < 1 || criterion.weight > 5) {
    errors.push(`${criterion.id}: weight must be an integer from 1-5`)
  }
  totalSelectionWeight += criterion.weight
}
if (selectionIds.size < 8 || totalSelectionWeight < 30) {
  errors.push("vendor scorecard must contain a materially weighted selection model")
}

if (errors.length) {
  console.error(errors.join("\n"))
  process.exitCode = 1
} else {
  const counts = Object.groupBy(register.controls, (control) => control.status)
  console.log(
    `Trust center validated: ${register.controls.length} enterprise controls, ${soc2Ids.size} SOC 2 controls, ${riskIds.size} risks, ${remediationIds.size} remediation items (${Object.entries(
      counts
    )
      .map(([status, controls]) => `${status}=${controls.length}`)
      .join(", ")})`
  )
}
