import type { AnalysisRecord, WorkbookNote } from "@greenlit/core"

const sessionStorageKey = "greenlit.localSessionId"
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api"

export async function listAnalyses() {
  const response = await requestJson<{ analyses: AnalysisRecord[] }>("/analyses")
  return response.analyses
}

export async function getAnalysis(analysisId: string) {
  const response = await requestJson<{ analysis: AnalysisRecord }>(`/analyses/${analysisId}`)
  return response.analysis
}

export async function createAnalysis(file: File) {
  const body = new FormData()
  body.set("file", file)

  const response = await requestJson<{ analysis: AnalysisRecord }>("/analyses", {
    body,
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
      "x-greenlit-session": getSessionId(),
    },
  })

  if (!response.ok) {
    const error = await readError(response)
    throw new Error(error)
  }

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
