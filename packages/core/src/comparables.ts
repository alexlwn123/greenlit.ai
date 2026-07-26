import { z } from "zod"
import type { ComparableFiling } from "./report.js"

export const NoticeProfileSchema = z.object({
  grnNumber: z.number().int().positive().optional(),
  substanceName: z.string(),
  notifier: z.string().optional(),
  status: z.string().optional(),
  substanceType: z.string(),
  productionMethod: z.string(),
  sourceOrganismType: z.string().optional(),
  sourceOrganismName: z.string().optional(),
  intendedUses: z.array(z.string()),
  targetPopulation: z.string(),
  grasBasis: z.string(),
  safetyDataAvailable: z.array(z.string()),
  dietaryExposureMethod: z.string().optional(),
  sourceUrl: z.string().optional(),
  localPdfPath: z.string().optional(),
})

export type NoticeProfile = z.infer<typeof NoticeProfileSchema>

export function rankComparableFilings(
  subjectInput: NoticeProfile,
  candidatesInput: NoticeProfile[],
  limit = 5
): ComparableFiling[] {
  const subject = NoticeProfileSchema.parse(subjectInput)
  const candidates = candidatesInput.map((candidate) => NoticeProfileSchema.parse(candidate))

  return candidates
    .filter((candidate) => candidate.grnNumber !== subject.grnNumber)
    .map((candidate) => scoreCandidate(subject, candidate))
    .sort(
      (left, right) =>
        (right.similarityScore ?? 0) - (left.similarityScore ?? 0) ||
        (right.grnNumber ?? 0) - (left.grnNumber ?? 0)
    )
    .slice(0, limit)
}

function scoreCandidate(subject: NoticeProfile, candidate: NoticeProfile): ComparableFiling {
  let earned = 0
  let available = 0
  const matchCriteria: string[] = []
  const differences: string[] = []

  ;[
    ["substance type", subject.substanceType, candidate.substanceType, 4],
    ["production method", subject.productionMethod, candidate.productionMethod, 4],
    ["source-organism type", subject.sourceOrganismType, candidate.sourceOrganismType, 2],
    ["target population", subject.targetPopulation, candidate.targetPopulation, 1],
    ["GRAS basis", subject.grasBasis, candidate.grasBasis, 1],
    ["dietary-exposure method", subject.dietaryExposureMethod, candidate.dietaryExposureMethod, 1],
  ].forEach(([label, subjectValue, candidateValue, weight]) => {
    if (typeof subjectValue !== "string" || typeof candidateValue !== "string") {
      return
    }
    available += weight as number
    if (normalize(subjectValue) === normalize(candidateValue)) {
      earned += weight as number
      matchCriteria.push(`${label}: ${subjectValue}`)
    } else {
      differences.push(`${label}: ${subjectValue} vs ${candidateValue}`)
    }
  })

  const useSimilarity = jaccard(subject.intendedUses, candidate.intendedUses)
  const safetySimilarity = jaccard(subject.safetyDataAvailable, candidate.safetyDataAvailable)
  available += 5
  earned += useSimilarity * 3 + safetySimilarity * 2

  const subjectFamily = ingredientFamily(subject)
  const candidateFamily = ingredientFamily(candidate)
  if (subjectFamily) {
    available += 6
    if (candidateFamily === subjectFamily) {
      earned += 6
      matchCriteria.push(`ingredient family: ${subjectFamily}`)
    } else {
      differences.push(
        `ingredient family: ${subjectFamily} vs ${candidateFamily ?? "not identified"}`
      )
    }
  }

  if (useSimilarity === 1) {
    matchCriteria.push("intended-use overlap: 100%")
  } else if (useSimilarity > 0) {
    matchCriteria.push(`intended-use overlap: ${Math.round(useSimilarity * 100)}%`)
    differences.push(`intended-use overlap is partial (${Math.round(useSimilarity * 100)}%)`)
  } else {
    differences.push("no normalized intended-use overlap")
  }
  if (safetySimilarity === 1) {
    matchCriteria.push("safety-evidence overlap: 100%")
  } else if (safetySimilarity > 0) {
    matchCriteria.push(`safety-evidence overlap: ${Math.round(safetySimilarity * 100)}%`)
    differences.push(`safety-evidence overlap is partial (${Math.round(safetySimilarity * 100)}%)`)
  } else {
    differences.push("no normalized safety-evidence overlap")
  }

  const similarityScore = available > 0 ? Number((earned / available).toFixed(3)) : 0
  return {
    id: candidate.grnNumber ? `grn-${candidate.grnNumber}` : slug(candidate.substanceName),
    name: candidate.grnNumber
      ? `GRN ${candidate.grnNumber} — ${candidate.substanceName}`
      : candidate.substanceName,
    status: candidate.status ?? "unknown",
    rationale:
      matchCriteria.length > 0
        ? `Selected using ${matchCriteria.join("; ")}.`
        : "No strong metadata match was identified.",
    sharedSignals: matchCriteria,
    differences,
    grnNumber: candidate.grnNumber,
    sourceUrl: candidate.sourceUrl,
    similarityScore,
    matchCriteria,
  }
}

function jaccard(left: string[], right: string[]) {
  const leftSet = new Set(left.map(normalize))
  const rightSet = new Set(right.map(normalize))
  const union = new Set([...leftSet, ...rightSet])
  if (union.size === 0) {
    return 1
  }
  const intersection = [...leftSet].filter((value) => rightSet.has(value))
  return intersection.length / union.size
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_|_$/g, "")
}

function slug(value: string) {
  return normalize(value).replaceAll("_", "-")
}

function ingredientFamily(profile: NoticeProfile) {
  const text = normalize(
    [profile.substanceName, profile.sourceOrganismName].filter(Boolean).join(" ")
  )
  const families: Record<string, string[]> = {
    duckweed: ["duckweed", "lemna", "lemnoideae", "wolffia", "spirodela"],
    fava_bean: ["fava", "vicia_faba"],
    pea: ["pea", "pisum_sativum"],
    potato: ["potato", "solanum_tuberosum"],
    whey: ["whey", "lactoglobulin", "milk_protein"],
  }

  return Object.entries(families).find(([, terms]) =>
    terms.some((term) => text.includes(term))
  )?.[0]
}
