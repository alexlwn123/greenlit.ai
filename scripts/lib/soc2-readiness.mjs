import { readFile } from "node:fs/promises"
import path from "node:path"

const TRUST_CENTER = path.join("docs", "trust-center")

const readJson = async (root, name) =>
  JSON.parse(await readFile(path.join(root, TRUST_CENTER, name), "utf8"))

const countBy = (items, key) => {
  const counts = {}
  for (const item of items) counts[item[key]] = (counts[item[key]] ?? 0) + 1
  return counts
}

export async function assessSoc2Readiness(root = process.cwd()) {
  const [program, matrix, remediation, risks, intake, exceptions, pbc] = await Promise.all([
    readJson(root, "soc2-program.json"),
    readJson(root, "soc2-control-matrix.json"),
    readJson(root, "soc2-remediation-register.json"),
    readJson(root, "soc2-risk-register.json"),
    readJson(root, "soc2-management-intake.json"),
    readJson(root, "soc2-exception-register.json"),
    readJson(root, "soc2-pbc-register.json"),
  ])

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
      intake.approval.approvedBy &&
        intake.approval.approvedAt &&
        intake.approval.approvalEvidenceId,
    ],
  ].filter(([, value]) => !value)
  const unresolvedExceptions = exceptions.items.filter((item) => item.status !== "closed")
  const incompletePbc = pbc.requests.filter(
    (request) => !["ready_for_auditor", "provided", "accepted"].includes(request.status)
  )
  const ready =
    missingDecisions.length === 0 &&
    intakeChecks.length === 0 &&
    pendingRisks.length === 0 &&
    openP0.length === 0 &&
    unresolvedExceptions.length === 0 &&
    incompletePbc.length === 0

  return {
    assessedAt: new Date().toISOString(),
    reportType: program.reportType,
    criteria: program.criteria,
    criteriaDecisionStatus: program.criteriaDecisionStatus,
    counts: {
      controlDesign: countBy(matrix.controls, "designStatus"),
      remediation: countBy(remediation.items, "status"),
      pendingRisks: pendingRisks.length,
      openP0: openP0.length,
      unresolvedExceptions: unresolvedExceptions.length,
      incompletePbc: incompletePbc.length,
    },
    blockers: {
      missingManagementDecisions: missingDecisions.map(([label]) => label),
      incompleteManagementIntake: intakeChecks.map(([label]) => label),
      pendingRiskIds: pendingRisks.map((risk) => risk.id),
      openP0Ids: openP0.map((item) => item.id),
      unresolvedExceptionIds: unresolvedExceptions.map((item) => item.id),
      incompletePbcIds: incompletePbc.map((request) => request.id),
    },
    decision: ready
      ? "READY_FOR_INDEPENDENT_AUDITOR_CONFIRMATION"
      : "NOT_READY_FOR_TYPE_I_AS_OF_DATE",
    ready,
  }
}

export function readinessLines(assessment) {
  return [
    "Greenlit SOC 2 Type I readiness",
    `Scope: ${assessment.criteria.join(" + ")} (${assessment.criteriaDecisionStatus})`,
    `Control design: ${JSON.stringify(assessment.counts.controlDesign)}`,
    `Remediation: ${JSON.stringify(assessment.counts.remediation)}`,
    `Pending risk approvals: ${assessment.counts.pendingRisks}`,
    `Open P0 items: ${assessment.counts.openP0}`,
    `Missing management decisions: ${assessment.blockers.missingManagementDecisions.join(", ")}`,
    `Incomplete management intake: ${assessment.blockers.incompleteManagementIntake.join(", ")}`,
    `Unresolved control exceptions: ${assessment.counts.unresolvedExceptions}`,
    `Incomplete auditor requests: ${assessment.counts.incompletePbc}`,
    `Readiness decision: ${assessment.decision.replaceAll("_", " ")}`,
  ]
}
