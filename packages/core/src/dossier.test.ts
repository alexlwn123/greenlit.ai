import { describe, expect, it } from "vitest"
import {
  buildInitialDossierRequirements,
  buildInitialDossierSections,
  evaluateDossierQuality,
  suggestClaimsFromPassage,
  suggestDossierRequirement,
} from "./dossier.js"

describe("buildInitialDossierRequirements", () => {
  it("adds production-organism requirements for fermentation-derived substances", () => {
    const requirements = buildInitialDossierRequirements(
      "dossier-1",
      "owner-1",
      {
        substanceName: "Fermented protein",
        companyName: "Example",
        substanceType: "fermentation",
        intendedEffect: "Protein source",
        intendedUses: "Selected foods",
        manufacturingSummary: "Controlled fermentation",
        targetPopulation: "General U.S. population",
        grasBasis: "scientific_procedures",
      },
      "2026-07-26T00:00:00.000Z"
    )

    expect(requirements.map((item) => item.title)).toContain(
      "Production organism and genetic construction"
    )
    expect(requirements.every((item) => item.status === "missing")).toBe(true)
    expect(requirements.every((item) => item.dossierId === "dossier-1")).toBe(true)
  })

  it("adds source-hazard requirements for botanical substances", () => {
    const requirements = buildInitialDossierRequirements(
      "dossier-2",
      "owner-1",
      {
        substanceName: "Plant extract",
        companyName: "",
        substanceType: "botanical",
        intendedEffect: "",
        intendedUses: "",
        manufacturingSummary: "",
        targetPopulation: "General U.S. population",
        grasBasis: "scientific_procedures",
      },
      "2026-07-26T00:00:00.000Z"
    )

    expect(requirements.map((item) => item.title)).toContain("Allergenicity and source hazards")
  })

  it("blocks quality approval when evidence and draft sections are incomplete", () => {
    const requirements = buildInitialDossierRequirements(
      "dossier-3",
      "owner-1",
      {
        substanceName: "Ingredient",
        companyName: "",
        substanceType: "other",
        intendedEffect: "",
        intendedUses: "",
        manufacturingSummary: "",
        targetPopulation: "General U.S. population",
        grasBasis: "scientific_procedures",
      },
      "2026-07-26T00:00:00.000Z"
    )
    const checks = evaluateDossierQuality({
      requirements,
      evidence: [],
      sections: buildInitialDossierSections("dossier-3", "owner-1", "2026-07-26T00:00:00.000Z"),
    })

    expect(checks.find((check) => check.id === "evidence-coverage")?.severity).toBe("blocker")
    expect(checks.find((check) => check.id === "section-completeness")?.severity).toBe("blocker")
  })

  it("suggests a manufacturing requirement from process evidence", () => {
    const requirements = buildInitialDossierRequirements(
      "dossier-4",
      "owner-1",
      {
        substanceName: "Ingredient",
        companyName: "",
        substanceType: "other",
        intendedEffect: "",
        intendedUses: "",
        manufacturingSummary: "",
        targetPopulation: "General U.S. population",
        grasBasis: "scientific_procedures",
      },
      "2026-07-26T00:00:00.000Z"
    )
    expect(
      suggestDossierRequirement(
        "The manufacturing process uses filtration, purification, processing aids, and quality controls.",
        requirements
      )?.title
    ).toBe("Manufacturing process")
  })

  it("tracks release attestations as a named readiness control", () => {
    const sections = buildInitialDossierSections(
      "release-dossier",
      "owner-1",
      "2026-07-26T00:00:00.000Z"
    )
    const base = {
      id: "a",
      dossierId: "release-dossier",
      ownerId: "owner-1",
      signerName: "Reviewer",
      signerRole: "Regulatory lead",
      statement: "Reviewed",
      status: "signed" as const,
      signedAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:00.000Z",
    }
    const checks = evaluateDossierQuality({
      requirements: [],
      evidence: [],
      sections,
      attestations: [
        { ...base, id: "a1", kind: "scientific_accuracy" },
        { ...base, id: "a2", kind: "source_traceability" },
        { ...base, id: "a3", kind: "regulatory_completeness" },
        { ...base, id: "a4", kind: "final_authorization" },
      ],
    })
    expect(checks.find((check) => check.id === "release-attestations")?.severity).toBe("passed")
  })

  it("blocks incomplete structured use and specification records", () => {
    const checks = evaluateDossierQuality({
      requirements: [],
      evidence: [],
      sections: [],
      factBookEntries: [
        {
          id: "fact-1",
          dossierId: "d1",
          ownerId: "o1",
          kind: "intended_use",
          title: "Bars",
          fields: { foodCategory: "Nutrition bars" },
          status: "draft",
          createdAt: "2026-07-26T00:00:00.000Z",
          updatedAt: "2026-07-26T00:00:00.000Z",
        },
      ],
    })
    expect(checks.find((check) => check.id === "fact-book-completeness")?.severity).toBe("blocker")
    expect(checks.find((check) => check.id === "fact-book-verification")?.severity).toBe("warning")
  })

  it("ranks page sentences that match the mapped requirement", () => {
    const requirement = buildInitialDossierRequirements(
      "dossier-5",
      "owner-1",
      {
        substanceName: "Ingredient",
        companyName: "",
        substanceType: "other",
        intendedEffect: "",
        intendedUses: "",
        manufacturingSummary: "",
        targetPopulation: "General U.S. population",
        grasBasis: "scientific_procedures",
      },
      "2026-07-26T00:00:00.000Z"
    ).find((item) => item.title === "Specifications and batch analyses")
    expect(requirement).toBeDefined()
    if (!requirement) throw new Error("Expected specification requirement")
    const suggestions = suggestClaimsFromPassage(
      "General background information is included for context. Three representative lots meet the established food-grade specifications and analytical acceptance criteria.",
      requirement
    )
    expect(suggestions[0]).toContain("representative lots")
  })
})
