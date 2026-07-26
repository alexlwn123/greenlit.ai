import { readFile } from "node:fs/promises"
import type {
  ComparableFiling,
  EvidenceMatrixItem,
  NoticeProfile,
} from "../../../packages/core/src/index.js"
import { type ExtractedPdfPage, extractPdfText } from "./pdf.js"

const pdfCache = new Map<string, Promise<ExtractedPdfPage[]>>()

const requirementTerms: Record<string, string[]> = {
  "identity-composition": [
    "identity",
    "composition",
    "specification",
    "protein",
    "source organism",
    "batch",
  ],
  manufacturing: [
    "manufacturing process",
    "method of manufacture",
    "filtration",
    "processing",
    "quality control",
    "preventive controls",
  ],
  "specifications-batch-analysis": [
    "specifications",
    "batch analysis",
    "lot",
    "heavy metals",
    "microbiological",
    "certificate of analysis",
  ],
  "intended-uses-exposure": [
    "intended use",
    "use level",
    "dietary exposure",
    "estimated daily intake",
    "nhanes",
    "wweia",
  ],
  "public-pivotal-safety-evidence": [
    "90-day",
    "subchronic",
    "toxicology",
    "peer-reviewed",
    "published",
    "noael",
  ],
  "independent-evidence-synthesis": [
    "independent conclusion",
    "weight of evidence",
    "totality of evidence",
    "gras panel",
    "expert panel",
    "generally recognized",
  ],
  "test-article-comparability": [
    "test article",
    "read-across",
    "substantial equivalence",
    "comparable",
    "composition",
    "extrapolat",
  ],
  "self-contained-literature-search": [
    "literature search",
    "search strategy",
    "pubmed",
    "search terms",
    "unfavorable",
    "updated search",
  ],
  "allergenicity-assessment": [
    "allergenicity",
    "allergen",
    "pepsin",
    "bioinformatic",
    "sequence homology",
    "cross-reactivity",
  ],
}

export async function enrichComparableEvidence({
  filings,
  profiles,
  evidenceMatrix,
  maxFilings = 3,
}: {
  filings: ComparableFiling[]
  profiles: NoticeProfile[]
  evidenceMatrix: EvidenceMatrixItem[]
  maxFilings?: number
}) {
  const profileByGrn = new Map(
    profiles
      .filter((profile) => profile.grnNumber)
      .map((profile) => [profile.grnNumber as number, profile])
  )

  return Promise.all(
    filings.map(async (filing, index) => {
      if (index >= maxFilings || !filing.grnNumber) {
        return filing
      }
      const profile = profileByGrn.get(filing.grnNumber)
      if (!profile?.localPdfPath) {
        return filing
      }
      try {
        const pages = await loadPdfPages(profile.localPdfPath)
        return {
          ...filing,
          evidenceMatches: evidenceMatrix.flatMap((item) => {
            const matches = retrieveRequirementEvidence(pages, item)
            return matches.length > 0
              ? [
                  {
                    requirementId: item.id,
                    requirement: item.requirement,
                    relevanceScore: matches[0]?.score ?? 0,
                    rationale: `Matched comparator passages using the ${item.requirement.toLowerCase()} evidence requirement.`,
                    citations: matches.map(({ pageNumber, excerpt, section }) => ({
                      pageNumber,
                      excerpt,
                      section,
                    })),
                  },
                ]
              : []
          }),
        }
      } catch {
        return filing
      }
    })
  )
}

export function retrieveRequirementEvidence(
  pages: ExtractedPdfPage[],
  requirement: Pick<EvidenceMatrixItem, "id" | "requirement">,
  limit = 2
) {
  const terms = requirementTerms[requirement.id] ?? tokenize(requirement.requirement)
  return pages
    .map((page) => scorePage(page, terms))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.pageNumber - right.pageNumber)
    .slice(0, limit)
}

async function loadPdfPages(pdfPath: string) {
  const cached = pdfCache.get(pdfPath)
  if (cached) return cached
  const extraction = readFile(pdfPath).then(async (bytes) => {
    const extracted = await extractPdfText(new Uint8Array(bytes))
    return extracted.pages
  })
  pdfCache.set(pdfPath, extraction)
  return extraction
}

function scorePage(page: ExtractedPdfPage, terms: string[]) {
  const normalized = page.text.toLowerCase()
  const matched = terms.filter((term) => normalized.includes(term))
  const occurrenceScore = matched.reduce(
    (total, term) => total + Math.min(3, normalized.split(term).length - 1),
    0
  )
  const contentFactor = looksLikeNavigationPage(page.text) ? 0.1 : 1
  const score = Math.min(1, occurrenceScore / Math.max(4, terms.length)) * contentFactor
  return {
    pageNumber: page.pageNumber,
    excerpt: excerptAroundTerms(page.text, matched),
    section: sectionLabel(page.text),
    score: Number(score.toFixed(3)),
  }
}

function excerptAroundTerms(text: string, matchedTerms: string[]) {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  const lower = normalized.toLowerCase()
  const positions = matchedTerms
    .map((term) => lower.indexOf(term))
    .filter((position) => position >= 0)
  const center = positions.length > 0 ? Math.min(...positions) : 0
  const start = Math.max(0, center - 180)
  const end = Math.min(normalized.length, center + 420)
  return `${start > 0 ? "…" : ""}${normalized.slice(start, end).trim()}${
    end < normalized.length ? "…" : ""
  }`
}

function sectionLabel(text: string) {
  const heading = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^(part|section|appendix)\s+[0-9a-z]/i.test(line))
  return heading?.slice(0, 120)
}

function looksLikeNavigationPage(text: string) {
  const normalized = text.toLowerCase()
  const dottedLeaders = (text.match(/\.{4,}/g) ?? []).length
  const numberedEntries = (text.match(/\b\d+(?:\.\d+)*\.?\s+[A-Z][^\n]{8,}/g) ?? []).length
  return normalized.includes("table of contents") || dottedLeaders >= 4 || numberedEntries >= 10
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 4)
}
