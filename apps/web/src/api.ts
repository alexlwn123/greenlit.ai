import type {
  AnalysisRecord,
  ConsultantHandoff,
  DossierAuditEvent,
  DossierClaim,
  DossierEvidence,
  DossierEvidencePassage,
  DossierIntake,
  DossierQualityCheck,
  DossierRecord,
  DossierRelease,
  DossierRequirement,
  DossierSection,
  DossierSectionVersion,
  EvidenceRequest,
  FactBookEntry,
  FilingDiffItem,
  ReleaseAttestation,
  WorkbookNote,
} from "@greenlit/core"
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

export async function listDossiers() {
  const response = await requestJson<{ dossiers: DossierRecord[] }>("/dossiers")
  return response.dossiers
}

export async function getDossier(dossierId: string) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}`)
}

export async function createDossier(intake: DossierIntake) {
  return requestJson<DossierWorkspace>("/dossiers", {
    body: JSON.stringify(intake),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export type DossierWorkspace = {
  dossier: DossierRecord
  requirements: DossierRequirement[]
  evidence: DossierEvidence[]
  sections: DossierSection[]
  claims: DossierClaim[]
  auditEvents: DossierAuditEvent[]
  evidenceRequests: EvidenceRequest[]
  attestations: ReleaseAttestation[]
  releases: DossierRelease[]
  handoffs: ConsultantHandoff[]
  factBookEntries: FactBookEntry[]
}

export async function createFactBookEntry(
  dossierId: string,
  input: Pick<FactBookEntry, "kind" | "title" | "fields" | "evidenceId">
) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/facts`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export async function reviewFactBookEntry(
  dossierId: string,
  factId: string,
  status: FactBookEntry["status"]
) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/facts/${factId}/review`, {
    body: JSON.stringify({ status }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export async function deleteFactBookEntry(dossierId: string, factId: string) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/facts/${factId}`, {
    method: "DELETE",
  })
}

export async function signReleaseAttestation(
  dossierId: string,
  input: Pick<ReleaseAttestation, "kind" | "signerName" | "signerRole">
) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/attestations`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export async function revokeReleaseAttestation(dossierId: string, attestationId: string) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/attestations/${attestationId}`, {
    method: "DELETE",
  })
}

export async function lockDossierRelease(dossierId: string) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/releases`, { method: "POST" })
}

export async function unlockDossierRelease(dossierId: string, releaseId: string) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/releases/${releaseId}/unlock`, {
    method: "POST",
  })
}

export async function createConsultantHandoff(
  dossierId: string,
  input: Pick<ConsultantHandoff, "consultantName" | "consultantEmail" | "scope" | "dueDate">
) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/handoffs`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export async function updateConsultantHandoff(
  dossierId: string,
  handoffId: string,
  status: ConsultantHandoff["status"],
  responseNote?: string
) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/handoffs/${handoffId}`, {
    body: JSON.stringify({ status, responseNote }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export async function createEvidenceRequest(dossierId: string, requirementId: string) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/requests`, {
    body: JSON.stringify({ requirementId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export async function updateEvidenceRequest(
  dossierId: string,
  requestId: string,
  status: EvidenceRequest["status"],
  responseNote?: string
) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/requests/${requestId}`, {
    body: JSON.stringify({ status, responseNote }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export async function uploadDossierEvidence(
  dossierId: string,
  file: File,
  requirementId: string,
  category: DossierEvidence["category"]
) {
  if (import.meta.env.PROD) {
    validatePdf(file)
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
        "x-greenlit-session": getSessionId(),
      },
      multipart: file.size > 5 * 1024 * 1024,
    })
    return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/evidence/from-upload`, {
      body: JSON.stringify({
        pathname: blob.pathname,
        fileName: file.name,
        requirementId,
        category,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
  }

  const body = new FormData()
  body.set("file", file)
  body.set("requirementId", requirementId)
  body.set("category", category)
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/evidence`, {
    body,
    method: "POST",
  })
}

export async function verifyDossierEvidence(
  dossierId: string,
  evidenceId: string,
  status: "verified" | "rejected"
) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/evidence/${evidenceId}/verify`, {
    body: JSON.stringify({ status }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export async function saveDossierSection(
  dossierId: string,
  sectionId: string,
  content: string,
  status: "draft" | "in_review" | "approved"
) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/sections/${sectionId}`, {
    body: JSON.stringify({ content, status }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export async function createSectionStarter(dossierId: string, sectionId: string) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/sections/${sectionId}/starter`, {
    method: "POST",
  })
}

export async function getSectionVersions(dossierId: string, sectionId: string) {
  const response = await requestJson<{ versions: DossierSectionVersion[] }>(
    `/dossiers/${dossierId}/sections/${sectionId}/versions`
  )
  return response.versions
}

export async function restoreSectionVersion(
  dossierId: string,
  sectionId: string,
  versionId: string
) {
  return requestJson<DossierWorkspace>(
    `/dossiers/${dossierId}/sections/${sectionId}/versions/${versionId}/restore`,
    { method: "POST" }
  )
}

export async function assistDossierSection(dossierId: string, sectionId: string) {
  return requestJson<{
    result: {
      draft: string
      provider: "anthropic" | "deterministic"
      model: string
      claimIds: string[]
    }
  }>(`/dossiers/${dossierId}/sections/${sectionId}/assist`, { method: "POST" })
}

export async function getDossierQuality(dossierId: string) {
  const response = await requestJson<{ checks: DossierQualityCheck[] }>(
    `/dossiers/${dossierId}/quality`
  )
  return response.checks
}

export async function getEvidencePassages(dossierId: string, evidenceId: string) {
  return requestJson<{ evidence: DossierEvidence; passages: DossierEvidencePassage[] }>(
    `/dossiers/${dossierId}/evidence/${evidenceId}/pages`
  )
}

export async function deleteDossierEvidence(dossierId: string, evidenceId: string) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/evidence/${evidenceId}`, {
    method: "DELETE",
  })
}

export async function downloadDossierExport(dossierId: string, substanceName: string) {
  const response = await fetch(`${apiBaseUrl}/dossiers/${dossierId}/export`, {
    headers: {
      ...(apiAuthToken ? { Authorization: `Bearer ${apiAuthToken}` } : {}),
      "x-greenlit-session": getSessionId(),
    },
  })
  if (!response.ok) throw new Error(await readError(response))
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${safeFileName(substanceName)}-working-dossier.md`
  link.click()
  URL.revokeObjectURL(url)
}

export async function downloadSubmissionPackage(dossierId: string, substanceName: string) {
  const response = await fetch(`${apiBaseUrl}/dossiers/${dossierId}/package`, {
    headers: {
      ...(apiAuthToken ? { Authorization: `Bearer ${apiAuthToken}` } : {}),
      "x-greenlit-session": getSessionId(),
    },
  })
  if (!response.ok) throw new Error(await readError(response))
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${safeFileName(substanceName)}-submission-package.zip`
  link.click()
  URL.revokeObjectURL(url)
}

export async function downloadFactBook(dossierId: string, substanceName: string) {
  const response = await fetch(`${apiBaseUrl}/dossiers/${dossierId}/facts/export`, {
    headers: {
      ...(apiAuthToken ? { Authorization: `Bearer ${apiAuthToken}` } : {}),
      "x-greenlit-session": getSessionId(),
    },
  })
  if (!response.ok) throw new Error(await readError(response))
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${safeFileName(substanceName)}-fact-book.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export async function createDossierClaim(
  dossierId: string,
  input: {
    evidenceId: string
    sectionId: string
    statement: string
    sourceExcerpt: string
    sourcePage: number
  }
) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/claims`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export async function reviewDossierClaim(
  dossierId: string,
  claimId: string,
  statement: string,
  status: "verified" | "rejected"
) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/claims/${claimId}/review`, {
    body: JSON.stringify({ statement, status }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
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
