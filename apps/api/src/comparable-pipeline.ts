import type {
  ComparableAction,
  ComparableFiling,
  EvidenceMatrixItem,
  NoticeProfile,
} from "../../../packages/core/src/index.js"
import { actionOutputSchema, validateActions } from "./comparable-actions.js"
import {
  type Assessment,
  assessmentOutputSchema,
  buildComparableAssessmentPrompt,
  mergeAssessments,
} from "./comparable-assessment.js"
import {
  assertExternalModelProcessingAllowed,
  externalModelRequestError,
} from "./external-model-policy.js"
import { readModelStageCache, writeModelStageCache } from "./model-stage-cache.js"

export async function assessAndSynthesizeComparablesWithAnthropic({
  subjectProfile,
  evidenceMatrix,
  filings,
  cacheDir,
}: {
  subjectProfile: NoticeProfile
  evidenceMatrix: EvidenceMatrixItem[]
  filings: ComparableFiling[]
  cacheDir?: string
}) {
  const unresolved = evidenceMatrix.filter((item) => item.unresolvedQuestions.length > 0)
  const eligibleFilings = filings.filter(
    (filing) => filing.researchUse !== "context_only" && filing.evidenceMatches?.length
  )
  if (unresolved.length === 0 || eligibleFilings.length === 0) {
    return { comparableFilings: filings, comparableActions: [], modelUsage: [] }
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for comparable synthesis")
  const model = process.env.GREENLIT_ANTHROPIC_MODEL ?? "claude-sonnet-4-6"
  const cacheInput = { model, subjectProfile, unresolved, eligibleFilings }
  const cached = await readModelStageCache<{
    assessments: Assessment[]
    actions: ComparableAction[]
  }>(cacheDir, "comparable-pipeline", cacheInput)
  if (cached) {
    return {
      ...validatedResult(filings, unresolved, cached.assessments, cached.actions),
      modelUsage: [modelUsage("comparable_pipeline_cache", model)],
    }
  }

  const schema = {
    type: "object",
    properties: {
      assessments: assessmentOutputSchema.properties.assessments,
      actions: actionOutputSchema.properties.actions,
    },
    required: ["assessments", "actions"],
    additionalProperties: false,
  } as const
  assertExternalModelProcessingAllowed()
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      max_tokens: 16_000,
      temperature: 0,
      output_config: { format: { type: "json_schema", schema } },
      system: `Assess comparator transferability conservatively, then produce one targeted action for every unresolved question. Comparator similarity or an FDA response never proves safety or equivalence. Actions must distinguish filing amendments from the smallest evidence-verification step. Use only supplied subject and comparator pages and introduce no new factual premises, studies, numerical limits, or legal conclusions.`,
      messages: [
        {
          role: "user",
          content: `${buildComparableAssessmentPrompt(subjectProfile, unresolved, eligibleFilings)}\n\nAlso return exactly one action for every unresolved question using the action schema. Base comparatorSupport only on assessments returned in this same response.`,
        },
      ],
    }),
  })
  if (!response.ok) {
    throw externalModelRequestError("Combined comparator pipeline", response.status)
  }
  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
  const raw = payload.content?.find((item) => item.type === "text")?.text
  if (!raw) throw new Error("Combined comparator pipeline returned no text")
  const parsed = JSON.parse(raw) as { assessments?: Assessment[]; actions?: ComparableAction[] }
  const output = { assessments: parsed.assessments ?? [], actions: parsed.actions ?? [] }
  await writeModelStageCache(cacheDir, "comparable-pipeline", cacheInput, output)
  return {
    ...validatedResult(filings, unresolved, output.assessments, output.actions),
    modelUsage: [modelUsage("comparable_pipeline", model, payload.usage)],
  }
}

function modelUsage(
  stage: string,
  model: string,
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
) {
  const inputTokens = usage?.input_tokens ?? 0
  const outputTokens = usage?.output_tokens ?? 0
  const cacheCreationInputTokens = usage?.cache_creation_input_tokens ?? 0
  const cacheReadInputTokens = usage?.cache_read_input_tokens ?? 0
  const inputRate = Number(process.env.GREENLIT_INPUT_COST_PER_MTOK ?? 3)
  const outputRate = Number(process.env.GREENLIT_OUTPUT_COST_PER_MTOK ?? 15)
  const estimatedCostUsd =
    ((inputTokens + cacheCreationInputTokens) * inputRate + outputTokens * outputRate) / 1_000_000 +
    (cacheReadInputTokens * inputRate * 0.1) / 1_000_000
  return {
    stage,
    model,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
  }
}

function validatedResult(
  filings: ComparableFiling[],
  unresolved: EvidenceMatrixItem[],
  assessments: Assessment[],
  actions: ComparableAction[]
) {
  const comparableFilings = mergeAssessments(filings, assessments, unresolved)
  const comparableActions = validateActions(actions, unresolved, comparableFilings)
  const expectedActions = unresolved.reduce(
    (total, item) => total + item.unresolvedQuestions.length,
    0
  )
  if (comparableActions.length !== expectedActions) {
    throw new Error(
      `Combined comparator pipeline returned ${comparableActions.length} valid actions; expected ${expectedActions}.`
    )
  }
  return {
    comparableFilings,
    comparableActions,
  }
}
