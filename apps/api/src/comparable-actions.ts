import {
  type ComparableAction,
  ComparableActionSchema,
  type ComparableFiling,
  type EvidenceMatrixItem,
} from "../../../packages/core/src/index.js"
import { externalModelRequestError } from "./external-model-policy.js"
import { requestExternalModel } from "./model-gateway.js"
import { readModelStageCache, writeModelStageCache } from "./model-stage-cache.js"

export type ComparableActionSynthesizer = (input: {
  evidenceMatrix: EvidenceMatrixItem[]
  filings: ComparableFiling[]
  cacheDir?: string
}) => Promise<ComparableAction[]>

export const actionOutputSchema = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          requirementId: { type: "string" },
          question: { type: "string" },
          priority: { type: "string", enum: ["critical", "major", "minor"] },
          synthesis: { type: "string" },
          amendmentAction: { type: "string" },
          researchAction: { type: "string" },
          evidenceNeeded: { type: "array", items: { type: "string" } },
          subjectCitationPages: { type: "array", items: { type: "integer" } },
          comparatorSupport: {
            type: "array",
            items: {
              type: "object",
              properties: {
                filingId: { type: "string" },
                filingName: { type: "string" },
                conclusion: {
                  type: "string",
                  enum: [
                    "directly_supportive",
                    "supportive_with_limitations",
                    "contextual_only",
                    "not_transferable",
                    "conflicting",
                    "insufficient_information",
                  ],
                },
                pageNumbers: { type: "array", items: { type: "integer" } },
              },
              required: ["filingId", "filingName", "conclusion", "pageNumbers"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "id",
          "requirementId",
          "question",
          "priority",
          "synthesis",
          "amendmentAction",
          "researchAction",
          "evidenceNeeded",
          "subjectCitationPages",
          "comparatorSupport",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["actions"],
  additionalProperties: false,
} as const

export const synthesizeComparableActionsWithAnthropic: ComparableActionSynthesizer = async ({
  evidenceMatrix,
  filings,
  cacheDir,
}) => {
  const questions = evidenceMatrix.flatMap((item) =>
    item.unresolvedQuestions.map((question) => ({
      requirementId: item.id,
      question,
      subjectAssessment: item.assessment,
      subjectEvidenceSummary: item.evidenceSummary,
      subjectCitations: item.citations,
    }))
  )
  if (questions.length === 0) return []

  const model = process.env.GREENLIT_ANTHROPIC_MODEL ?? "claude-sonnet-4-6"
  const cacheInput = { model, questions, filings }
  const cached = await readModelStageCache<ComparableAction[]>(
    cacheDir,
    "comparable-actions",
    cacheInput
  )
  if (cached) return validateActions(cached, evidenceMatrix, filings)

  const response = await requestExternalModel("comparable_action_synthesis", {
    model,
    max_tokens: 8_000,
    temperature: 0,
    output_config: { format: { type: "json_schema", schema: actionOutputSchema } },
    system: `Convert comparator assessments into targeted GRAS-notice amendment and research actions.

Return exactly one action for each supplied unresolved question. The amendment action must say what to add, revise, reconcile, or explain in the filing. The research action must state the smallest evidence-generation or verification step needed; if existing records can answer the question, say to verify or compile them instead of recommending a new study.

Do not claim that a comparator proves safety, equivalence, FDA acceptance, or resolution. Contextual and non-transferable comparators may inform document structure but cannot supply substantive evidence. Preserve the distinction between filing improvement and new evidence generation. Do not introduce numerical limits, legal interpretations, section numbers, table numbers, studies, or factual premises that are not in the supplied subject evidence. Cite only supplied subject and comparator page numbers.`,
    messages: [
      {
        role: "user",
        content: `UNRESOLVED QUESTIONS\n${JSON.stringify(
          questions
        )}\n\nCOMPARATOR ASSESSMENTS\n${JSON.stringify(filings)}`,
      },
    ],
  })
  if (!response.ok) {
    throw externalModelRequestError("Comparable action synthesis", response.status)
  }
  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
  }
  const raw = payload.content?.find((item) => item.type === "text")?.text
  if (!raw) throw new Error("Comparable action synthesis returned no text")
  const parsed = JSON.parse(raw) as { actions?: ComparableAction[] }
  const actions = parsed.actions ?? []
  await writeModelStageCache(cacheDir, "comparable-actions", cacheInput, actions)
  return validateActions(actions, evidenceMatrix, filings)
}

export function validateActions(
  actions: ComparableAction[],
  evidenceMatrix: EvidenceMatrixItem[],
  filings: ComparableFiling[]
) {
  const questionKeys = new Set(
    evidenceMatrix.flatMap((item) =>
      item.unresolvedQuestions.map((question) => `${item.id}\u0000${question}`)
    )
  )
  const subjectPages = new Map(
    evidenceMatrix.map((item) => [
      item.id,
      new Set(item.citations.map((citation) => citation.pageNumber)),
    ])
  )
  const support = new Map<string, { conclusion: string; pages: Set<number>; name: string }>()
  for (const filing of filings) {
    for (const match of filing.evidenceMatches ?? []) {
      for (const assessment of match.assessments ?? []) {
        support.set(`${filing.id}\u0000${match.requirementId}\u0000${assessment.question}`, {
          conclusion: assessment.conclusion,
          pages: new Set(assessment.comparatorCitationPages),
          name: filing.name,
        })
      }
    }
  }

  return actions.flatMap((action) => {
    if (!questionKeys.has(`${action.requirementId}\u0000${action.question}`)) return []
    if (
      action.subjectCitationPages.length === 0 ||
      !action.subjectCitationPages.every((page) =>
        subjectPages.get(action.requirementId)?.has(page)
      )
    ) {
      return []
    }
    const validSupport = action.comparatorSupport.filter((item) => {
      const expected = support.get(
        `${item.filingId}\u0000${action.requirementId}\u0000${action.question}`
      )
      return (
        expected &&
        item.filingName === expected.name &&
        item.conclusion === expected.conclusion &&
        item.pageNumbers.length > 0 &&
        item.pageNumbers.every((page) => expected.pages.has(page))
      )
    })
    if (validSupport.length === 0) return []
    return [
      ComparableActionSchema.parse({
        ...action,
        comparatorSupport: validSupport,
      }),
    ]
  })
}
