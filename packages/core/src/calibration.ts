import { z } from "zod"
import { type Finding, FindingSeveritySchema } from "./report.js"

export const ExpertFindingLabelSchema = z
  .object({
    caseId: z.string().min(1),
    findingId: z.string().min(1).nullable(),
    verdict: z.enum(["confirmed", "false_positive", "missed"]),
    domain: z.string().min(1),
    severity: FindingSeveritySchema,
    citationAccuracy: z.number().int().min(1).max(5).nullable(),
    actionUsefulness: z.number().int().min(1).max(5).nullable(),
    notes: z.string().default(""),
  })
  .superRefine((label, context) => {
    if (label.verdict === "missed" && label.findingId !== null) {
      context.addIssue({
        code: "custom",
        message: "Missed findings cannot reference an analyzer finding ID.",
      })
    }
    if (label.verdict !== "missed" && label.findingId === null) {
      context.addIssue({
        code: "custom",
        message: "Reviewed analyzer findings require a finding ID.",
      })
    }
  })

export const ExpertReviewSetSchema = z.object({
  reviewVersion: z.string().min(1),
  reviewerId: z.string().min(1),
  blinded: z.boolean(),
  labels: z.array(ExpertFindingLabelSchema),
})

export type ExpertFindingLabel = z.infer<typeof ExpertFindingLabelSchema>
export type ExpertReviewSet = z.infer<typeof ExpertReviewSetSchema>

export type CalibrationMetrics = ReturnType<typeof evaluateFindingCalibration>

export function evaluateFindingCalibration(findings: Finding[], reviewInput: ExpertReviewSet) {
  const review = ExpertReviewSetSchema.parse(reviewInput)
  const predictedIds = new Set(findings.map((finding) => finding.id))
  const reviewedPredicted = review.labels.filter((label) => label.verdict !== "missed")
  const unknownFindingIds = reviewedPredicted
    .map((label) => label.findingId as string)
    .filter((id) => !predictedIds.has(id))
  if (unknownFindingIds.length > 0) {
    throw new Error(
      `Expert labels reference unknown finding IDs: ${[...new Set(unknownFindingIds)].join(", ")}`
    )
  }

  const confirmed = review.labels.filter((label) => label.verdict === "confirmed")
  const falsePositives = review.labels.filter((label) => label.verdict === "false_positive")
  const missed = review.labels.filter((label) => label.verdict === "missed")
  const reviewedIds = new Set(reviewedPredicted.map((label) => label.findingId as string))
  const unreviewedFindingIds = findings
    .map((finding) => finding.id)
    .filter((id) => !reviewedIds.has(id))
  const domains = [...new Set(review.labels.map((label) => label.domain))].sort()

  return {
    reviewVersion: review.reviewVersion,
    reviewerId: review.reviewerId,
    blinded: review.blinded,
    counts: {
      predicted: findings.length,
      confirmed: confirmed.length,
      falsePositive: falsePositives.length,
      missed: missed.length,
      unreviewed: unreviewedFindingIds.length,
    },
    precision: ratio(confirmed.length, confirmed.length + falsePositives.length),
    recall: ratio(confirmed.length, confirmed.length + missed.length),
    criticalFalsePositives: falsePositives.filter((label) => label.severity === "critical").length,
    medianCitationAccuracy: median(
      confirmed.flatMap((label) =>
        label.citationAccuracy === null ? [] : [label.citationAccuracy]
      )
    ),
    medianActionUsefulness: median(
      confirmed.flatMap((label) =>
        label.actionUsefulness === null ? [] : [label.actionUsefulness]
      )
    ),
    unreviewedFindingIds,
    byDomain: Object.fromEntries(
      domains.map((domain) => {
        const labels = review.labels.filter((label) => label.domain === domain)
        const domainConfirmed = labels.filter((label) => label.verdict === "confirmed").length
        const domainFalsePositive = labels.filter(
          (label) => label.verdict === "false_positive"
        ).length
        const domainMissed = labels.filter((label) => label.verdict === "missed").length
        return [
          domain,
          {
            confirmed: domainConfirmed,
            falsePositive: domainFalsePositive,
            missed: domainMissed,
            precision: ratio(domainConfirmed, domainConfirmed + domainFalsePositive),
            recall: ratio(domainConfirmed, domainConfirmed + domainMissed),
          },
        ]
      })
    ),
  }
}

export function passesExpertCalibrationGate(metrics: CalibrationMetrics) {
  return (
    metrics.blinded &&
    metrics.counts.unreviewed === 0 &&
    metrics.criticalFalsePositives === 0 &&
    metrics.precision !== null &&
    metrics.precision >= 0.75 &&
    metrics.recall !== null &&
    metrics.recall >= 0.8 &&
    metrics.medianCitationAccuracy !== null &&
    metrics.medianCitationAccuracy >= 4 &&
    metrics.medianActionUsefulness !== null &&
    metrics.medianActionUsefulness >= 3
  )
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(3))
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const midpoint = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[midpoint] ?? null)
    : Number((((sorted[midpoint - 1] ?? 0) + (sorted[midpoint] ?? 0)) / 2).toFixed(2))
}
