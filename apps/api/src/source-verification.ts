import type { ResearchReference } from "../../../packages/core/src/index.js"

type IdRecord = {
  doi?: string
  pmcid?: string
  pmid?: number
  live?: boolean | string
}

const requestCache = new Map<string, Promise<Response | undefined>>()

export async function verifyReferenceSources(
  references: ResearchReference[],
  options: {
    fetchImpl?: typeof fetch
    email?: string
    tool?: string
    now?: () => string
  } = {}
) {
  const verified: ResearchReference[] = []
  for (const reference of references) {
    try {
      verified.push(await verifySource(reference, options))
    } catch {
      verified.push(reference)
    }
  }
  return verified
}

async function verifySource(
  reference: ResearchReference,
  options: {
    fetchImpl?: typeof fetch
    email?: string
    tool?: string
    now?: () => string
  }
): Promise<ResearchReference> {
  const identifier = sourceIdentifier(reference)
  if (!identifier) return reference
  const record = await convertIdentifier(identifier, options)
  const checkedAt = options.now?.() ?? new Date().toISOString()

  if (record?.pmcid && record.live !== false && record.live !== "false") {
    const content = await fetchBioC("pmcoa", record.pmcid, options.fetchImpl)
    if (content) {
      return {
        ...reference,
        verificationStatus: "source_verified",
        sourceVerification: {
          source: "pmc_full_text",
          checkedAt,
          accessLevel: "full_text",
          identifier: record.pmcid,
          resolvedUrl: `https://pmc.ncbi.nlm.nih.gov/articles/${record.pmcid}/`,
          contentCharacterCount: content.length,
        },
      }
    }
  }

  if (record?.pmid) {
    const content = await fetchBioC("pubmed", String(record.pmid), options.fetchImpl)
    if (content) {
      return {
        ...reference,
        verificationStatus: "source_verified",
        sourceVerification: {
          source: "pubmed_abstract",
          checkedAt,
          accessLevel: "abstract",
          identifier: String(record.pmid),
          resolvedUrl: `https://pubmed.ncbi.nlm.nih.gov/${record.pmid}/`,
          contentCharacterCount: content.length,
        },
      }
    }
  }

  const doi = normalizedDoi(
    reference.verification?.matchedDoi || reference.doi || record?.doi || ""
  )
  if (!doi) return reference
  const response = await cachedFetch(`https://doi.org/${encodeURI(doi)}`, options.fetchImpl)
  if (!response?.ok) return reference
  return {
    ...reference,
    sourceVerification: {
      source: "doi_resolver",
      checkedAt,
      accessLevel: "landing_page",
      identifier: doi,
      resolvedUrl: response.url || `https://doi.org/${doi}`,
      contentCharacterCount: 0,
    },
  }
}

async function convertIdentifier(
  identifier: string,
  options: { fetchImpl?: typeof fetch; email?: string; tool?: string }
) {
  const url = new URL("https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/")
  url.searchParams.set("ids", identifier)
  url.searchParams.set("format", "json")
  url.searchParams.set("tool", options.tool ?? "greenlit_ai")
  if (options.email) url.searchParams.set("email", options.email)
  const response = await cachedFetch(url.toString(), options.fetchImpl)
  if (!response?.ok) return undefined
  const payload = (await response.json()) as { records?: IdRecord[] }
  return payload.records?.[0]
}

async function fetchBioC(kind: "pmcoa" | "pubmed", id: string, fetchImpl?: typeof fetch) {
  const url = `https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/${kind}.cgi/BioC_json/${encodeURIComponent(id)}/unicode`
  const response = await cachedFetch(url, fetchImpl)
  if (!response?.ok) return undefined
  const text = await response.text()
  if (text.trim().length < 20 || /not found|error/i.test(text.slice(0, 200))) return undefined
  return text
}

function cachedFetch(url: string, fetchImpl = fetch) {
  if (fetchImpl !== fetch) {
    return fetchImpl(url, {
      headers: { "User-Agent": "GreenlitAI/0.1 (research source verification)" },
      redirect: "follow",
    }).catch(() => undefined)
  }
  const cached = requestCache.get(url)
  if (cached) return cached.then((response) => response?.clone())
  const request = fetchImpl(url, {
    headers: { "User-Agent": "GreenlitAI/0.1 (research source verification)" },
    redirect: "follow",
  }).catch(() => undefined)
  requestCache.set(url, request)
  return request.then((response) => response?.clone())
}

function sourceIdentifier(reference: ResearchReference) {
  const doi = normalizedDoi(reference.verification?.matchedDoi || reference.doi || "")
  if (doi) return doi
  const pmid = `${reference.citation ?? ""} ${reference.evidence}`.match(
    /\bPMID\s*:?\s*(\d{4,10})\b/i
  )?.[1]
  return pmid ?? ""
}

function normalizedDoi(value: string) {
  const normalized = value
    .trim()
    .replace(/^https?:\/\/doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase()
  return /^10\.\d{4,9}\/[\w.()/:;-]+$/i.test(normalized) ? normalized : ""
}
