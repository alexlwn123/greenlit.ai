import type { AnalysisRecord, FilingDiffItem, WorkbookNote } from "@greenlit/core"
import { uploadPresigned } from "@vercel/blob/client"

const sessionStorageKey = "greenlit.localSessionId"
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api"
let apiAuthToken: string | null = null

export function setApiAuthToken(token: string | null) {
  apiAuthToken = token
}

export async function listAnalyses() {
  const response = await requestJson<{ analyses: AnalysisRecord[] }>("/analyses")
  return response.analyses
}

export async function getAnalysis(analysisId: string) {
  const response = await requestJson<{ analysis: AnalysisRecord }>(`/analyses/${analysisId}`)
  return response.analysis
}

export async function compareAnalyses(analysisId: string, baselineId: string) {
  return requestJson<{
    baseline: { id: string; filingName: string }
    revised: { id: string; filingName: string }
    filingDiff: FilingDiffItem[]
  }>(`/analyses/${analysisId}/compare/${baselineId}`)
}

export async function deleteAnalysis(analysisId: string) {
  await requestJson<void>(`/analyses/${analysisId}`, { method: "DELETE" })
}

export async function createAnalysis(file: File) {
  if (import.meta.env.PROD) {
    return createAnalysisFromDirectUpload(file)
  }

  const body = new FormData()
  body.set("file", file)

  const response = await requestJson<{ analysis: AnalysisRecord }>("/analyses", {
    body,
    method: "POST",
  })
  return response.analysis
}

async function createAnalysisFromDirectUpload(file: File) {
  validatePdf(file)
  const sessionId = getSessionId()
  const { pathname } = await requestJson<{ pathname: string }>("/uploads/path", {
    body: JSON.stringify({ fileName: safeFileName(file.name) }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const blob = await uploadPresigned(pathname, file, {
    access: "private",
    contentType: file.type || "application/pdf",
    handleUploadUrl: `${apiBaseUrl}/uploads`,
    headers: {
      ...(apiAuthToken ? { Authorization: `Bearer ${apiAuthToken}` } : {}),
      "x-greenlit-session": sessionId,
    },
    multipart: file.size > 5 * 1024 * 1024,
  })
  const response = await requestJson<{ analysis: AnalysisRecord }>("/analyses/from-upload", {
    body: JSON.stringify({
      fileName: file.name,
      pathname: blob.pathname,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  })

  return response.analysis
}

export async function waitForAnalysis(
  analysisId: string,
  onUpdate: (analysis: AnalysisRecord) => void
) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const analysis = await getAnalysis(analysisId)
    onUpdate(analysis)

    if (analysis.status === "complete" || analysis.status === "failed") {
      return analysis
    }

    await delay(500)
  }

  throw new Error("Analysis is still running. Reload history to check the saved result.")
}

export async function listNotes(analysisId: string) {
  const response = await requestJson<{ notes: WorkbookNote[] }>(`/analyses/${analysisId}/notes`)
  return response.notes
}

export async function createNote(analysisId: string, body: string) {
  const response = await requestJson<{ note: WorkbookNote }>(`/analyses/${analysisId}/notes`, {
    body: JSON.stringify({
      body,
      status: "open",
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  })
  return response.note
}

export async function downloadAnalysisFile(analysisId: string, kind: "outline" | "export") {
  const response = await fetch(`${apiBaseUrl}/analyses/${analysisId}/${kind}`, {
    headers: {
      ...(apiAuthToken ? { Authorization: `Bearer ${apiAuthToken}` } : {}),
      "x-greenlit-session": getSessionId(),
    },
  })

  if (!response.ok) {
    throw new Error(await readError(response))
  }

  const blob = await response.blob()
  const disposition = response.headers.get("Content-Disposition") ?? ""
  const fileName =
    disposition.match(/filename="(?<fileName>[^"]+)"/)?.groups?.fileName ?? `${kind}.md`
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function getSessionId() {
  const existing = window.localStorage.getItem(sessionStorageKey)
  if (existing) {
    return existing
  }

  const next =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`

  window.localStorage.setItem(sessionStorageKey, next)
  return next
}

async function requestJson<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      ...(apiAuthToken ? { Authorization: `Bearer ${apiAuthToken}` } : {}),
      "x-greenlit-session": getSessionId(),
    },
  })

  if (!response.ok) {
    const error = await readError(response)
    throw new Error(error)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string }
    return body.error ?? `Request failed with status ${response.status}`
  } catch {
    return `Request failed with status ${response.status}`
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function validatePdf(file: File) {
  if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) {
    throw new Error("Only PDF uploads are supported for the MVP.")
  }

  if (file.size <= 0) {
    throw new Error("The selected PDF is empty.")
  }

  if (file.size > 40 * 1024 * 1024) {
    throw new Error("The selected PDF is over the 40 MB MVP limit.")
  }
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "filing.pdf"
}
