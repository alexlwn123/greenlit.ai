import { describe, expect, it } from "vitest"
import { compareEvidenceMatrices } from "./evidenceMatrixDiff.js"
import type { EvidenceMatrixItem } from "./report.js"

const sharedExcerpt =
  "The pivotal safety data are from a 90-day toxicological study reported by Kondo et al. (1994), provided to FDA in GRN 68."

function row(status: EvidenceMatrixItem["status"], assessment: string): EvidenceMatrixItem {
  return {
    id: "public-pivotal-safety-evidence",
    domain: "safety",
    requirement: "Public availability and peer review",
    status,
    assessment,
    evidenceSummary: "Kondo et al. (1994), Food and Chemical Toxicology.",
    citations: [{ pageNumber: 21, excerpt: sharedExcerpt }],
    unresolvedQuestions: status === "weak" ? ["Whether publication is explicitly confirmed"] : [],
    relatedFindingIds: [],
  }
}

describe("pair-aware evidence matrix comparison", () => {
  it("suppresses a same-evidence regression caused only by missing reconfirmation", () => {
    const [result] = compareEvidenceMatrices(
      [row("present", "The cited pivotal study is publicly available and peer reviewed.")],
      [
        row(
          "weak",
          "The journal citation is inferable, but the notice does not explicitly confirm publication status."
        ),
      ],
      { pairAware: true }
    )

    expect(result?.change).toBe("unchanged")
    expect(result?.consistencyAdjustment).toBe("shared_evidence_regression_suppressed")
    expect(result?.draftStatus).toBe("weak")
    expect(result?.changeType).toBe("unchanged")
    expect(result?.materiality).toBe("non_material")
  })

  it("retains the raw regression when pair-aware comparison is not requested", () => {
    const [result] = compareEvidenceMatrices(
      [row("present", "The cited pivotal study is publicly available and peer reviewed.")],
      [row("weak", "The notice does not explicitly confirm publication status.")]
    )

    expect(result?.change).toBe("regressed")
    expect(result?.consistencyAdjustment).toBeUndefined()
  })

  it("classifies added and removed cited support as material changes", () => {
    const withoutCitation = { ...row("weak", "Support is asserted but not cited."), citations: [] }
    const withCitation = row("present", "The pivotal study is cited and assessed.")

    expect(compareEvidenceMatrices([withoutCitation], [withCitation])[0]).toMatchObject({
      change: "improved",
      changeType: "support_added",
      materiality: "material",
    })
    expect(compareEvidenceMatrices([withCitation], [withoutCitation])[0]).toMatchObject({
      change: "regressed",
      changeType: "support_removed",
      materiality: "material",
    })
  })

  it("distinguishes changed evidence from an unchanged status", () => {
    const revised = row("present", "A different pivotal study now supports the requirement.")
    revised.citations = [
      {
        pageNumber: 44,
        excerpt: "A newly submitted reproductive toxicity study supports the revised assessment.",
      },
    ]

    expect(
      compareEvidenceMatrices(
        [row("present", "The original study supports the requirement.")],
        [revised]
      )[0]
    ).toMatchObject({
      change: "unchanged",
      changeType: "support_modified",
      materiality: "potentially_material",
    })
  })
})
