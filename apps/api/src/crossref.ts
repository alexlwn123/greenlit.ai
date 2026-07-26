import type { ResearchReference } from "../../../packages/core/src/index.js"

type CrossrefWork = {
  DOI?: string
  URL?: string
  title?: string[]
  author?: Array<{ given?: string; family?: string }>
  published?: { "date-parts"?: number[][] }
}

type CrossrefResponse = {
  message?: CrossrefWork | { items?: CrossrefWork[] }
}

const responseCache = new Map<string, Promise<CrossrefResponse | undefined>>()

export async function verifyReferencesWithCrossref(
  references: ResearchReference[],
  options: {
    fetchImpl?: typeof fetch
    mailto?: string
    now?: () => string
  } = {}
) {
  const verified: ResearchReference[] = []
  for (const reference of references) {
    try {
      verified.push(await verifyReference(reference, options))
    } catch {
      verified.push(reference)
    }
  }
  return verified
}

async function verifyReference(
  reference: ResearchReference,
  options: {
    fetchImpl?: typeof fetch
    mailto?: string
    now?: () => string
  }
): Promise<ResearchReference> {
  const matchMethod = reference.doi?.trim() ? ("doi" as const) : ("title" as const)
  const works =
    matchMethod === "doi"
      ? await lookupDoi(reference.doi as string, options)
      : await searchTitle(reference.title, options)
  if (works.length === 0) {
    return reference
  }

  const work =
    matchMethod === "doi"
      ? works[0]
      : [...works].sort(
          (left, right) =>
            titleSimilarity(reference.title, titleOf(right)) -
            titleSimilarity(reference.title, titleOf(left))
        )[0]
  if (!work) {
    return reference
  }

  const confidence = titleSimilarity(reference.title, titleOf(work))
  if (matchMethod === "title" && confidence < 0.72) {
    return reference
  }

  const matchedTitle = titleOf(work)
  const matchedYear = yearOf(work)
  const matchedDoi = work.DOI ?? ""
  const conflicts: string[] = []

  if (matchedTitle && confidence < 0.9) {
    conflicts.push(`Title differs from Crossref metadata: ${matchedTitle}`)
  }
  if (reference.year && matchedYear && reference.year !== matchedYear) {
    conflicts.push(`Year differs: filing ${reference.year}; Crossref ${matchedYear}`)
  }
  if (reference.doi && matchedDoi && normalizeDoi(reference.doi) !== normalizeDoi(matchedDoi)) {
    conflicts.push(`DOI differs: filing ${reference.doi}; Crossref ${matchedDoi}`)
  }

  return {
    ...reference,
    verificationStatus: "metadata_verified",
    verification: {
      source: "crossref",
      checkedAt: options.now?.() ?? new Date().toISOString(),
      matchMethod,
      confidence,
      matchedTitle,
      matchedAuthors: (work.author ?? [])
        .map((author) => [author.given, author.family].filter(Boolean).join(" "))
        .filter(Boolean),
      matchedYear,
      matchedDoi,
      matchedUrl: work.URL ?? (matchedDoi ? `https://doi.org/${matchedDoi}` : ""),
      conflicts,
    },
  }
}

async function lookupDoi(
  doi: string,
  options: { fetchImpl?: typeof fetch; mailto?: string }
): Promise<CrossrefWork[]> {
  const url = crossrefUrl(`/works/${encodeURIComponent(normalizeDoi(doi))}`, options.mailto)
  const response = await crossrefRequest(url, options.fetchImpl)
  const message = response?.message
  return message && !isSearchMessage(message) ? [message] : []
}

async function searchTitle(
  title: string,
  options: { fetchImpl?: typeof fetch; mailto?: string }
): Promise<CrossrefWork[]> {
  const url = crossrefUrl("/works", options.mailto)
  url.searchParams.set("query.bibliographic", title)
  url.searchParams.set("rows", "3")
  url.searchParams.set("select", "DOI,title,author,published,URL")
  const response = await crossrefRequest(url, options.fetchImpl)
  const message = response?.message
  return message && isSearchMessage(message) ? (message.items ?? []) : []
}

function isSearchMessage(
  message: CrossrefWork | { items?: CrossrefWork[] }
): message is { items?: CrossrefWork[] } {
  return "items" in message
}

function crossrefUrl(path: string, mailto?: string) {
  const url = new URL(`https://api.crossref.org/v1${path}`)
  if (mailto) {
    url.searchParams.set("mailto", mailto)
  }
  return url
}

function crossrefRequest(url: URL, fetchImpl = fetch) {
  const key = url.toString()
  const cached = responseCache.get(key)
  if (cached) {
    return cached
  }
  const request = fetchWithBackoff(fetchImpl, url).then(async (response) => {
    if (!response?.ok) {
      return undefined
    }
    return (await response.json()) as CrossrefResponse
  })
  responseCache.set(key, request)
  return request
}

async function fetchWithBackoff(
  fetchImpl: typeof fetch,
  url: URL,
  attempt = 0
): Promise<Response | undefined> {
  try {
    const response = await fetchImpl(url, {
      headers: {
        "User-Agent": "GreenlitAI/0.1 (reference metadata verification)",
      },
    })
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
      return fetchWithBackoff(fetchImpl, url, attempt + 1)
    }
    return response
  } catch {
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
      return fetchWithBackoff(fetchImpl, url, attempt + 1)
    }
    return undefined
  }
}

function titleOf(work: CrossrefWork) {
  return work.title?.[0]?.trim() ?? ""
}

function yearOf(work: CrossrefWork) {
  const year = work.published?.["date-parts"]?.[0]?.[0]
  return year ? String(year) : ""
}

function titleSimilarity(left: string, right: string) {
  const leftTokens = tokens(left)
  const rightTokens = tokens(right)
  const union = new Set([...leftTokens, ...rightTokens])
  if (union.size === 0) return 0
  return [...leftTokens].filter((token) => rightTokens.has(token)).length / union.size
}

function tokens(value: string) {
  return new Set(
    value
      .normalize("NFKD")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 2)
  )
}

function normalizeDoi(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\/doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase()
}
