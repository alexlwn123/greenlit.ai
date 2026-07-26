import { describe, expect, it } from "vitest"
import {
  ExpertReviewSetSchema,
  evaluateFindingCalibration,
  passesExpertCalibrationGate,
} from "./calibration.js"
import type { Finding } from "./report.js"

const findings: Finding[] = [
  {
    id: "confirmed-safety",
    severity: "critical",
    title: "Safety bridge",
    summary: "Bridge is incomplete.",
    recommendedAction: "Add the bridge.",
    evidence: [],
  },
  {
    id: "confirmed-exposure",
    severity: "major",
    title: "Exposure",
    summary: "Exposure is incomplete.",
    recommendedAction: "Complete exposure.",
    evidence: [],
  },
]

describe("expert calibration metrics", () => {
  it("computes precision, recall, ratings, and domain breakdowns", () => {
    const metrics = evaluateFindingCalibration(findings, {
      reviewVersion: "1.0.0",
      reviewerId: "reviewer-1",
      blinded: true,
      labels: [
        label("confirmed-safety", "confirmed", "safety", "critical", 5, 4),
        label("confirmed-exposure", "confirmed", "exposure", "major", 4, 3),
        label(null, "missed", "manufacturing", "major", null, null),
      ],
    })

    expect(metrics).toMatchObject({
      precision: 1,
      recall: 0.667,
      medianCitationAccuracy: 4.5,
      medianActionUsefulness: 3.5,
      counts: { predicted: 2, confirmed: 2, falsePositive: 0, missed: 1, unreviewed: 0 },
    })
    expect(metrics.byDomain.manufacturing?.recall).toBe(0)
    expect(passesExpertCalibrationGate(metrics)).toBe(false)
  })

  it("requires a complete blind review before passing", () => {
    const metrics = evaluateFindingCalibration(findings, {
      reviewVersion: "1.0.0",
      reviewerId: "reviewer-1",
      blinded: true,
      labels: [
        label("confirmed-safety", "confirmed", "safety", "critical", 5, 4),
        label("confirmed-exposure", "confirmed", "exposure", "major", 4, 3),
      ],
    })

    expect(passesExpertCalibrationGate(metrics)).toBe(true)
  })

  it("rejects malformed labels and unknown analyzer finding IDs", () => {
    expect(() =>
      ExpertReviewSetSchema.parse({
        reviewVersion: "1",
        reviewerId: "reviewer",
        blinded: true,
        labels: [label("finding-id", "missed", "safety", "major", null, null)],
      })
    ).toThrow(/Missed findings cannot reference/)

    expect(() =>
      evaluateFindingCalibration(findings, {
        reviewVersion: "1",
        reviewerId: "reviewer",
        blinded: true,
        labels: [label("unknown", "confirmed", "safety", "major", 5, 5)],
      })
    ).toThrow(/unknown finding IDs/)
  })
})

function label(
  findingId: string | null,
  verdict: "confirmed" | "false_positive" | "missed",
  domain: string,
  severity: "critical" | "major" | "minor",
  citationAccuracy: number | null,
  actionUsefulness: number | null
) {
  return {
    caseId: "CASE-01",
    findingId,
    verdict,
    domain,
    severity,
    citationAccuracy,
    actionUsefulness,
    notes: "",
  }
}
