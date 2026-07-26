import type { AmendmentOutlineSection, ComparableAction, EvidenceMatrixItem } from "./report.js"

export function mergeComparableActionsIntoOutline(
  outline: AmendmentOutlineSection[],
  actions: ComparableAction[],
  evidenceMatrix: EvidenceMatrixItem[]
) {
  if (actions.length === 0) return outline
  const matrixById = new Map(evidenceMatrix.map((item) => [item.id, item]))
  const actionIdsByRequirement = new Map<string, string[]>()
  for (const action of actions) {
    const current = actionIdsByRequirement.get(action.requirementId) ?? []
    current.push(action.id)
    actionIdsByRequirement.set(action.requirementId, current)
  }
  const foundationIds = actions
    .filter((action) => action.requirementId !== "independent-evidence-synthesis")
    .map((action) => `outline-action-${action.id}`)

  const workPackages = actions
    .map((action) => {
      const matrix = matrixById.get(action.requirementId)
      const dependencies = dependenciesFor(action, actionIdsByRequirement, foundationIds)
      return {
        id: `outline-action-${action.id}`,
        title: `Work package — ${shortTitle(action.question)}`,
        items: [
          `Amendment: ${action.amendmentAction}`,
          `Research/verification: ${action.researchAction}`,
        ],
        priority: action.priority,
        domains: [action.requirementId],
        citations: matrix?.citations ?? [],
        sequence: sequenceFor(action),
        ownerRole: ownerFor(action.requirementId),
        dependencies,
        deliverables: action.evidenceNeeded,
        sourceActionIds: [action.id],
        comparatorSources: action.comparatorSupport.map((support) => ({
          filingName: support.filingName,
          conclusion: support.conclusion,
          pageNumbers: support.pageNumbers,
        })),
      } satisfies AmendmentOutlineSection
    })
    .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0))

  return [
    ...workPackages,
    ...outline.map((section, index) => ({
      ...section,
      sequence: workPackages.length + index + 1,
    })),
  ]
}

function dependenciesFor(
  action: ComparableAction,
  actionIdsByRequirement: Map<string, string[]>,
  foundationIds: string[]
) {
  if (action.requirementId === "independent-evidence-synthesis") {
    return foundationIds
  }
  if (action.requirementId === "test-article-comparability") {
    return (actionIdsByRequirement.get("identity-composition") ?? []).map(
      (id) => `outline-action-${id}`
    )
  }
  return []
}

function sequenceFor(action: ComparableAction) {
  if (action.requirementId === "identity-composition") return 1
  if (action.requirementId === "test-article-comparability") {
    return action.question.toLowerCase().includes("proteomics") ? 3 : 2
  }
  if (action.requirementId === "intended-uses-exposure") return 4
  if (action.requirementId === "independent-evidence-synthesis") return 5
  return 6
}

function ownerFor(requirementId: string) {
  if (requirementId === "identity-composition") return "Analytical lead"
  if (requirementId === "test-article-comparability") {
    return "Process development and toxicology leads"
  }
  if (requirementId === "intended-uses-exposure") return "Dietary exposure lead"
  if (requirementId === "independent-evidence-synthesis") {
    return "Regulatory lead and GRAS panel"
  }
  return "Regulatory lead"
}

function shortTitle(question: string) {
  const title = question.replace(/^whether\s+/i, "").replace(/[?.]+$/, "")
  return title.length > 110 ? `${title.slice(0, 109).trim()}…` : title
}
