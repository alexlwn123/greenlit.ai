import type { EvidenceMatrixItem, FilingDiffItem } from "./report.js"

const statusRank = {
  missing: 0,
  weak: 1,
  present: 2,
  not_applicable: 3,
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

    return {
      id: `diff-${id}`,
      label: draftItem?.requirement ?? baselineItem?.requirement ?? id,
      status:
        draftStatus === "present" ? "aligned" : draftStatus === "weak" ? "partial" : "missing",
      baselineExpectation: baselineItem?.assessment ?? "No baseline row was available.",
      draftSignal: draftItem?.assessment ?? "No draft row was available.",
      recommendedAction: recommendationFor(change, draftItem),
      baselineStatus: baselineItem?.status,
      draftStatus,
      change,
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
