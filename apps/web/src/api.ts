import type {
  AgencyQuestion,
  AnalysisRecord,
  ConsultantHandoff,
  ConsultantReviewIssue,
  ConsultantReviewLink,
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
  EvidenceRequestLink,
  FactBookEntry,
  FactBookRevision,
  FactExtractionRecord,
  FilingDiffItem,
  ReleaseAttestation,
  SubmissionRecord,
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

export type ModelProcessingStatus = {
  enabled: boolean
  provider: "disabled" | "anthropic" | "customer_gateway"
  boundary: "greenlit" | "provider_api" | "customer_cloud"
  externalProcessingApproved: boolean
  sanitization: "required"
  endpointHost?: string
}

export async function getModelProcessingStatus() {
  const response = await requestJson<{ modelProcessing: ModelProcessingStatus }>(
    "/privacy/model-processing"
  )
  return response.modelProcessing
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
  evidenceRequestLinks: EvidenceRequestLink[]
  attestations: ReleaseAttestation[]
  releases: DossierRelease[]
  handoffs: ConsultantHandoff[]
  reviewIssues: ConsultantReviewIssue[]
  reviewLinks: ConsultantReviewLink[]
  submissions: SubmissionRecord[]
  agencyQuestions: AgencyQuestion[]
  extractionCandidates: FactExtractionRecord[]
  factBookEntries: FactBookEntry[]
  factBookRevisions: FactBookRevision[]
}

export type FactImpact = {
  titleChanged: boolean
  changedFields: Array<{ field: string; before?: string; after?: string }>
  references: Array<{
    sectionId: string
    sectionPart: string
    sectionTitle: string
    sectionStatus: string
    field: string
    before?: string
    after?: string
  }>
  affectedSectionIds: string[]
}

export async function previewFactImpact(
  dossierId: string,
  factId: string,
  title: string,
  fields: Record<string, string>
) {
  return requestJson<{ impact: FactImpact }>(`/dossiers/${dossierId}/facts/${factId}/impact`, {
    body: JSON.stringify({ title, fields }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export async function updateFactBookEntry(
  dossierId: string,
  factId: string,
  title: string,
  fields: Record<string, string>,
  confirmImpacts: boolean
) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/facts/${factId}`, {
    body: JSON.stringify({ title, fields, confirmImpacts }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  })
}

export async function suggestEvidenceFacts(dossierId: string, evidenceId: string) {
  return requestJson<{ candidates: FactExtractionRecord[]; evidenceId: string }>(
    `/dossiers/${dossierId}/evidence/${evidenceId}/fact-suggestions`,
    { method: "POST" }
  )
}

export async function reviewExtractionCandidate(
  dossierId: string,
  candidateId: string,
  action: "accept" | "dismiss"
) {
  return requestJson<DossierWorkspace>(
    `/dossiers/${dossierId}/extraction-candidates/${candidateId}`,
    {
      body: JSON.stringify({ action }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  )
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

export async function createReviewIssue(
  dossierId: string,
  input: Pick<
    ConsultantReviewIssue,
    "handoffId" | "targetType" | "targetId" | "title" | "body" | "priority"
  >
) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/review-issues`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export async function createConsultantReviewLink(
  dossierId: string,
  handoffId: string,
  expiresInDays = 14
) {
  return requestJson<{ url: string; expiresAt: string }>(
    `/dossiers/${dossierId}/handoffs/${handoffId}/link`,
    {
      body: JSON.stringify({ expiresInDays }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  )
}

export type ExternalConsultantReview = {
  link: { status: ConsultantReviewLink["status"]; expiresAt: string }
  dossier: { id: string; name: string; substanceName: string }
  handoff: Pick<ConsultantHandoff, "id" | "consultantName" | "scope" | "dueDate" | "status">
  sections: Array<Pick<DossierSection, "id" | "part" | "title" | "content" | "status">>
  facts: Array<Pick<FactBookEntry, "id" | "title" | "kind" | "fields" | "status">>
  claims: Array<Pick<DossierClaim, "id" | "statement" | "sourceExcerpt" | "sourcePage" | "status">>
  evidence: Array<
    Pick<
      DossierEvidence,
      "id" | "title" | "category" | "excerpt" | "pageCount" | "verificationStatus"
    >
  >
  issues: Array<Omit<ConsultantReviewIssue, "ownerId">>
}

export function getExternalConsultantReview(token: string) {
  return publicRequestJson<ExternalConsultantReview>(`/review/${token}`)
}

export function submitExternalReviewIssue(
  token: string,
  input: Pick<ConsultantReviewIssue, "targetType" | "targetId" | "title" | "body" | "priority">
) {
  return publicRequestJson<ExternalConsultantReview>(`/review/${token}/issues`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export async function updateReviewIssue(
  dossierId: string,
  issueId: string,
  status: ConsultantReviewIssue["status"],
  resolutionNote?: string
) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/review-issues/${issueId}`, {
    body: JSON.stringify({ status, resolutionNote }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export async function createSubmission(
  dossierId: string,
  input: Pick<SubmissionRecord, "releaseId" | "agency" | "trackingNumber" | "status" | "targetDate">
) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/submissions`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export async function updateSubmission(
  dossierId: string,
  submissionId: string,
  input: Pick<SubmissionRecord, "status" | "trackingNumber" | "targetDate">
) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/submissions/${submissionId}`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export async function createAgencyQuestion(
  dossierId: string,
  submissionId: string,
  input: Pick<AgencyQuestion, "title" | "body" | "priority" | "dueDate">
) {
  return requestJson<DossierWorkspace>(
    `/dossiers/${dossierId}/submissions/${submissionId}/questions`,
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  )
}

export async function updateAgencyQuestion(
  dossierId: string,
  questionId: string,
  input: Pick<AgencyQuestion, "status" | "response" | "dueDate">
) {
  return requestJson<DossierWorkspace>(`/dossiers/${dossierId}/questions/${questionId}`, {
    body: JSON.stringify(input),
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

export async function createEvidenceRequestLink(
  dossierId: string,
  requestId: string,
  expiresInDays = 14
) {
  return requestJson<{ url: string; expiresAt: string }>(
    `/dossiers/${dossierId}/requests/${requestId}/link`,
    {
      body: JSON.stringify({ expiresInDays }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  )
}

export type ExternalEvidenceRequest = {
  link: { id: string; status: EvidenceRequestLink["status"]; expiresAt: string }
  request: Pick<
    EvidenceRequest,
    "id" | "requirementId" | "title" | "detail" | "priority" | "status"
  >
  dossier: { id: string; name: string; substanceName: string }
}

export function getExternalEvidenceRequest(token: string) {
  return publicRequestJson<ExternalEvidenceRequest>(`/respond/${token}`)
}

export function submitExternalEvidenceResponse(token: string, responseNote: string) {
  return publicRequestJson<{ received: boolean }>(`/respond/${token}`, {
    body: JSON.stringify({ responseNote }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

export function submitExternalEvidenceFile(
  token: string,
  file: File,
  responseNote: string,
  category: DossierEvidence["category"]
) {
  validatePdf(file)
  const body = new FormData()
  body.set("file", file)
  body.set("responseNote", responseNote)
  body.set("category", category)
  return publicRequestJson<{ received: boolean }>(`/respond/${token}/evidence`, {
    body,
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
      provider: "anthropic" | "customer_gateway" | "deterministic"
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
  const result = await requestJson<{ receipt: { receiptId: string } & Record<string, unknown> }>(
    `/analyses/${analysisId}`,
    {
      method: "DELETE",
    }
  )
  downloadJson(result.receipt, `greenlit-deletion-${safeFileName(result.receipt.receiptId)}.json`)
  return result.receipt
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

async function publicRequestJson<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, init)
  if (!response.ok) throw new Error(await readError(response))
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

function downloadJson(value: unknown, fileName: string) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
