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
const managementIntake = JSON.parse(
  await readFile(path.join(root, "docs", "trust-center", "soc2-management-intake.json"), "utf8")
)
const exceptionRegister = JSON.parse(
  await readFile(path.join(root, "docs", "trust-center", "soc2-exception-register.json"), "utf8")
)
const program = JSON.parse(
  await readFile(path.join(root, "docs", "trust-center", "soc2-program.json"), "utf8")
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

if (managementIntake.version !== 1) errors.push("management intake must declare version 1")
if (!Array.isArray(managementIntake.scopeDecision?.criteria)) {
  errors.push("management intake must declare proposed scope criteria")
}
if (JSON.stringify(managementIntake.scopeDecision.criteria) !== JSON.stringify(program.criteria)) {
  errors.push("management intake criteria must match the SOC 2 program record")
}
for (const ownerType of ["executive", "security", "privacy"]) {
  const intakeOwner = managementIntake.ownership[`${ownerType}Owner`]
  const programOwner = program[`${ownerType}Owner`]
  if (intakeOwner !== programOwner) errors.push(`${ownerType} owner conflicts across SOC 2 records`)
}
if (
  managementIntake.scopeDecision.targetAsOfDate &&
  !/^\d{4}-\d{2}-\d{2}$/.test(managementIntake.scopeDecision.targetAsOfDate)
) {
  errors.push("management intake targetAsOfDate must use YYYY-MM-DD")
}
if (
  managementIntake.approval.approvedAt &&
  Number.isNaN(Date.parse(managementIntake.approval.approvedAt))
) {
  errors.push("management intake approvedAt must be a valid timestamp")
}

const exceptionIds = new Set()
for (const item of exceptionRegister.items ?? []) {
  if (!/^EXC-\d{3}$/.test(item.id ?? "")) errors.push(`invalid exception id: ${item.id}`)
  if (exceptionIds.has(item.id)) errors.push(`duplicate exception id: ${item.id}`)
  exceptionIds.add(item.id)
  if (!exceptionRegister.statuses.includes(item.status))
    errors.push(`${item.id}: invalid exception status`)
  for (const controlId of item.controlIds ?? []) {
    if (!soc2Ids.has(controlId)) errors.push(`${item.id}: unknown control ${controlId}`)
  }
  if (!item.owner || !item.detectedAt || !item.description) {
    errors.push(`${item.id}: owner, detectedAt, and description are required`)
  }
  if (item.status === "risk_accepted" && (!item.acceptedBy || !item.acceptanceExpiresAt)) {
    errors.push(`${item.id}: risk acceptance requires approver and expiry`)
  }
  if (["remediated", "closed"].includes(item.status) && !item.retestEvidenceId) {
    errors.push(`${item.id}: remediated/closed exceptions require retest evidence`)
  }
}

if (errors.length) {
  console.error(errors.join("\n"))
  process.exitCode = 1
} else {
  const counts = Object.groupBy(register.controls, (control) => control.status)
  console.log(
    `Trust center validated: ${register.controls.length} enterprise controls, ${soc2Ids.size} SOC 2 controls, ${riskIds.size} risks, ${remediationIds.size} remediation items, ${exceptionIds.size} exceptions (${Object.entries(
      counts
    )
      .map(([status, controls]) => `${status}=${controls.length}`)
      .join(", ")})`
  )
}
