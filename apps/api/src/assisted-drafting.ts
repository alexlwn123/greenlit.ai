import type { DossierClaim, DossierSection } from "@greenlit/core"
import {
  externalModelProcessingAllowed,
  externalModelRequestError,
} from "./external-model-policy.js"

const defaultModel = "claude-sonnet-4-6"
const claimMarkerPattern = /\[\[claim:([^\]]+)\]\]/g
const anyClaimMarkerPattern = /\[\[claim:[^\]]+\]\]/

export type AssistedDraftResult = {
  draft: string
  provider: "anthropic" | "deterministic"
  model: string
  claimIds: string[]
}

export async function draftSectionFromVerifiedClaims(input: {
  section: DossierSection
  claims: DossierClaim[]
}): Promise<AssistedDraftResult> {
  const claims = input.claims.filter(
    (claim) => claim.sectionId === input.section.id && claim.status === "verified"
  )
  if (claims.length === 0)
    throw new Error("At least one verified claim is required for assisted drafting")

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || !externalModelProcessingAllowed()) {
    return {
      draft: validateAssistedDraft(deterministicDraft(input.section, claims), claims),
      provider: "deterministic",
      model: "verified-claim-template-v1",
      claimIds: claims.map((claim) => claim.id),
    }
  }

  const model = process.env.GREENLIT_ANTHROPIC_MODEL ?? defaultModel
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4_000,
      temperature: 0,
      system: `Draft one section of an FDA GRAS notice using only the supplied verified claims.

Hard constraints:
- Do not introduce facts, numerical values, studies, conclusions, or regulatory interpretations that are absent from the verified claims.
- Every substantive paragraph must end with one or more exact allowed claim markers in the form [[claim:ID]].
- Use only the supplied markers. Never invent or alter an ID.
- Do not state or imply that FDA has approved the substance or that the substance is GRAS.
- Do not add a safety conclusion, legal conclusion, or expert conclusion.
- Preserve uncertainty and qualified wording from the claims.
- Return draft prose only, without commentary, a bibliography, or markdown code fences.`,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            section: { part: input.section.part, title: input.section.title },
            verifiedClaims: claims.map((claim) => ({
              marker: `[[claim:${claim.id}]]`,
              statement: claim.statement,
              supportingExcerpt: claim.sourceExcerpt,
              sourcePage: claim.sourcePage,
            })),
          }),
        },
      ],
    }),
  })
  if (!response.ok) {
    throw externalModelRequestError("Assisted drafting", response.status)
  }
  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
  }
  const draft = payload.content?.find((item) => item.type === "text")?.text?.trim()
  if (!draft) throw new Error("Assisted drafting returned no text")
  return {
    draft: validateAssistedDraft(draft, claims),
    provider: "anthropic",
    model,
    claimIds: claims.map((claim) => claim.id),
  }
}

export function validateAssistedDraft(draft: string, claims: DossierClaim[]) {
  const allowed = new Set(
    claims.filter((claim) => claim.status === "verified").map((claim) => claim.id)
  )
  const used = [...draft.matchAll(claimMarkerPattern)].map((match) => match[1])
  const unknown = used.filter((id) => !allowed.has(id))
  if (unknown.length > 0) {
    throw new Error(
      `Assisted draft introduced unsupported claim markers: ${[...new Set(unknown)].join(", ")}`
    )
  }
  if (used.length === 0) throw new Error("Assisted draft contains no verified claim citations")

  const unsupportedParagraphs = draft
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !paragraph.startsWith("#"))
    .filter((paragraph) => /[A-Za-z]{3}/.test(paragraph) && !anyClaimMarkerPattern.test(paragraph))
  if (unsupportedParagraphs.length > 0) {
    throw new Error(
      "Assisted draft contains substantive paragraphs without verified claim citations"
    )
  }
  return draft.trim()
}

function deterministicDraft(section: DossierSection, claims: DossierClaim[]) {
  const paragraphs = claims.map((claim) => `${claim.statement.trim()} [[claim:${claim.id}]]`)
  return `# ${section.part}. ${section.title}\n\n${paragraphs.join("\n\n")}`
}
