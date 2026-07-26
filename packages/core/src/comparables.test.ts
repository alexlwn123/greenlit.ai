import { describe, expect, it } from "vitest"
import { type NoticeProfile, rankComparableFilings } from "./comparables.js"

const subject: NoticeProfile = {
  grnNumber: 1256,
  substanceName: "Lemna leaf protein",
  substanceType: "botanical_extract",
  productionMethod: "extraction",
  sourceOrganismType: "plant",
  intendedUses: ["protein_products", "bakery"],
  targetPopulation: "general_population",
  grasBasis: "scientific_procedures",
  safetyDataAvailable: ["subchronic_toxicity", "genotoxicity", "allergenicity"],
  dietaryExposureMethod: "WWEIA",
}

describe("rankComparableFilings", () => {
  it("ranks transparent metadata matches ahead of broad category matches", () => {
    const results = rankComparableFilings(subject, [
      {
        grnNumber: 742,
        substanceName: "Lemna protein concentrate",
        status: "no_questions",
        substanceType: "botanical_extract",
        productionMethod: "extraction",
        sourceOrganismType: "plant",
        intendedUses: ["protein_products", "bakery"],
        targetPopulation: "general_population",
        grasBasis: "scientific_procedures",
        safetyDataAvailable: ["subchronic_toxicity", "genotoxicity", "allergenicity"],
        dietaryExposureMethod: "WWEIA",
      },
      {
        grnNumber: 900,
        substanceName: "Unrelated fermented ingredient",
        status: "no_questions",
        substanceType: "botanical_extract",
        productionMethod: "submerged_fermentation",
        sourceOrganismType: "fungal",
        intendedUses: ["general_food"],
        targetPopulation: "general_population",
        grasBasis: "scientific_procedures",
        safetyDataAvailable: ["history_of_safe_use"],
        dietaryExposureMethod: "theoretical_maximum",
      },
    ])

    expect(results[0]).toMatchObject({
      grnNumber: 742,
      similarityScore: 1,
    })
    expect(results[1]?.differences).toContain(
      "production method: extraction vs submerged_fermentation"
    )
  })

  it("excludes the subject filing and applies the requested limit", () => {
    const results = rankComparableFilings(
      subject,
      [
        subject,
        { ...subject, grnNumber: 742, substanceName: "Comparator one" },
        { ...subject, grnNumber: 1000, substanceName: "Comparator two" },
      ],
      1
    )

    expect(results).toHaveLength(1)
    expect(results[0]?.grnNumber).not.toBe(1256)
  })
})
