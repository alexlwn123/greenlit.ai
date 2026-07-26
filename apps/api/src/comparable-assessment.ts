import {
  type ComparableFiling,
  ComparableFilingSchema,
  type EvidenceMatrixItem,
  type NoticeProfile,
} from "../../../packages/core/src/index.js"
import { readModelStageCache, writeModelStageCache } from "./model-stage-cache.js"

export type ComparableAssessor = (input: {
  subjectProfile: NoticeProfile
  evidenceMatrix: EvidenceMatrixItem[]
  filings: ComparableFiling[]
  cacheDir?: string
}) => Promise<ComparableFiling[]>

const conclusionValues = [
  "directly_supportive",
  "supportive_with_limitations",
  "contextual_only",
  "not_transferable",
  "conflicting",
  "insufficient_information",
] as const

export const assessmentOutputSchema = {
  type: "object",
  properties: {
    assessments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          filingId: { type: "string" },
          requirementId: { type: "string" },
          question: { type: "string" },
          conclusion: { type: "string", enum: conclusionValues },
          rationale: { type: "string" },
          transferableElements: { type: "array", items: { type: "string" } },
          limitations: { type: "array", items: { type: "string" } },
          comparatorCitationPages: { type: "array", items: { type: "integer" } },
        },
        required: [
          "filingId",
          "requirementId",
          "question",
          "conclusion",
          "rationale",
          "transferableElements",
          "limitations",
          "comparatorCitationPages",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["assessments"],
  additionalProperties: false,
} as const

export type Assessment = {
  filingId: string
  requirementId: string
  question: string
  conclusion: (typeof conclusionValues)[number]
  rationale: string
  transferableElements: string[]
  limitations: string[]
  comparatorCitationPages: number[]
}

export const assessComparableEvidenceWithAnthropic: ComparableAssessor = async ({
  subjectProfile,
  evidenceMatrix,
  filings,
  cacheDir,
}) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for comparable assessment")
  }
  const unresolved = evidenceMatrix.filter((item) => item.unresolvedQuestions.length > 0)
  if (unresolved.length === 0) return filings

  const eligibleFilings = filings.filter(
    (filing) => filing.researchUse !== "context_only" && filing.evidenceMatches?.length
  )
  if (eligibleFilings.length === 0) return filings

  const model = process.env.GREENLIT_ANTHROPIC_MODEL ?? "claude-sonnet-4-6"
  const cacheInput = { model, subjectProfile, unresolved, eligibleFilings }
  const cached = await readModelStageCache<Assessment[]>(
    cacheDir,
    "comparable-assessment",
    cacheInput
  )
  if (cached) return mergeAssessments(filings, cached, unresolved)
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      max_tokens: 12_000,
      temperature: 0,
      output_config: {
        format: {
          type: "json_schema",
          schema: assessmentOutputSchema,
        },
      },
      system: `You assess whether passages from comparable FDA GRAS notices can help answer unresolved evidence questions in a subject notice.

Do not infer scientific equivalence from ingredient similarity or a prior FDA response. A comparator can show a documentation method without proving that the subject material is safe or equivalent.

Use these labels:
- directly_supportive: the cited comparator evidence directly answers the subject question and the relevant material, process, exposure, and evidence context are shown to be transferable.
- supportive_with_limitations: it contributes evidence, but material differences or missing bridge elements prevent a complete answer.
- contextual_only: it is a useful documentation example or background, but does not supply transferable evidence for the subject question.
- not_transferable: identified differences make the passage unsuitable for the subject question.
- conflicting: the comparator contains evidence materially inconsistent with the subject premise.
- insufficient_information: the supplied passages do not support a defensible transferability judgment.

Be conservative. Evaluate identity/source, composition, manufacturing, impurities, intended use/exposure, test article, study purpose, and evidence role as relevant. Cite only supplied comparator page numbers. Never say that FDA approved a substance or that another GRN resolves the subject filing.`,
      messages: [
        {
          role: "user",
          content: buildComparableAssessmentPrompt(subjectProfile, unresolved, eligibleFilings),
        },
      ],
    }),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Comparable assessment failed (${response.status}): ${detail.slice(0, 500)}`)
  }
  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
  }
  const raw = payload.content?.find((item) => item.type === "text")?.text
  if (!raw) throw new Error("Comparable assessment returned no text")
  const parsed = JSON.parse(raw) as { assessments?: Assessment[] }
  const assessments = parsed.assessments ?? []
  await writeModelStageCache(cacheDir, "comparable-assessment", cacheInput, assessments)
  return mergeAssessments(filings, assessments, unresolved)
}

export function mergeAssessments(
  filings: ComparableFiling[],
  assessments: Assessment[],
  evidenceMatrix: EvidenceMatrixItem[]
) {
  const allowedQuestions = new Map(
    evidenceMatrix.map((item) => [item.id, new Set(item.unresolvedQuestions)])
  )
  return filings.map((filing) => {
    if (!filing.evidenceMatches) return filing
    const evidenceMatches = filing.evidenceMatches.map((match) => {
      const allowedPages = new Set(match.citations.map((citation) => citation.pageNumber))
      const questions = [...(allowedQuestions.get(match.requirementId) ?? [])]
      const valid = assessments.filter(
        (assessment) =>
          assessment.filingId === filing.id &&
          assessment.requirementId === match.requirementId &&
          conclusionValues.includes(assessment.conclusion) &&
          allowedQuestions.get(match.requirementId)?.has(assessment.question) &&
          assessment.comparatorCitationPages.length > 0 &&
          assessment.comparatorCitationPages.every((page) => allowedPages.has(page))
      )
      const completed = questions.map((question) => {
        const assessment = valid.find((candidate) => candidate.question === question)
        return assessment
          ? assessment
          : {
              filingId: filing.id,
              requirementId: match.requirementId,
              question,
              conclusion: "insufficient_information" as const,
              rationale:
                "No valid comparator judgment was returned for this question; the retrieved passage is retained for manual review but is not treated as transferable evidence.",
              transferableElements: [],
              limitations: ["Automated assessment was incomplete."],
              comparatorCitationPages: match.citations
                .slice(0, 1)
                .map((citation) => citation.pageNumber),
            }
      })
      return completed.length > 0
        ? {
            ...match,
            assessments: completed.map(
              ({
                question,
                conclusion,
                rationale,
                transferableElements,
                limitations,
                comparatorCitationPages,
              }) => ({
                question,
                conclusion,
                rationale,
                transferableElements,
                limitations,
                comparatorCitationPages,
              })
            ),
          }
        : match
    })
    return ComparableFilingSchema.parse({ ...filing, evidenceMatches })
  })
}

export function buildComparableAssessmentPrompt(
  subjectProfile: NoticeProfile,
  evidenceMatrix: EvidenceMatrixItem[],
  filings: ComparableFiling[]
) {
  return `Assess every unresolved question against every comparator that has a passage for the matching requirement. Return one assessment per question/comparator pair.

SUBJECT PROFILE
${JSON.stringify(subjectProfile)}

UNRESOLVED SUBJECT QUESTIONS
${JSON.stringify(
  evidenceMatrix.map((item) => ({
    requirementId: item.id,
    requirement: item.requirement,
    subjectStatus: item.status,
    subjectAssessment: item.assessment,
    subjectEvidenceSummary: item.evidenceSummary,
    unresolvedQuestions: item.unresolvedQuestions,
    subjectCitations: item.citations,
  }))
)}

COMPARATOR PASSAGES AND KNOWN DIFFERENCES
${JSON.stringify(
  filings.map((filing) => ({
    filingId: filing.id,
    name: filing.name,
    status: filing.status,
    similarityScore: filing.similarityScore,
    matchedCriteria: filing.matchCriteria,
    knownDifferences: filing.differences,
    evidenceMatches: filing.evidenceMatches
      ?.filter((match) => evidenceMatrix.some((item) => item.id === match.requirementId))
      .map((match) => ({
        requirementId: match.requirementId,
        citations: match.citations,
      })),
  }))
)}`
}
