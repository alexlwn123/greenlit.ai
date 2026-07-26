import type { EvidenceMatrixItem, FilingDiffItem } from "./report.js"

const statusRank = {
  missing: 0,
  weak: 1,
  substantial_gaps: 1,
  strong_with_minor_gaps: 2,
  present: 3,
  not_applicable: 4,
} as const

export function compareEvidenceMatrices(
  baseline: EvidenceMatrixItem[],
  draft: EvidenceMatrixItem[],
  options: { pairAware?: boolean } = {}
): FilingDiffItem[] {
  const baselineById = new Map(baseline.map((item) => [item.id, item]))
  const draftById = new Map(draft.map((item) => [item.id, item]))
  const ids = [...new Set([...baselineById.keys(), ...draftById.keys()])]

  return ids.map((id) => {
    const baselineItem = baselineById.get(id)
    const draftItem = draftById.get(id)
    const rawChange = classifyChange(baselineItem, draftItem)
    const adjusted =
      options.pairAware &&
      rawChange === "regressed" &&
      sharedEvidenceReconfirmationOnly(baselineItem, draftItem)
    const change = adjusted ? ("unchanged" as const) : rawChange
    const draftStatus = draftItem?.status
    const changeType = classifyChangeType(baselineItem, draftItem, change)

    return {
      id: `diff-${id}`,
      label: draftItem?.requirement ?? baselineItem?.requirement ?? id,
      status:
        draftStatus === "present"
          ? "aligned"
          : draftStatus === "missing" || draftStatus === undefined
            ? "missing"
            : "partial",
      baselineExpectation: baselineItem?.assessment ?? "No baseline row was available.",
      draftSignal: draftItem?.assessment ?? "No draft row was available.",
      recommendedAction: recommendationFor(change, draftItem),
      baselineStatus: baselineItem?.status,
      draftStatus,
      change,
      changeType,
      materiality: materialityFor(changeType, baselineItem, draftItem),
      changeSummary: summarizeChange(changeType, baselineItem, draftItem),
      baselineCitations: baselineItem?.citations ?? [],
      draftCitations: draftItem?.citations ?? [],
      ...(adjusted
        ? {
            consistencyAdjustment: "shared_evidence_regression_suppressed" as const,
            consistencyReason:
              "The revision cites materially the same evidence, and the apparent regression is based only on publication or availability not being explicitly reconfirmed.",
          }
        : {}),
    }
  })
}

type MatrixChange = ReturnType<typeof classifyChange>
type ChangeType =
  | "support_added"
  | "support_removed"
  | "support_strengthened"
  | "support_weakened"
  | "support_modified"
  | "unchanged"
  | "not_comparable"

function classifyChangeType(
  baseline: EvidenceMatrixItem | undefined,
  draft: EvidenceMatrixItem | undefined,
  change: MatrixChange
): ChangeType {
  if (!baseline || !draft || change === "not_comparable") return "not_comparable"
  if (baseline.citations.length === 0 && draft.citations.length > 0) return "support_added"
  if (baseline.citations.length > 0 && draft.citations.length === 0) return "support_removed"
  if (change === "improved") return "support_strengthened"
  if (change === "regressed") return "support_weakened"
  if (
    sameEvidence(baseline, draft) &&
    normalizedText(baseline.assessment) === normalizedText(draft.assessment)
  ) {
    return "unchanged"
  }
  return sameEvidence(baseline, draft) ? "unchanged" : "support_modified"
}

function materialityFor(
  changeType: ChangeType,
  baseline: EvidenceMatrixItem | undefined,
  draft: EvidenceMatrixItem | undefined
) {
  if (changeType === "support_removed" || changeType === "support_weakened")
    return "material" as const
  if (changeType === "support_added" || changeType === "support_strengthened") {
    return draft?.status === "present" ? ("material" as const) : ("potentially_material" as const)
  }
  if (changeType === "support_modified") {
    return baseline?.status === "present" || draft?.status === "present"
      ? ("potentially_material" as const)
      : ("non_material" as const)
  }
  return "non_material" as const
}

function summarizeChange(
  changeType: ChangeType,
  baseline: EvidenceMatrixItem | undefined,
  draft: EvidenceMatrixItem | undefined
) {
  const summaries: Record<ChangeType, string> = {
    support_added:
      "The revised filing adds cited support that was absent from the baseline filing.",
    support_removed:
      "The revised filing no longer includes cited support present in the baseline filing.",
    support_strengthened:
      "The revised filing strengthens the requirement's evidentiary support or adequacy.",
    support_weakened:
      "The revised filing weakens the requirement's evidentiary support or adequacy.",
    support_modified:
      "The revised filing changes the cited support without a clear status improvement or regression.",
    unchanged: "The two filings rely on materially the same support for this requirement.",
    not_comparable: "The requirement cannot be compared reliably across both filings.",
  }
  const status = baseline && draft ? ` Status: ${baseline.status} to ${draft.status}.` : ""
  return `${summaries[changeType]}${status}`
}

function sameEvidence(baseline: EvidenceMatrixItem, draft: EvidenceMatrixItem) {
  if (baseline.citations.length === 0 || draft.citations.length === 0) {
    return baseline.citations.length === draft.citations.length
  }
  const matched = baseline.citations.filter((left) =>
    draft.citations.some((right) => tokenSimilarity(left.excerpt, right.excerpt) >= 0.65)
  ).length
  return matched / Math.max(baseline.citations.length, draft.citations.length) >= 0.5
}

function normalizedText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}

function sharedEvidenceReconfirmationOnly(
  baseline: EvidenceMatrixItem | undefined,
  draft: EvidenceMatrixItem | undefined
) {
  if (!baseline || !draft || baseline.citations.length === 0 || draft.citations.length === 0) {
    return false
  }
  const rationale = `${draft.assessment} ${draft.evidenceSummary} ${draft.unresolvedQuestions.join(" ")}`
  if (
    !/not (?:affirmatively |explicitly )?(?:state|confirm)|not explicitly|inferable/i.test(
      rationale
    )
  ) {
    return false
  }
  if (/conflict|contradict|different study|new adverse|not representative/i.test(rationale)) {
    return false
  }
  return baseline.citations.some((left) =>
    draft.citations.some((right) => tokenSimilarity(left.excerpt, right.excerpt) >= 0.75)
  )
}

function tokenSimilarity(left: string, right: string) {
  const tokens = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter((token) => token.length > 2) ?? []
    )
  const leftTokens = tokens(left)
  const rightTokens = tokens(right)
  const union = new Set([...leftTokens, ...rightTokens])
  if (union.size === 0) return 0
  return [...leftTokens].filter((token) => rightTokens.has(token)).length / union.size
}

function classifyChange(
  baseline: EvidenceMatrixItem | undefined,
  draft: EvidenceMatrixItem | undefined
) {
  if (
    !baseline ||
    !draft ||
    baseline.status === "not_applicable" ||
    draft.status === "not_applicable"
  ) {
    return "not_comparable" as const
  }
  if (statusRank[draft.status] > statusRank[baseline.status]) {
    return "improved" as const
  }
  if (statusRank[draft.status] < statusRank[baseline.status]) {
    return "regressed" as const
  }
  return "unchanged" as const
}

function recommendationFor(
  change: ReturnType<typeof classifyChange>,
  draft: EvidenceMatrixItem | undefined
) {
  if (!draft) {
    return "Restore the requirement and its supporting evidence in the revised filing."
  }
  if (change === "improved" && draft.status === "present") {
    return "Preserve the revised support and its source traceability."
  }
  if (draft.unresolvedQuestions.length > 0) {
    return `Resolve: ${draft.unresolvedQuestions.join("; ")}`
  }
  if (draft.status === "present") {
    return "Preserve the cited support in the revised filing."
  }
  return "Add or strengthen evidence that directly addresses this requirement."
}
