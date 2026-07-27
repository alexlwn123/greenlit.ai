import type { DossierClaim } from "@greenlit/core"
import { describe, expect, it } from "vitest"
import { validateAssistedDraft } from "./assisted-drafting.js"

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
})
