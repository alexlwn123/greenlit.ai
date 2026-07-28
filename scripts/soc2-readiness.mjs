import { readFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const readJson = async (name) =>
  JSON.parse(await readFile(path.join(root, "docs", "trust-center", name), "utf8"))
const program = await readJson("soc2-program.json")
const matrix = await readJson("soc2-control-matrix.json")
const remediation = await readJson("soc2-remediation-register.json")
const risks = await readJson("soc2-risk-register.json")

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

console.log("Greenlit SOC 2 Type I readiness")
console.log(`Scope: ${program.criteria.join(" + ")} (${program.criteriaDecisionStatus})`)
console.log(`Control design: ${JSON.stringify(countBy(matrix.controls, "designStatus"))}`)
console.log(`Remediation: ${JSON.stringify(countBy(remediation.items, "status"))}`)
console.log(`Pending risk approvals: ${pendingRisks.length}`)
console.log(`Open P0 items: ${openP0.length}`)
console.log(`Missing management decisions: ${missingDecisions.map(([label]) => label).join(", ")}`)

if (missingDecisions.length || pendingRisks.length || openP0.length) {
  console.log("Readiness decision: NOT READY FOR TYPE I AS-OF DATE")
  process.exitCode = 2
} else {
  console.log("Readiness decision: READY FOR INDEPENDENT AUDITOR CONFIRMATION")
}
