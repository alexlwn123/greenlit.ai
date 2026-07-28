import type { DossierClaim, DossierSection } from "@greenlit/core"
import { afterEach, describe, expect, it, vi } from "vitest"
import { draftSectionFromVerifiedClaims, validateAssistedDraft } from "./assisted-drafting.js"

const verifiedClaim: DossierClaim = {
  id: "claim-1",
  dossierId: "dossier-1",
  ownerId: "owner-1",
  sectionId: "section-1",
  requirementId: "requirement-1",
  evidenceId: "evidence-1",
  statement: "The specification identifies the notified substance.",
  sourceExcerpt: "The notified substance meets the identity specification.",
  sourcePage: 4,
  status: "verified",
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
}

const section: DossierSection = {
  id: "section-1",
  dossierId: "dossier-1",
  ownerId: "owner-1",
  part: "2",
  title: "Identity",
  content: "",
  status: "draft",
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
}

afterEach(() => vi.unstubAllEnvs())

describe("validateAssistedDraft", () => {
  it("accepts paragraphs grounded in allowed verified claim markers", () => {
    expect(
      validateAssistedDraft(
        "# Part 2\n\nThe specification identifies the notified substance. [[claim:claim-1]]",
        [verifiedClaim]
      )
    ).toContain("[[claim:claim-1]]")
  })

  it("rejects invented claim markers", () => {
    expect(() =>
      validateAssistedDraft("An unsupported assertion. [[claim:invented]]", [verifiedClaim])
    ).toThrow(/unsupported claim markers/)
  })

  it("rejects substantive paragraphs without claim citations", () => {
    expect(() =>
      validateAssistedDraft(
        "Supported statement. [[claim:claim-1]]\n\nA second unsupported factual paragraph.",
        [verifiedClaim]
      )
    ).toThrow(/without verified claim citations/)
  })

  it("uses the deterministic private path when hosted external processing is not approved", async () => {
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("ANTHROPIC_API_KEY", "configured-but-not-approved")
    vi.stubEnv("GREENLIT_ALLOW_EXTERNAL_MODEL_PROCESSING", "")

    await expect(
      draftSectionFromVerifiedClaims({ section, claims: [verifiedClaim] })
    ).resolves.toMatchObject({
      provider: "deterministic",
      model: "verified-claim-template-v1",
    })
  })
})
