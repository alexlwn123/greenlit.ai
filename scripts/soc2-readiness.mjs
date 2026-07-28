import { readFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const readJson = async (name) =>
  JSON.parse(await readFile(path.join(root, "docs", "trust-center", name), "utf8"))
const program = await readJson("soc2-program.json")
const matrix = await readJson("soc2-control-matrix.json")
const remediation = await readJson("soc2-remediation-register.json")
const risks = await readJson("soc2-risk-register.json")
const intake = await readJson("soc2-management-intake.json")
const exceptions = await readJson("soc2-exception-register.json")

const countBy = (items, key) => {
  const counts = {}
  for (const item of items) counts[item[key]] = (counts[item[key]] ?? 0) + 1
  return counts
}
const missingDecisions = [
  ["legal entity", program.legalEntity],
  ["target as-of date", program.targetAsOfDate],
  ["partner requirement", program.partnerRequirement],
  ["independent auditor", program.auditor],
].filter(([, value]) => !value)
const pendingRisks = risks.risks.filter((risk) => risk.approval !== "approved")
const openP0 = remediation.items.filter(
  (item) => item.priority === "P0" && item.status !== "closed"
)
const intakeChecks = [
  ["legal entity", intake.organization.legalEntity],
  ["principal business address", intake.organization.principalBusinessAddress],
  ["approved product description", intake.organization.productDescriptionApproved],
  ["confirmed executive owner", intake.ownership.executiveOwnerConfirmed],
  ["confirmed security owner", intake.ownership.securityOwnerConfirmed],
  ["confirmed privacy owner", intake.ownership.privacyOwnerConfirmed],
  ["approved scope criteria", intake.scopeDecision.criteriaApproved],
  ["Availability criterion decision", intake.scopeDecision.availabilityRequired !== null],
  ["workforce roster evidence", intake.populations.workforceRosterEvidenceId],
  ["production access roster evidence", intake.populations.productionAccessRosterEvidenceId],
  ["vendor roster evidence", intake.populations.vendorRosterEvidenceId],
  ["audit budget approval", intake.procurement.auditBudgetApproved],
  ["penetration-test budget approval", intake.procurement.penetrationTestBudgetApproved],
  ["auditor engagement evidence", intake.procurement.auditorEngagementEvidenceId],
  [
    "management approval",
    intake.approval.approvedBy && intake.approval.approvedAt && intake.approval.approvalEvidenceId,
  ],
].filter(([, value]) => !value)
const unresolvedExceptions = exceptions.items.filter((item) => item.status !== "closed")

console.log("Greenlit SOC 2 Type I readiness")
console.log(`Scope: ${program.criteria.join(" + ")} (${program.criteriaDecisionStatus})`)
console.log(`Control design: ${JSON.stringify(countBy(matrix.controls, "designStatus"))}`)
console.log(`Remediation: ${JSON.stringify(countBy(remediation.items, "status"))}`)
console.log(`Pending risk approvals: ${pendingRisks.length}`)
console.log(`Open P0 items: ${openP0.length}`)
console.log(`Missing management decisions: ${missingDecisions.map(([label]) => label).join(", ")}`)
console.log(`Incomplete management intake: ${intakeChecks.map(([label]) => label).join(", ")}`)
console.log(`Unresolved control exceptions: ${unresolvedExceptions.length}`)

if (
  missingDecisions.length ||
  intakeChecks.length ||
  pendingRisks.length ||
  openP0.length ||
  unresolvedExceptions.length
) {
  console.log("Readiness decision: NOT READY FOR TYPE I AS-OF DATE")
  process.exitCode = 2
} else {
  console.log("Readiness decision: READY FOR INDEPENDENT AUDITOR CONFIRMATION")
}
