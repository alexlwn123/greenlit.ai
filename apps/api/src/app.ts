import { createHash, randomUUID } from "node:crypto"
import path from "node:path"
import { head, issueSignedToken, presignUrl } from "@vercel/blob"
import type { HandleUploadPresignedBody } from "@vercel/blob/client"
import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import { type Context, Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { cors } from "hono/cors"
import { secureHeaders } from "hono/secure-headers"
import {
  type AgencyQuestion,
  type AnalysisRecord,
  type ArtifactReference,
  analyzeFactImpact,
  applyDeepAnalysis,
  buildInitialDossierRequirements,
  buildInitialDossierSections,
  type ComparableAction,
  type ConsultantHandoff,
  type ConsultantReviewIssue,
  type ConsultantReviewLink,
  compareEvidenceMatrices,
  createMinimumReadinessReport,
  type DossierClaim,
  type DossierEvidence,
  DossierIntakeSchema,
  type DossierRecord,
  type DossierRelease,
  type DossierRequirement,
  type DossierSection,
  type EvidenceRequest,
  type EvidenceRequestLink,
  evaluateDossierQuality,
  type FactBookEntry,
  type FactBookRevision,
  type FactExtractionRecord,
  mergeComparableActionsIntoOutline,
  type NoticeProfile,
  type ReadinessReport,
  ReadinessReportSchema,
  type ReleaseAttestation,
  type ResearchReference,
  rankComparableFilings,
  renderFactReferences,
  type SubmissionRecord,
  suggestDossierRequirement,
  suggestFactsFromPassages,
  type WorkbookNote,
} from "../../../packages/core/src/index.js"
import { draftSectionFromVerifiedClaims } from "./assisted-drafting.js"
import { getBlobAuthOptions, hasBlobConfiguration } from "./blob-auth.js"
import {
  type ComparableActionSynthesizer,
  synthesizeComparableActionsWithAnthropic,
} from "./comparable-actions.js"
import {
  assessComparableEvidenceWithAnthropic,
  type ComparableAssessor,
} from "./comparable-assessment.js"
import { enrichComparableEvidence } from "./comparable-evidence.js"
import { assessAndSynthesizeComparablesWithAnthropic } from "./comparable-pipeline.js"
import { loadConfiguredCorpus } from "./corpus.js"
import { verifyReferencesWithCrossref } from "./crossref.js"
import { analyzeNoticeWithAnthropic, type DeepAnalyzer } from "./deep-analysis.js"
import { modelProcessingStatus } from "./model-gateway.js"
import { extractPdfText } from "./pdf.js"
import { recordSecurityEvent } from "./security-telemetry.js"
import { verifyReferenceSources } from "./source-verification.js"
import { createConfiguredStorage, defaultDataDir } from "./storage.js"
import { inspectPdfUpload } from "./upload-security.js"

type CreateAppOptions = {
  analysisMode?: "minimum" | "deep"
  dataDir?: string
  deepAnalyzer?: DeepAnalyzer
  comparableCorpus?: NoticeProfile[]
  comparableAssessor?: ComparableAssessor
  comparableActionSynthesizer?: ComparableActionSynthesizer
  referenceVerifier?: (references: ResearchReference[]) => Promise<ResearchReference[]>
  resolveAuthenticatedOwner?: (token: string) => Promise<string | null>
  runAnalysisInline?: boolean
  resolveUploadedArtifact?: (
    ownerId: string,
    pathname: string,
    fileName: string
  ) => Promise<ArtifactReference>
}

const maxUploadBytes = 40 * 1024 * 1024
const maxRequestBytes = maxUploadBytes + 1024 * 1024
const maxJsonBytes = 256 * 1024
const publicReadLimit = 120
const publicWriteLimit = 20
const publicRateLimitWindowMs = 15 * 60 * 1000
export const maxPdfPages = 500

export function createApp(options: CreateAppOptions = {}) {
  const dataDir = options.dataDir ?? process.env.GREENLIT_LOCAL_DATA_DIR ?? defaultDataDir()
  const app = new Hono()
  const publicRequestCounts = new Map<string, { count: number; resetAt: number }>()

  app.use("/api/*", secureHeaders())
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: maxRequestBytes,
      onError: (context) => context.json({ error: "Request body is too large." }, 413),
    })
  )
  app.use("/api/*", async (context, next) => {
    const contentType = context.req.header("content-type")?.toLowerCase() ?? ""
    const contentLength = Number(context.req.header("content-length") ?? 0)
    if (
      contentType.includes("application/json") &&
      Number.isFinite(contentLength) &&
      contentLength > maxJsonBytes
    ) {
      return context.json({ error: "JSON request body is too large." }, 413)
    }
    await next()
  })
  app.use("/api/respond/*", publicLinkRateLimit(publicRequestCounts))
  app.use("/api/review/*", publicLinkRateLimit(publicRequestCounts))
  app.use("/api/*", async (context, next) => {
    await next()
    context.header("Cache-Control", "no-store")
    context.header("Pragma", "no-cache")
    context.header("Referrer-Policy", "no-referrer")
  })

  app.onError((error, context) => {
    if (error.message === "Not authenticated") {
      recordSecurityEvent("authentication_denied", {
        method: context.req.method,
        route: redactedRequestPath(context.req.url),
        status: 401,
      })
      return context.json({ error: "Not authenticated" }, 401)
    }
    recordSecurityEvent("unexpected_request_failure", {
      method: context.req.method,
      route: redactedRequestPath(context.req.url),
      status: 500,
    })
    console.error("Unhandled API request failure", {
      method: context.req.method,
      path: redactedRequestPath(context.req.url),
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return context.json({ error: "The request could not be completed." }, 500)
  })

  app.use(
    "/api/*",
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      allowHeaders: ["Authorization", "Content-Type", "x-greenlit-session"],
      allowMethods: ["DELETE", "GET", "POST", "PUT", "OPTIONS"],
    })
  )

  app.get("/api/health", (context) =>
    context.json({
      ok: true,
      service: "greenlit-local-api",
    })
  )

  app.get("/api/privacy/model-processing", async (context) => {
    await requestScope(context)
    return context.json({ modelProcessing: modelProcessingStatus() })
  })

  app.post("/api/uploads", async (context) => {
    const { ownerId } = await requestScope(context)
    if (!hasBlobConfiguration()) {
      return context.json({ error: "Blob storage is not configured." }, 503)
    }

    const body = (await context.req.json()) as HandleUploadPresignedBody
    if (body.type !== "blob.generate-presigned-url") {
      return context.json({ error: "Unsupported upload event." }, 400)
    }

    const { pathname } = body.payload
    const expectedPrefix = uploadPathPrefix(ownerId)

    if (!pathname.startsWith(expectedPrefix) || !pathname.toLowerCase().endsWith(".pdf")) {
      return context.json({ error: "Invalid upload pathname." }, 400)
    }

    const token = await issueSignedToken({
      ...getBlobAuthOptions(),
      allowedContentTypes: ["application/pdf"],
      maximumSizeInBytes: maxUploadBytes,
      operations: ["put"],
      pathname,
    })
    const presignedUrlPayload = await presignUrl(token, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      allowedContentTypes: ["application/pdf"],
      maximumSizeInBytes: maxUploadBytes,
      operation: "put",
      pathname,
    })

    return context.json({ type: body.type, presignedUrlPayload })
  })

  app.post("/api/uploads/path", async (context) => {
    const { ownerId } = await requestScope(context)
    const body = (await context.req.json()) as { fileName?: string }
    const fileName = safeUploadFileName(body.fileName ?? "filing.pdf")
    return context.json({ pathname: `${uploadPathPrefix(ownerId)}${randomUUID()}-${fileName}` })
  })

  app.get("/api/analyses", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const analyses = await storage.listAnalyses(ownerId)
    return context.json({ analyses })
  })

  app.get("/api/dossiers", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    return context.json({ dossiers: await storage.listDossiers(ownerId) })
  })

  app.get("/api/dossiers/:id", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const result = await storage.getDossier(ownerId, context.req.param("id"))
    if (!result) return context.json({ error: "Dossier not found" }, 404)
    return context.json(result)
  })

  app.delete("/api/dossiers/:id", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const deleted = await storage.deleteDossier(ownerId, context.req.param("id"))
    return deleted ? context.body(null, 204) : context.json({ error: "Dossier not found" }, 404)
  })

  app.post("/api/dossiers", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const parsed = DossierIntakeSchema.safeParse(await context.req.json())
    if (!parsed.success) {
      return context.json({ error: "Complete the required dossier intake fields." }, 400)
    }
    const id = randomUUID()
    const now = new Date().toISOString()
    const requirements = buildInitialDossierRequirements(id, ownerId, parsed.data, now)
    const sections = buildInitialDossierSections(id, ownerId, now)
    const result = await storage.createDossier({
      ownerId,
      id,
      name: `${parsed.data.substanceName} GRAS Notice`,
      intake: parsed.data,
      requirements,
      sections,
    })
    return context.json(result, 201)
  })

  app.post("/api/dossiers/:id/evidence", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json({ error: "Unlock the controlled release before changing evidence." }, 423)
    const body = await context.req.parseBody()
    const uploadError = validateUpload(body.file)
    if (uploadError) return context.json({ error: uploadError }, 400)
    const requirementId = String(body.requirementId ?? "")
    if (
      requirementId !== "auto" &&
      !dossier.requirements.some((item) => item.id === requirementId)
    ) {
      return context.json({ error: "Choose a valid dossier requirement." }, 400)
    }
    const file = body.file as File
    const bytes = new Uint8Array(await file.arrayBuffer())
    const inspectionError = uploadInspectionError(bytes)
    if (inspectionError) {
      recordUploadRejection(context)
      return context.json({ error: inspectionError }, 400)
    }
    const artifact = await storage.createArtifact({
      bytes,
      fileName: file.name,
      mimeType: file.type || "application/pdf",
    })
    await createEvidenceRecord(storage, {
      ownerId,
      dossierId: dossier.dossier.id,
      requirementId,
      category: evidenceCategory(body.category),
      title: file.name,
      artifact,
      bytes,
      requirements: dossier.requirements,
    })
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id), 201)
  })

  app.post("/api/dossiers/:id/evidence/from-upload", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json({ error: "Unlock the controlled release before changing evidence." }, 423)
    const body = (await context.req.json()) as {
      pathname?: string
      fileName?: string
      requirementId?: string
      category?: string
    }
    const pathname = body.pathname?.trim()
    const fileName = body.fileName?.trim()
    const requirementId = body.requirementId?.trim() ?? ""
    if (!pathname || !fileName || !pathname.startsWith(uploadPathPrefix(ownerId))) {
      return context.json({ error: "Uploaded evidence metadata is invalid." }, 400)
    }
    if (
      requirementId !== "auto" &&
      !dossier.requirements.some((item) => item.id === requirementId)
    ) {
      return context.json({ error: "Choose a valid dossier requirement." }, 400)
    }
    const artifact = await (options.resolveUploadedArtifact ?? resolveVercelBlobArtifact)(
      ownerId,
      pathname,
      fileName
    )
    const bytes = await storage.readArtifact(artifact)
    const inspectionError = uploadInspectionError(bytes)
    if (inspectionError) {
      recordUploadRejection(context)
      return context.json({ error: inspectionError }, 400)
    }
    await createEvidenceRecord(storage, {
      ownerId,
      dossierId: dossier.dossier.id,
      requirementId,
      category: evidenceCategory(body.category),
      title: fileName,
      artifact,
      bytes,
      requirements: dossier.requirements,
    })
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id), 201)
  })

  app.post("/api/dossiers/:id/evidence/:evidenceId/verify", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json(
        { error: "Unlock the controlled release before reviewing evidence." },
        423
      )
    const body = (await context.req.json()) as { status?: string }
    await storage.verifyDossierEvidence(
      ownerId,
      context.req.param("evidenceId"),
      body.status === "rejected" ? "rejected" : "verified"
    )
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.post("/api/dossiers/:id/claims", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json({ error: "Unlock the controlled release before changing claims." }, 423)
    const body = (await context.req.json()) as {
      evidenceId?: string
      sectionId?: string
      statement?: string
      sourceExcerpt?: string
      sourcePage?: number
    }
    const evidence = dossier.evidence.find((item) => item.id === body.evidenceId)
    const section = dossier.sections.find((item) => item.id === body.sectionId)
    const statement = body.statement?.trim()
    const sourceExcerpt = body.sourceExcerpt?.trim()
    if (evidence?.verificationStatus !== "verified" || !section) {
      return context.json({ error: "Claims require verified evidence and a valid section." }, 400)
    }
    if (!statement || !sourceExcerpt) {
      return context.json(
        { error: "Claim text and an exact supporting excerpt are required." },
        400
      )
    }
    const now = new Date().toISOString()
    const claim: DossierClaim = {
      id: randomUUID(),
      dossierId: dossier.dossier.id,
      ownerId,
      sectionId: section.id,
      requirementId: evidence.requirementId,
      evidenceId: evidence.id,
      statement,
      sourceExcerpt,
      sourcePage:
        typeof body.sourcePage === "number" && body.sourcePage > 0
          ? Math.floor(body.sourcePage)
          : 1,
      status: "proposed",
      createdAt: now,
      updatedAt: now,
    }
    await storage.createDossierClaim(claim)
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id), 201)
  })

  app.post("/api/dossiers/:id/claims/:claimId/review", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json({ error: "Unlock the controlled release before reviewing claims." }, 423)
    const body = (await context.req.json()) as { statement?: string; status?: string }
    const statement = body.statement?.trim()
    if (!statement) return context.json({ error: "Claim text is required." }, 400)
    await storage.reviewDossierClaim(
      ownerId,
      context.req.param("claimId"),
      statement,
      body.status === "rejected" ? "rejected" : "verified"
    )
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.post("/api/dossiers/:id/sections/:sectionId", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json({ error: "Unlock the controlled release before changing drafts." }, 423)
    const body = (await context.req.json()) as { content?: string; status?: string }
    await storage.updateDossierSection({
      ownerId,
      sectionId: context.req.param("sectionId"),
      content: body.content ?? "",
      status:
        body.status === "approved"
          ? "approved"
          : body.status === "in_review"
            ? "in_review"
            : "draft",
    })
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.post("/api/dossiers/:id/sections/:sectionId/starter", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json({ error: "Unlock the controlled release before changing drafts." }, 423)
    const section = dossier.sections.find((item) => item.id === context.req.param("sectionId"))
    if (!section) return context.json({ error: "Dossier section not found" }, 404)
    await storage.updateDossierSection({
      ownerId,
      sectionId: section.id,
      content: buildSectionStarter(section.part, section.title, dossier),
      status: "draft",
    })
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.post("/api/dossiers/:id/sections/:sectionId/assist", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    const section = dossier.sections.find((item) => item.id === context.req.param("sectionId"))
    if (!section) return context.json({ error: "Dossier section not found" }, 404)
    try {
      return context.json({
        result: await draftSectionFromVerifiedClaims({ section, claims: dossier.claims }),
      })
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : "Assisted drafting failed." },
        422
      )
    }
  })

  app.get("/api/dossiers/:id/sections/:sectionId/versions", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (!dossier.sections.some((item) => item.id === context.req.param("sectionId")))
      return context.json({ error: "Dossier section not found" }, 404)
    return context.json({
      versions: await storage.listSectionVersions(ownerId, context.req.param("sectionId")),
    })
  })

  app.post("/api/dossiers/:id/sections/:sectionId/versions/:versionId/restore", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json({ error: "Unlock the controlled release before restoring drafts." }, 423)
    await storage.restoreSectionVersion(
      ownerId,
      context.req.param("sectionId"),
      context.req.param("versionId")
    )
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.post("/api/dossiers/:id/requests", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json(
        { error: "Unlock the controlled release before creating evidence requests." },
        423
      )
    const body = (await context.req.json()) as Partial<EvidenceRequest>
    const requirement = dossier.requirements.find((item) => item.id === body.requirementId)
    if (!requirement) return context.json({ error: "Requirement not found" }, 404)
    const now = new Date().toISOString()
    await storage.createEvidenceRequest({
      id: randomUUID(),
      dossierId: dossier.dossier.id,
      ownerId,
      requirementId: requirement.id,
      title: body.title?.trim() || `Evidence needed: ${requirement.title}`,
      detail: body.detail?.trim() || requirement.guidance,
      priority: body.priority === "blocking" || body.priority === "high" ? body.priority : "normal",
      status: "open",
      createdAt: now,
      updatedAt: now,
    })
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id), 201)
  })

  app.post("/api/dossiers/:id/requests/:requestId", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json(
        { error: "Unlock the controlled release before updating evidence requests." },
        423
      )
    const request = dossier.evidenceRequests.find(
      (item) => item.id === context.req.param("requestId")
    )
    if (!request) return context.json({ error: "Evidence request not found" }, 404)
    const body = (await context.req.json()) as {
      status?: EvidenceRequest["status"]
      responseNote?: string
    }
    const statuses: EvidenceRequest["status"][] = ["open", "received", "resolved", "rejected"]
    await storage.updateEvidenceRequest(
      ownerId,
      request.id,
      statuses.includes(body.status as EvidenceRequest["status"])
        ? (body.status as EvidenceRequest["status"])
        : "open",
      body.responseNote?.trim()
    )
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.post("/api/dossiers/:id/requests/:requestId/link", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json({ error: "Unlock the controlled release before sharing requests." }, 423)
    const request = dossier.evidenceRequests.find(
      (item) => item.id === context.req.param("requestId")
    )
    if (!request) return context.json({ error: "Evidence request not found" }, 404)
    if (request.status === "resolved" || request.status === "rejected")
      return context.json({ error: "Closed evidence requests cannot be shared." }, 409)
    const body = (await context.req.json().catch(() => ({}))) as { expiresInDays?: number }
    const expiresInDays = Math.min(Math.max(Math.floor(body.expiresInDays ?? 14), 1), 90)
    const token = `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`
    const tokenHash = createHash("sha256").update(token).digest("hex")
    const now = new Date()
    const expiresAt = new Date(now.getTime() + expiresInDays * 86_400_000).toISOString()
    await storage.createEvidenceRequestLink({
      id: randomUUID(),
      dossierId: dossier.dossier.id,
      requestId: request.id,
      ownerId,
      tokenHash,
      status: "active",
      expiresAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    return context.json(
      { url: `${publicAppOrigin(context)}/respond#token=${token}`, expiresAt },
      201
    )
  })

  app.get("/api/respond/:token", async (context) => {
    const tokenHash = hashResponseToken(context.req.param("token"))
    if (!tokenHash) return context.json({ error: "Invalid response link." }, 404)
    const result = await createConfiguredStorage(dataDir).getExternalEvidenceRequest(tokenHash)
    if (
      !result ||
      result.link.status !== "active" ||
      result.link.expiresAt <= new Date().toISOString()
    )
      return context.json(
        { error: "This response link is invalid, expired, or already used." },
        410
      )
    return context.json(result)
  })

  app.post("/api/respond/:token", async (context) => {
    const tokenHash = hashResponseToken(context.req.param("token"))
    if (!tokenHash) return context.json({ error: "Invalid response link." }, 404)
    const body = (await context.req.json()) as { responseNote?: unknown }
    const responseNote = typeof body.responseNote === "string" ? body.responseNote.trim() : ""
    if (responseNote.length < 3 || responseNote.length > 10_000)
      return context.json({ error: "Add a response between 3 and 10,000 characters." }, 400)
    try {
      await createConfiguredStorage(dataDir).receiveExternalEvidenceResponse(
        tokenHash,
        responseNote
      )
      return context.json({ received: true })
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : "Response failed." },
        410
      )
    }
  })

  app.post("/api/respond/:token/evidence", async (context) => {
    const tokenHash = hashResponseToken(context.req.param("token"))
    if (!tokenHash) return context.json({ error: "Invalid response link." }, 404)
    const storage = createConfiguredStorage(dataDir)
    const external = await storage.getExternalEvidenceRequest(tokenHash)
    if (
      !external ||
      external.link.status !== "active" ||
      external.link.expiresAt <= new Date().toISOString()
    )
      return context.json(
        { error: "This response link is invalid, expired, or already used." },
        410
      )
    const body = await context.req.parseBody()
    const uploadError = validateUpload(body.file)
    if (uploadError) return context.json({ error: uploadError }, 400)
    const responseNote = String(body.responseNote ?? "").trim()
    if (responseNote.length > 10_000)
      return context.json({ error: "Response notes cannot exceed 10,000 characters." }, 400)
    const file = body.file as File
    const bytes = new Uint8Array(await file.arrayBuffer())
    const inspectionError = uploadInspectionError(bytes)
    if (inspectionError) {
      recordUploadRejection(context)
      return context.json({ error: inspectionError }, 400)
    }
    const extracted = await extractPdfText(bytes)
    validatePdfPageCount(extracted.pageCount)
    const artifact = await storage.createArtifact({
      bytes,
      fileName: file.name,
      mimeType: file.type || "application/pdf",
    })
    const now = new Date().toISOString()
    const evidenceId = randomUUID()
    await storage.receiveExternalEvidenceUpload(
      tokenHash,
      {
        id: evidenceId,
        dossierId: external.dossier.id,
        requirementId: external.request.requirementId,
        title: file.name,
        category: evidenceCategory(body.category),
        verificationStatus: "needs_review",
        artifact,
        excerpt: extracted.text.replace(/\s+/g, " ").trim().slice(0, 1800),
        pageCount: extracted.pageCount,
        createdAt: now,
        updatedAt: now,
      },
      extracted.pages.map((page) => ({
        id: `${evidenceId}-page-${page.pageNumber}`,
        dossierId: external.dossier.id,
        evidenceId,
        pageNumber: page.pageNumber,
        text: page.text.slice(0, 12_000),
        createdAt: now,
      })),
      responseNote || `External evidence supplied: ${file.name}`
    )
    return context.json({ received: true }, 201)
  })

  app.post("/api/dossiers/:id/attestations", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json(
        { error: "Unlock the controlled release before changing attestations." },
        423
      )
    const body = (await context.req.json()) as Partial<ReleaseAttestation>
    const kinds: ReleaseAttestation["kind"][] = [
      "scientific_accuracy",
      "source_traceability",
      "regulatory_completeness",
      "final_authorization",
    ]
    if (
      !kinds.includes(body.kind as ReleaseAttestation["kind"]) ||
      !body.signerName?.trim() ||
      !body.signerRole?.trim()
    )
      return context.json({ error: "Attestation type, signer name, and role are required." }, 400)
    const now = new Date().toISOString()
    await storage.signReleaseAttestation({
      id: randomUUID(),
      dossierId: dossier.dossier.id,
      ownerId,
      kind: body.kind as ReleaseAttestation["kind"],
      signerName: body.signerName.trim(),
      signerRole: body.signerRole.trim(),
      statement: attestationStatement(body.kind as ReleaseAttestation["kind"]),
      status: "signed",
      signedAt: now,
      updatedAt: now,
    })
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id), 201)
  })

  app.delete("/api/dossiers/:id/attestations/:attestationId", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json(
        { error: "Unlock the controlled release before changing attestations." },
        423
      )
    await storage.revokeReleaseAttestation(ownerId, context.req.param("attestationId"))
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.post("/api/dossiers/:id/releases", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    const qualitySnapshot = evaluateDossierQuality(dossier)
    const now = new Date().toISOString()
    const version = Math.max(0, ...dossier.releases.map((item) => item.packageVersion)) + 1
    await storage.lockDossierRelease({
      id: randomUUID(),
      dossierId: dossier.dossier.id,
      ownerId,
      status: "locked",
      qualitySnapshot,
      packageVersion: version,
      lockedAt: now,
      updatedAt: now,
    })
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id), 201)
  })

  app.post("/api/dossiers/:id/releases/:releaseId/unlock", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    await storage.unlockDossierRelease(ownerId, context.req.param("releaseId"))
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.post("/api/dossiers/:id/handoffs", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    const body = (await context.req.json()) as Partial<ConsultantHandoff>
    if (!body.consultantName?.trim() || !body.scope?.trim())
      return context.json({ error: "Consultant name and review scope are required." }, 400)
    const now = new Date().toISOString()
    await storage.createConsultantHandoff({
      id: randomUUID(),
      dossierId: dossier.dossier.id,
      ownerId,
      consultantName: body.consultantName.trim(),
      consultantEmail: body.consultantEmail?.trim() || undefined,
      scope: body.scope.trim(),
      dueDate: body.dueDate || undefined,
      status: "prepared",
      createdAt: now,
      updatedAt: now,
    })
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id), 201)
  })

  app.post("/api/dossiers/:id/handoffs/:handoffId", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    const body = (await context.req.json()) as {
      status?: ConsultantHandoff["status"]
      responseNote?: string
    }
    const statuses: ConsultantHandoff["status"][] = [
      "prepared",
      "in_review",
      "completed",
      "cancelled",
    ]
    if (!statuses.includes(body.status as ConsultantHandoff["status"]))
      return context.json({ error: "Invalid handoff status." }, 400)
    await storage.updateConsultantHandoff(
      ownerId,
      context.req.param("handoffId"),
      body.status as ConsultantHandoff["status"],
      body.responseNote?.trim()
    )
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.post("/api/dossiers/:id/review-issues", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json(
        { error: "Unlock the controlled release before changing review issues." },
        423
      )
    const body = (await context.req.json()) as Partial<ConsultantReviewIssue>
    const targetType = body.targetType ?? "dossier"
    const targetId = body.targetId?.trim() || dossier.dossier.id
    if (!reviewTargetExists(dossier, targetType, targetId))
      return context.json({ error: "Review target not found." }, 404)
    if (!body.title?.trim() || !body.body?.trim())
      return context.json({ error: "Issue title and review note are required." }, 400)
    const now = new Date().toISOString()
    await storage.createReviewIssue({
      id: randomUUID(),
      dossierId: dossier.dossier.id,
      handoffId: dossier.handoffs.some((item) => item.id === body.handoffId)
        ? body.handoffId
        : undefined,
      ownerId,
      targetType,
      targetId,
      title: body.title.trim(),
      body: body.body.trim(),
      priority: body.priority === "blocking" || body.priority === "high" ? body.priority : "normal",
      status: "open",
      createdAt: now,
      updatedAt: now,
    })
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id), 201)
  })

  app.post("/api/dossiers/:id/handoffs/:handoffId/link", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    const handoff = dossier.handoffs.find((item) => item.id === context.req.param("handoffId"))
    if (!handoff) return context.json({ error: "Handoff not found" }, 404)
    if (handoff.status === "completed" || handoff.status === "cancelled")
      return context.json({ error: "Closed consultant handoffs cannot be shared." }, 409)
    const body = (await context.req.json().catch(() => ({}))) as { expiresInDays?: number }
    const days = Math.min(Math.max(Math.floor(body.expiresInDays ?? 14), 1), 90)
    const token = `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`
    const now = new Date()
    const expiresAt = new Date(now.getTime() + days * 86_400_000).toISOString()
    await storage.createConsultantReviewLink({
      id: randomUUID(),
      dossierId: dossier.dossier.id,
      handoffId: handoff.id,
      ownerId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      status: "active",
      expiresAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    return context.json(
      { url: `${publicAppOrigin(context)}/review#token=${token}`, expiresAt },
      201
    )
  })

  app.get("/api/review/:token", async (context) => {
    const tokenHash = hashResponseToken(context.req.param("token"))
    if (!tokenHash) return context.json({ error: "Invalid review link." }, 404)
    const result = await createConfiguredStorage(dataDir).getExternalConsultantReview(tokenHash)
    if (
      !result ||
      result.link.status !== "active" ||
      result.link.expiresAt <= new Date().toISOString()
    )
      return context.json({ error: "This review link is invalid or expired." }, 410)
    return context.json(result)
  })

  app.post("/api/review/:token/issues", async (context) => {
    const tokenHash = hashResponseToken(context.req.param("token"))
    if (!tokenHash) return context.json({ error: "Invalid review link." }, 404)
    const body = (await context.req.json()) as Partial<ConsultantReviewIssue>
    const title = body.title?.trim() ?? ""
    const reviewNote = body.body?.trim() ?? ""
    if (!title || !reviewNote || !body.targetType || !body.targetId?.trim())
      return context.json({ error: "Target, title, and review note are required." }, 400)
    if (title.length > 200 || reviewNote.length > 10_000)
      return context.json(
        { error: "Finding titles cannot exceed 200 characters and notes cannot exceed 10,000." },
        400
      )
    const now = new Date().toISOString()
    try {
      const storage = createConfiguredStorage(dataDir)
      await storage.createExternalReviewIssue(tokenHash, {
        id: randomUUID(),
        targetType: body.targetType,
        targetId: body.targetId.trim(),
        title,
        body: reviewNote,
        priority:
          body.priority === "blocking" || body.priority === "high" ? body.priority : "normal",
        createdAt: now,
        updatedAt: now,
      })
      return context.json(await storage.getExternalConsultantReview(tokenHash), 201)
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : "Review finding failed." },
        410
      )
    }
  })

  app.post("/api/dossiers/:id/review-issues/:issueId", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    const issue = dossier.reviewIssues.find((item) => item.id === context.req.param("issueId"))
    if (!issue) return context.json({ error: "Review issue not found" }, 404)
    const body = (await context.req.json()) as {
      status?: ConsultantReviewIssue["status"]
      resolutionNote?: string
    }
    const status = body.status === "resolved" || body.status === "dismissed" ? body.status : "open"
    if (status === "resolved" && !body.resolutionNote?.trim())
      return context.json({ error: "Explain how the issue was resolved." }, 400)
    await storage.updateReviewIssue(ownerId, issue.id, status, body.resolutionNote?.trim())
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.post("/api/dossiers/:id/submissions", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    const body = (await context.req.json()) as Partial<SubmissionRecord>
    const release = dossier.releases.find(
      (item) => item.id === body.releaseId && item.status === "locked"
    )
    if (!release) return context.json({ error: "Choose a locked release." }, 400)
    if (!body.agency?.trim()) return context.json({ error: "Agency is required." }, 400)
    const now = new Date().toISOString()
    await storage.createSubmission({
      id: randomUUID(),
      dossierId: dossier.dossier.id,
      releaseId: release.id,
      ownerId,
      agency: body.agency.trim(),
      trackingNumber: body.trackingNumber?.trim() || undefined,
      status: body.status === "submitted" ? "submitted" : "ready",
      submittedAt: body.status === "submitted" ? now : undefined,
      targetDate: body.targetDate,
      createdAt: now,
      updatedAt: now,
    })
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id), 201)
  })

  app.post("/api/dossiers/:id/submissions/:submissionId", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    const submission = dossier.submissions.find(
      (item) => item.id === context.req.param("submissionId")
    )
    if (!submission) return context.json({ error: "Submission not found" }, 404)
    const body = (await context.req.json()) as Partial<SubmissionRecord>
    const statuses: SubmissionRecord["status"][] = [
      "ready",
      "submitted",
      "under_review",
      "questions",
      "closed",
      "withdrawn",
    ]
    const status = statuses.includes(body.status as SubmissionRecord["status"])
      ? (body.status as SubmissionRecord["status"])
      : submission.status
    await storage.updateSubmission(
      ownerId,
      submission.id,
      status,
      body.trackingNumber?.trim(),
      body.targetDate
    )
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.post("/api/dossiers/:id/submissions/:submissionId/questions", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    const submission = dossier.submissions.find(
      (item) => item.id === context.req.param("submissionId")
    )
    if (!submission) return context.json({ error: "Submission not found" }, 404)
    const body = (await context.req.json()) as Partial<AgencyQuestion>
    if (!body.title?.trim() || !body.body?.trim())
      return context.json({ error: "Question title and text are required." }, 400)
    const now = new Date().toISOString()
    await storage.createAgencyQuestion({
      id: randomUUID(),
      dossierId: dossier.dossier.id,
      submissionId: submission.id,
      ownerId,
      title: body.title.trim(),
      body: body.body.trim(),
      priority: body.priority === "blocking" || body.priority === "high" ? body.priority : "normal",
      status: "open",
      dueDate: body.dueDate,
      createdAt: now,
      updatedAt: now,
    })
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id), 201)
  })

  app.post("/api/dossiers/:id/questions/:questionId", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    const question = dossier.agencyQuestions.find(
      (item) => item.id === context.req.param("questionId")
    )
    if (!question) return context.json({ error: "Agency question not found" }, 404)
    const body = (await context.req.json()) as Partial<AgencyQuestion>
    const statuses: AgencyQuestion["status"][] = ["open", "drafting", "answered", "closed"]
    const status = statuses.includes(body.status as AgencyQuestion["status"])
      ? (body.status as AgencyQuestion["status"])
      : question.status
    if (status === "answered" && !body.response?.trim())
      return context.json({ error: "A response is required before marking answered." }, 400)
    await storage.updateAgencyQuestion(
      ownerId,
      question.id,
      status,
      body.response?.trim(),
      body.dueDate
    )
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.post("/api/dossiers/:id/facts", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json(
        { error: "Unlock the controlled release before changing the Fact Book." },
        423
      )
    const body = (await context.req.json()) as Partial<FactBookEntry>
    const kinds: FactBookEntry["kind"][] = [
      "identity",
      "manufacturing",
      "intended_use",
      "exposure",
      "specification",
      "batch_result",
      "safety_study",
    ]
    if (
      !kinds.includes(body.kind as FactBookEntry["kind"]) ||
      !body.title?.trim() ||
      !body.fields ||
      typeof body.fields !== "object"
    )
      return context.json({ error: "Fact type, title, and structured fields are required." }, 400)
    const fields = Object.fromEntries(
      Object.entries(body.fields)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([key, value]) => [key.trim(), value.trim()])
        .filter(([key, value]) => key && value)
    )
    if (Object.keys(fields).length === 0)
      return context.json({ error: "Add at least one structured field." }, 400)
    const now = new Date().toISOString()
    await storage.createFactBookEntry({
      id: randomUUID(),
      dossierId: dossier.dossier.id,
      ownerId,
      kind: body.kind as FactBookEntry["kind"],
      title: body.title.trim(),
      fields,
      evidenceId: dossier.evidence.some((item) => item.id === body.evidenceId)
        ? body.evidenceId
        : undefined,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    })
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id), 201)
  })

  app.post("/api/dossiers/:id/facts/:factId/impact", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    const fact = dossier.factBookEntries.find((item) => item.id === context.req.param("factId"))
    if (!fact) return context.json({ error: "Fact not found" }, 404)
    const body = (await context.req.json()) as { title?: string; fields?: Record<string, unknown> }
    const fields = normalizedFactFields(body.fields)
    if (!body.title?.trim() || Object.keys(fields).length === 0)
      return context.json({ error: "Title and structured fields are required." }, 400)
    return context.json({
      impact: analyzeFactImpact(fact, { title: body.title.trim(), fields }, dossier.sections),
    })
  })

  app.put("/api/dossiers/:id/facts/:factId", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json(
        { error: "Unlock the controlled release before changing the Fact Book." },
        423
      )
    const fact = dossier.factBookEntries.find((item) => item.id === context.req.param("factId"))
    if (!fact) return context.json({ error: "Fact not found" }, 404)
    const body = (await context.req.json()) as {
      title?: string
      fields?: Record<string, unknown>
      confirmImpacts?: boolean
    }
    const fields = normalizedFactFields(body.fields)
    if (!body.title?.trim() || Object.keys(fields).length === 0)
      return context.json({ error: "Title and structured fields are required." }, 400)
    const impact = analyzeFactImpact(fact, { title: body.title.trim(), fields }, dossier.sections)
    if (impact.affectedSectionIds.length > 0 && body.confirmImpacts !== true)
      return context.json(
        {
          error: "Confirm the affected dossier sections before applying this fact change.",
          impact,
        },
        409
      )
    await storage.updateFactBookEntry(
      ownerId,
      fact.id,
      body.title.trim(),
      fields,
      body.confirmImpacts === true
    )
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.post("/api/dossiers/:id/facts/:factId/review", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json(
        { error: "Unlock the controlled release before changing the Fact Book." },
        423
      )
    const body = (await context.req.json()) as { status?: FactBookEntry["status"] }
    await storage.reviewFactBookEntry(
      ownerId,
      context.req.param("factId"),
      body.status === "verified" ? "verified" : "draft"
    )
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.delete("/api/dossiers/:id/facts/:factId", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json(
        { error: "Unlock the controlled release before changing the Fact Book." },
        423
      )
    await storage.deleteFactBookEntry(ownerId, context.req.param("factId"))
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.get("/api/dossiers/:id/facts/export", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    const csv = buildFactBookCsv(dossier.factBookEntries)
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFileBase(dossier.dossier.intake.substanceName)}-fact-book.csv"`,
        "Cache-Control": "private, no-store",
      },
    })
  })

  app.get("/api/dossiers/:id/quality", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    return context.json({ checks: evaluateDossierQuality(dossier) })
  })

  app.get("/api/dossiers/:id/evidence/:evidenceId/pages", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    const evidence = dossier.evidence.find((item) => item.id === context.req.param("evidenceId"))
    if (!evidence) return context.json({ error: "Evidence not found" }, 404)
    return context.json({
      evidence,
      passages: await storage.listEvidencePassages(ownerId, evidence.id),
    })
  })

  app.post("/api/dossiers/:id/evidence/:evidenceId/fact-suggestions", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    const evidence = dossier.evidence.find((item) => item.id === context.req.param("evidenceId"))
    if (!evidence) return context.json({ error: "Evidence not found" }, 404)
    const passages = await storage.listEvidencePassages(ownerId, evidence.id)
    const suggestions = suggestFactsFromPassages(evidence.title, passages).map((candidate) => ({
      ...candidate,
      id: randomUUID(),
    }))
    const candidates = await storage.saveExtractionCandidates(
      ownerId,
      dossier.dossier.id,
      evidence.id,
      suggestions
    )
    return context.json({ candidates, evidenceId: evidence.id })
  })

  app.post("/api/dossiers/:id/extraction-candidates/:candidateId", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    const candidate = dossier.extractionCandidates.find(
      (item) => item.id === context.req.param("candidateId")
    )
    if (!candidate) return context.json({ error: "Extraction candidate not found" }, 404)
    const body = (await context.req.json()) as { action?: "accept" | "dismiss" }
    await storage.reviewExtractionCandidate(
      ownerId,
      candidate.id,
      body.action === "accept" ? "accept" : "dismiss"
    )
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.delete("/api/dossiers/:id/evidence/:evidenceId", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    if (isDossierLocked(dossier))
      return context.json({ error: "Unlock the controlled release before removing evidence." }, 423)
    await storage.deleteDossierEvidence(
      ownerId,
      dossier.dossier.id,
      context.req.param("evidenceId")
    )
    return context.json(await storage.getDossier(ownerId, dossier.dossier.id))
  })

  app.get("/api/dossiers/:id/export", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    return markdownResponse(
      context,
      buildDossierMarkdown(dossier),
      `${safeFileBase(dossier.dossier.intake.substanceName)}-working-dossier.md`
    )
  })

  app.get("/api/dossiers/:id/package", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const dossier = await storage.getDossier(ownerId, context.req.param("id"))
    if (!dossier) return context.json({ error: "Dossier not found" }, 404)
    const files = buildSubmissionPackageFiles(dossier)
    const archive = createZipArchive(files)
    const fileName = `${safeFileBase(dossier.dossier.intake.substanceName)}-submission-package.zip`
    return new Response(archive, {
      headers: {
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": "application/zip",
        "Cache-Control": "private, no-store",
      },
    })
  })

  app.get("/api/analyses/:id", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const analysis = await storage.getAnalysis(ownerId, context.req.param("id"))

    if (!analysis) {
      return context.json({ error: "Analysis not found" }, 404)
    }

    return context.json({ analysis })
  })

  app.get("/api/analyses/:id/compare/:baselineId", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const [revised, baseline] = await Promise.all([
      storage.getAnalysis(ownerId, context.req.param("id")),
      storage.getAnalysis(ownerId, context.req.param("baselineId")),
    ])

    if (!revised?.report || !baseline?.report) {
      return context.json({ error: "Two completed analyses are required for comparison." }, 404)
    }

    const filingDiff = compareEvidenceMatrices(
      baseline.report.modules.evidenceMatrix,
      revised.report.modules.evidenceMatrix,
      { pairAware: true }
    )
    if (filingDiff.length === 0) {
      return context.json(
        { error: "Both analyses need evidence-matrix results before they can be compared." },
        422
      )
    }

    return context.json({
      baseline: { id: baseline.id, filingName: baseline.filingName },
      revised: { id: revised.id, filingName: revised.filingName },
      filingDiff,
    })
  })

  app.delete("/api/analyses/:id", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const deleted = await storage.deleteAnalysis(ownerId, context.req.param("id"))
    if (!deleted) return context.json({ error: "Analysis not found" }, 404)
    return context.body(null, 204)
  })

  app.get("/api/analyses/:id/notes", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const analysis = await storage.getAnalysis(ownerId, context.req.param("id"))

    if (!analysis) {
      return context.json({ error: "Analysis not found" }, 404)
    }

    const notes = await storage.listNotes(ownerId, analysis.id)
    return context.json({ notes })
  })

  app.post("/api/analyses/:id/notes", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const analysis = await storage.getAnalysis(ownerId, context.req.param("id"))

    if (!analysis) {
      return context.json({ error: "Analysis not found" }, 404)
    }

    const body = (await context.req.json()) as { body?: string; status?: string }
    const noteBody = body.body?.trim()

    if (!noteBody) {
      return context.json({ error: "Note text is required." }, 400)
    }

    const note = await storage.createNote({
      ownerId,
      analysisId: analysis.id,
      body: noteBody,
      status:
        body.status === "in_progress" || body.status === "done" || body.status === "open"
          ? body.status
          : "open",
    })

    return context.json({ note }, 201)
  })

  app.get("/api/analyses/:id/outline", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const analysis = await storage.getAnalysis(ownerId, context.req.param("id"))

    if (!analysis?.report) {
      return context.json({ error: "Completed report not found" }, 404)
    }

    return markdownResponse(
      context,
      buildOutlineMarkdown(analysis.report),
      `${safeFileBase(analysis.filingName)}-amendment-outline.md`
    )
  })

  app.get("/api/analyses/:id/export", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const analysis = await storage.getAnalysis(ownerId, context.req.param("id"))

    if (!analysis?.report) {
      return context.json({ error: "Completed report not found" }, 404)
    }

    const notes = await storage.listNotes(ownerId, analysis.id)

    return markdownResponse(
      context,
      buildReportMarkdown(analysis, analysis.report, notes),
      `${safeFileBase(analysis.filingName)}-readiness-report.md`
    )
  })

  app.post("/api/analyses", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const body = await context.req.parseBody()
    const file = body.file
    const validationError = validateUpload(file)

    if (validationError) {
      return context.json({ error: validationError }, 400)
    }

    const pdfFile = file as File
    const bytes = new Uint8Array(await pdfFile.arrayBuffer())
    const inspectionError = uploadInspectionError(bytes)
    if (inspectionError) {
      recordUploadRejection(context)
      return context.json({ error: inspectionError }, 400)
    }
    const upload = await storage.createArtifact({
      bytes,
      fileName: pdfFile.name,
      mimeType: pdfFile.type || "application/pdf",
    })
    const analysis = await storage.createAnalysis({
      ownerId,
      filingName: pdfFile.name,
      upload,
    })

    if (shouldRunAnalysisInline(options.runAnalysisInline)) {
      await processAnalysis(analysis.id, storage)
      const completed = await storage.getAnalysisById(analysis.id)
      return context.json({ analysis: completed ?? analysis }, 202)
    }

    setTimeout(() => {
      void processAnalysis(analysis.id, storage)
    }, 0)

    return context.json({ analysis }, 202)
  })

  app.post("/api/analyses/from-upload", async (context) => {
    const { ownerId, storage } = await requestScope(context)
    const body = (await context.req.json()) as { pathname?: string; fileName?: string }
    const pathname = body.pathname?.trim()
    const fileName = body.fileName?.trim()

    if (!pathname || !fileName) {
      return context.json({ error: "Uploaded PDF metadata is required." }, 400)
    }

    if (!pathname.startsWith(uploadPathPrefix(ownerId))) {
      return context.json({ error: "Uploaded PDF does not belong to this session." }, 403)
    }

    const resolveUploadedArtifact = options.resolveUploadedArtifact ?? resolveVercelBlobArtifact
    const upload = await resolveUploadedArtifact(ownerId, pathname, fileName)
    const bytes = await storage.readArtifact(upload)
    const inspectionError = uploadInspectionError(bytes)
    if (inspectionError) {
      recordUploadRejection(context)
      return context.json({ error: inspectionError }, 400)
    }
    const analysis = await storage.createAnalysis({
      ownerId,
      filingName: fileName,
      upload,
    })

    if (shouldRunAnalysisInline(options.runAnalysisInline)) {
      await processAnalysis(analysis.id, storage)
      const completed = await storage.getAnalysisById(analysis.id)
      return context.json({ analysis: completed ?? analysis }, 202)
    }

    setTimeout(() => {
      void processAnalysis(analysis.id, storage)
    }, 0)

    return context.json({ analysis }, 202)
  })

  async function processAnalysis(
    analysisId: string,
    storage: ReturnType<typeof createConfiguredStorage>
  ) {
    const analysis = await storage.getAnalysisById(analysisId)
    if (!analysis?.upload) {
      return
    }

    try {
      const analysisCacheDir = path.join(dataDir, "model-cache", analysis.id)
      await storage.updateAnalysis(analysisId, {
        status: "running",
        error: undefined,
      })

      const uploadBytes = await storage.readArtifact(analysis.upload)
      const extracted = await extractPdfText(uploadBytes)
      validatePdfPageCount(extracted.pageCount)
      const textArtifact = await storage.createArtifact({
        bytes: Buffer.from(extracted.text, "utf8"),
        fileName: `${analysis.filingName}.txt`,
        mimeType: "text/plain",
      })
      const minimumReport = createMinimumReadinessReport({
        analysisId: analysis.id,
        filingName: analysis.filingName,
        extractedText: extracted.text,
        pageCount: extracted.pageCount,
      })
      let report = minimumReport

      if (shouldRunDeepAnalysis(options.analysisMode)) {
        try {
          const moduleCaveats: string[] = []
          const deepAnalyzer = options.deepAnalyzer ?? analyzeNoticeWithAnthropic
          const analyzedResult = await deepAnalyzer({
            filingName: analysis.filingName,
            pages: extracted.pages,
            cacheDir: analysisCacheDir,
          })
          let verifiedReferences = analyzedResult.researchReferences
          if (
            verifiedReferences.length > 0 &&
            (options.referenceVerifier || shouldVerifyReferences())
          ) {
            try {
              const verifier =
                options.referenceVerifier ??
                (async (references: ResearchReference[]) => {
                  const metadataVerified = await verifyReferencesWithCrossref(references, {
                    mailto: process.env.GREENLIT_CROSSREF_MAILTO,
                  })
                  return verifyReferenceSources(metadataVerified, {
                    email: process.env.GREENLIT_NCBI_EMAIL ?? process.env.GREENLIT_CROSSREF_MAILTO,
                  })
                })
              verifiedReferences = await verifier(verifiedReferences)
            } catch {
              // Verification is additive; preserve extracted references on failure.
              moduleCaveats.push(
                "Research-reference metadata verification was unavailable; extracted notifier citations remain unverified."
              )
            }
          }
          const deepResult = {
            ...analyzedResult,
            researchReferences: verifiedReferences,
          }
          report = applyDeepAnalysis(minimumReport, deepResult)
          try {
            const corpus = options.comparableCorpus ?? (await loadConfiguredCorpus())
            if (deepResult.filingProfile && corpus.length > 0) {
              let comparableFilings = await enrichComparableEvidence({
                filings: rankComparableFilings(deepResult.filingProfile, corpus),
                profiles: corpus,
                evidenceMatrix: deepResult.evidenceMatrix,
              })
              let comparableActions: ComparableAction[] = []
              let comparatorModelUsage: ReadinessReport["runMetadata"]["modelUsage"] = []
              if (!options.comparableAssessor && !options.comparableActionSynthesizer) {
                try {
                  const combined = await assessAndSynthesizeComparablesWithAnthropic({
                    subjectProfile: deepResult.filingProfile,
                    evidenceMatrix: deepResult.evidenceMatrix,
                    filings: comparableFilings,
                    cacheDir: analysisCacheDir,
                  })
                  comparableFilings = combined.comparableFilings
                  comparableActions = combined.comparableActions
                  comparatorModelUsage = combined.modelUsage
                } catch {
                  try {
                    comparableFilings = await assessComparableEvidenceWithAnthropic({
                      subjectProfile: deepResult.filingProfile,
                      evidenceMatrix: deepResult.evidenceMatrix,
                      filings: comparableFilings,
                      cacheDir: analysisCacheDir,
                    })
                    comparableActions = await synthesizeComparableActionsWithAnthropic({
                      evidenceMatrix: deepResult.evidenceMatrix,
                      filings: comparableFilings,
                      cacheDir: analysisCacheDir,
                    })
                  } catch {
                    // All comparator model enrichment is additive; retain retrieved passages.
                    moduleCaveats.push(
                      "Comparator transferability assessment and action synthesis were unavailable; retrieved comparator passages remain research waypoints only."
                    )
                  }
                }
              } else {
                try {
                  comparableFilings = await (
                    options.comparableAssessor ?? assessComparableEvidenceWithAnthropic
                  )({
                    subjectProfile: deepResult.filingProfile,
                    evidenceMatrix: deepResult.evidenceMatrix,
                    filings: comparableFilings,
                    cacheDir: analysisCacheDir,
                  })
                } catch {
                  // Assessment is additive; retain cited comparator passages on failure.
                  moduleCaveats.push(
                    "Comparator transferability assessment was unavailable; retrieved passages remain unassessed."
                  )
                }
                try {
                  comparableActions = await (
                    options.comparableActionSynthesizer ?? synthesizeComparableActionsWithAnthropic
                  )({
                    evidenceMatrix: deepResult.evidenceMatrix,
                    filings: comparableFilings,
                    cacheDir: analysisCacheDir,
                  })
                } catch {
                  // Action synthesis is additive; retain comparator assessments on failure.
                  moduleCaveats.push(
                    "Comparator-informed action synthesis was unavailable; the amendment plan excludes comparator-derived work packages."
                  )
                }
              }
              report = ReadinessReportSchema.parse({
                ...report,
                modules: {
                  ...report.modules,
                  comparableFilings,
                  comparableActions,
                  amendmentOutline: mergeComparableActionsIntoOutline(
                    report.modules.amendmentOutline,
                    comparableActions,
                    deepResult.evidenceMatrix
                  ),
                },
                runMetadata: {
                  ...report.runMetadata,
                  modelUsage: [...report.runMetadata.modelUsage, ...comparatorModelUsage],
                  estimatedCostUsd: Number(
                    (
                      report.runMetadata.estimatedCostUsd +
                      comparatorModelUsage.reduce(
                        (total, usage) => total + usage.estimatedCostUsd,
                        0
                      )
                    ).toFixed(6)
                  ),
                },
              })
            }
          } catch {
            moduleCaveats.push(
              "Comparable-filing retrieval was unavailable; the grounded filing analysis remains complete without comparator enrichment."
            )
          }
          if (moduleCaveats.length > 0) {
            report = ReadinessReportSchema.parse({
              ...report,
              caveats: [...report.caveats, ...new Set(moduleCaveats)],
            })
          }
        } catch {
          report = {
            ...minimumReport,
            caveats: [
              ...minimumReport.caveats,
              "Deep evidence analysis was unavailable; this saved report contains only the minimum structural fallback.",
            ],
          }
        }
      }

      await storage.setReport(analysisId, report, textArtifact)
    } catch (error) {
      try {
        await storage.updateAnalysis(analysisId, {
          status: "failed",
          error: error instanceof Error ? error.message : "Analysis failed",
        })
      } catch {
        // The local data directory may have been removed while background work was running.
      }
    }
  }

  return app

  async function requestScope(context: Context) {
    const requiresAuth =
      isHostedRuntime() ||
      process.env.GREENLIT_METADATA_DRIVER === "convex" ||
      options.resolveAuthenticatedOwner
    if (!requiresAuth) {
      return {
        ownerId: getOwnerId(context.req.header("x-greenlit-session")),
        storage: createConfiguredStorage(dataDir),
      }
    }
    const authorization = context.req.header("authorization")
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token) throw new Error("Not authenticated")
    const ownerId = options.resolveAuthenticatedOwner
      ? await options.resolveAuthenticatedOwner(token)
      : await resolveConvexOwner(token)
    if (!ownerId) throw new Error("Not authenticated")
    return {
      ownerId,
      storage: createConfiguredStorage(
        dataDir,
        process.env.GREENLIT_METADATA_DRIVER === "convex" ? token : undefined
      ),
    }
  }
}

async function resolveConvexOwner(token: string) {
  const client = new ConvexHttpClient(requiredConvexUrl(), { logger: false })
  client.setAuth(token)
  const currentUserId = makeFunctionReference<"query", Record<string, never>, string | null>(
    "auth:currentUserId"
  )
  return await client.query(currentUserId, {})
}

function hashResponseToken(token: string) {
  if (!/^[a-f0-9]{64}$/i.test(token)) return null
  return createHash("sha256").update(token).digest("hex")
}

export function redactedRequestPath(url: string) {
  return new URL(url).pathname
    .replace(/^\/api\/(respond|review)\/[^/]+/, (_match, kind: string) => `/api/${kind}/[redacted]`)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[id]")
}

function publicAppOrigin(context: Context) {
  const configured =
    process.env.GREENLIT_PUBLIC_APP_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL
  const candidate = configured
    ? /^[a-z][a-z\d+.-]*:\/\//i.test(configured)
      ? configured
      : `https://${configured}`
    : new URL(context.req.url).origin
  const url = new URL(candidate)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
    throw new Error("GREENLIT_PUBLIC_APP_URL must use HTTPS")
  }
  return url.origin
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
}

function isHostedRuntime() {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production"
}

function publicLinkRateLimit(counts: Map<string, { count: number; resetAt: number }>) {
  return async (context: Context, next: () => Promise<void>) => {
    if (context.req.method === "OPTIONS") return next()
    const tokenCandidate = new URL(context.req.url).pathname.split("/")[3] ?? ""
    const token = /^[a-f0-9]{64}$/i.test(tokenCandidate) ? tokenCandidate : "invalid"
    const tokenKey = createHash("sha256").update(token).digest("hex").slice(0, 24)
    const key = `${context.req.method === "GET" ? "read" : "write"}:${tokenKey}`
    const now = Date.now()
    const limit = context.req.method === "GET" ? publicReadLimit : publicWriteLimit
    if (counts.size >= 5_000 && !counts.has(key)) {
      for (const [existingKey, value] of counts) {
        if (value.resetAt <= now) counts.delete(existingKey)
      }
      while (counts.size >= 5_000) {
        const oldestKey = counts.keys().next().value
        if (typeof oldestKey !== "string") break
        counts.delete(oldestKey)
      }
    }
    const current = counts.get(key)
    const bucket =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + publicRateLimitWindowMs }
        : current
    bucket.count += 1
    counts.set(key, bucket)
    const remaining = Math.max(0, limit - bucket.count)
    context.header("X-RateLimit-Limit", String(limit))
    context.header("X-RateLimit-Remaining", String(remaining))
    context.header("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)))
    if (bucket.count > limit) {
      recordSecurityEvent("capability_rate_limited", {
        method: context.req.method,
        route: redactedRequestPath(context.req.url),
        status: 429,
      })
      context.header("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)))
      return context.json({ error: "Too many requests. Try again later." }, 429)
    }
    await next()
  }
}

function reviewTargetExists(
  dossier: DossierWorkspaceData,
  targetType: ConsultantReviewIssue["targetType"],
  targetId: string
) {
  if (targetType === "dossier") return dossier.dossier.id === targetId
  if (targetType === "section") return dossier.sections.some((item) => item.id === targetId)
  if (targetType === "fact") return dossier.factBookEntries.some((item) => item.id === targetId)
  if (targetType === "claim") return dossier.claims.some((item) => item.id === targetId)
  return dossier.evidence.some((item) => item.id === targetId)
}

function shouldRunDeepAnalysis(mode?: "minimum" | "deep") {
  return (mode ?? process.env.GREENLIT_ANALYSIS_MODE) === "deep"
}

function shouldVerifyReferences() {
  return process.env.GREENLIT_VERIFY_REFERENCES === "true"
}

function markdownResponse(context: Context, markdown: string, fileName: string) {
  return context.body(markdown, 200, {
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Content-Type": "text/markdown; charset=utf-8",
  })
}

function buildOutlineMarkdown(report: ReadinessReport) {
  const sections = report.modules.amendmentOutline
    .map((section) => {
      const items = section.items.map((item) => `- ${item}`).join("\n")
      const metadata = [
        section.sequence ? `Sequence: ${section.sequence}` : "",
        section.priority ? `Priority: ${section.priority}` : "",
        section.ownerRole ? `Owner: ${section.ownerRole}` : "",
        section.domains?.length ? `Domains: ${section.domains.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" · ")
      const sources = section.citations?.length
        ? `\n\nSources: ${[...new Set(section.citations.map((citation) => `PDF page ${citation.pageNumber}`))].join(", ")}`
        : ""
      const dependencies = section.dependencies?.length
        ? `\n\nDependencies: ${section.dependencies.join(", ")}`
        : ""
      const deliverables = section.deliverables?.length
        ? `\n\nDeliverables:\n${section.deliverables.map((item) => `- ${item}`).join("\n")}`
        : ""
      const comparatorSources = section.comparatorSources?.length
        ? `\n\nComparator sources:\n${section.comparatorSources
            .map(
              (source) =>
                `- ${source.filingName}, PDF pages ${source.pageNumbers.join(", ")} — ${source.conclusion.replaceAll("_", " ")}`
            )
            .join("\n")}`
        : ""
      return `## ${section.title}\n\n${metadata ? `${metadata}\n\n` : ""}${items}${deliverables}${dependencies}${sources}${comparatorSources}`
    })
    .join("\n\n")

  return `# Amendment Outline: ${report.filingName}\n\n${sections}\n`
}

function buildReportMarkdown(
  analysis: AnalysisRecord,
  report: ReadinessReport,
  notes: WorkbookNote[]
) {
  const findings = report.findings
    .map((finding) => `- **${finding.severity}: ${finding.title}** — ${finding.recommendedAction}`)
    .join("\n")
  const benchmark = report.modules.documentationBenchmark
    .map((item) => `- **${item.label}: ${item.status}** — ${item.summary}`)
    .join("\n")
  const safety = report.modules.safetySignals
    .map((item) => `- **${item.label}: ${item.level}** — ${item.summary}`)
    .join("\n")
  const evidenceMatrix = report.modules.evidenceMatrix
    .map(
      (item) =>
        `### ${item.requirement} — ${item.status}\n\n${item.assessment}\n\n${item.evidenceSummary}\n\n${markdownCitations(item.citations)}${item.unresolvedQuestions.length > 0 ? `\n\n**Unresolved:** ${item.unresolvedQuestions.join("; ")}` : ""}`
    )
    .join("\n\n")
  const comparables = report.modules.comparableFilings
    .map((filing) => {
      const evidence = (filing.evidenceMatches ?? [])
        .map(
          (match) =>
            `  - **${match.requirement}** (${Math.round(match.relevanceScore * 100)}% passage match): ${match.rationale}\n${markdownCitations(match.citations, "    ")}`
        )
        .join("\n")
      return `- **${filing.name}** — ${filing.similarityScore === undefined ? "unscored" : `${Math.round(filing.similarityScore * 100)}% match`}; ${filing.comparisonStrength ?? "unclassified"}; ${(filing.researchUse ?? "context_only").replaceAll("_", " ")}\n  ${filing.eligibilityRationale ?? filing.rationale}${evidence ? `\n${evidence}` : ""}`
    })
    .join("\n")
  const filingDiff = report.modules.filingDiff
    .map(
      (item) =>
        `### ${item.label} — ${(item.changeType ?? item.change ?? item.status).replaceAll("_", " ")}\n\n${item.changeSummary ?? item.draftSignal}\n\n**Baseline:** ${item.baselineExpectation}\n\n${markdownCitations(item.baselineCitations ?? [])}\n\n**Revised:** ${item.draftSignal}\n\n${markdownCitations(item.draftCitations ?? [])}\n\n**Action:** ${item.recommendedAction}`
    )
    .join("\n\n")
  const references = report.modules.researchReferences
    .map(
      (reference) =>
        `- **${reference.title}**${reference.year ? ` (${reference.year})` : ""} — ${reference.verificationStatus ?? "unverified"}${reference.sourceVerification ? `; ${reference.sourceVerification.accessLevel.replaceAll("_", " ")} via ${reference.sourceVerification.source.replaceAll("_", " ")}` : ""}${reference.doi ? `; DOI ${reference.doi}` : ""}${reference.citedPages?.length ? `; filing pages ${reference.citedPages.join(", ")}` : ""}${reference.duplicateCount ? `; ${reference.duplicateCount} duplicate entries consolidated` : ""}\n  ${reference.relevance}`
    )
    .join("\n")
  const amendmentPlan = report.modules.amendmentOutline
    .map(
      (section, index) =>
        `${index + 1}. **${section.title}**${section.ownerRole ? ` — owner: ${section.ownerRole}` : ""}\n${section.items.map((item) => `   - ${item}`).join("\n")}`
    )
    .join("\n")
  const notesMarkdown =
    notes.length > 0
      ? notes.map((note) => `- **${note.status}** ${note.body}`).join("\n")
      : "- No workbook notes yet."

  return `# Readiness Report: ${report.filingName}

Analysis ID: ${analysis.id}
Score: ${report.readinessScore}
Generated: ${report.generatedAt}

${report.summary}

## Findings

${findings}

## Documentation Benchmark

${benchmark}

## Safety Signals

${safety}

## Evidence Matrix

${evidenceMatrix || "No evidence-matrix rows were generated."}

## Comparable Filings

${comparables || "No comparable filings were generated."}

## Filing Diff

${filingDiff || "No filing differences were generated."}

## Research References

${references || "No research references were extracted."}

## Amendment Plan

${amendmentPlan || "No amendment plan was generated."}

## Workbook Notes

${notesMarkdown}
`
}

function markdownCitations(
  citations: Array<{ pageNumber: number; excerpt: string; section?: string }>,
  indent = ""
) {
  return citations.length > 0
    ? citations
        .map(
          (citation) =>
            `${indent}> PDF page ${citation.pageNumber}${citation.section ? `, ${citation.section}` : ""}: “${citation.excerpt}”`
        )
        .join("\n")
    : `${indent}_No source citation available._`
}

function safeFileBase(fileName: string) {
  return fileName
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
}

function getOwnerId(ownerId: string | undefined) {
  if (!ownerId?.trim()) {
    throw new Error("Missing x-greenlit-session header")
  }

  return ownerId
}

function requiredConvexUrl() {
  const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL
  if (!url) throw new Error("CONVEX_URL is required for authenticated hosted access")
  return url
}

function shouldRunAnalysisInline(override?: boolean) {
  return override ?? (process.env.VERCEL === "1" || process.env.GREENLIT_ANALYSIS_MODE === "inline")
}

type EvidenceCategory = DossierEvidence["category"]

type DossierWorkspaceData = {
  dossier: DossierRecord
  requirements: DossierRequirement[]
  evidence: DossierEvidence[]
  sections: DossierSection[]
  claims: DossierClaim[]
  auditEvents: import("../../../packages/core/src/index.js").DossierAuditEvent[]
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

function attestationStatement(kind: ReleaseAttestation["kind"]) {
  const statements: Record<ReleaseAttestation["kind"], string> = {
    scientific_accuracy:
      "I have reviewed the scientific narrative and believe it accurately reflects the cited evidence, limitations, and relevant contrary information.",
    source_traceability:
      "I have reviewed the claim ledger and confirm that material assertions are traceable to identified source passages.",
    regulatory_completeness:
      "I have reviewed the dossier structure and quality controls for completeness against the intended GRAS notice workflow.",
    final_authorization:
      "I authorize this reviewed dossier version to be locked as a release package for controlled handoff or submission preparation.",
  }
  return statements[kind]
}

function isDossierLocked(workspace: DossierWorkspaceData) {
  return workspace.releases.some((release) => release.status === "locked")
}

function normalizedFactFields(fields: Record<string, unknown> | undefined) {
  return Object.fromEntries(
    Object.entries(fields ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, value]) => [key.trim(), value.trim()])
      .filter(([key, value]) => key.length > 0 && value.length > 0)
  )
}

function buildDossierMarkdown(workspace: DossierWorkspaceData) {
  const checks = evaluateDossierQuality(workspace)
  const blockers = checks.filter((check) => check.severity === "blocker")
  const claimNumbers = new Map<string, number>()
  let nextNumber = 1
  for (const claim of workspace.claims.filter((item) => item.status === "verified")) {
    claimNumbers.set(claim.id, nextNumber)
    nextNumber += 1
  }
  const sections = workspace.sections
    .map((section) => {
      const content = section.content.trim() || "_Section not yet drafted._"
      const resolved = content.replace(/\[\[claim:([^\]]+)\]\]/g, (marker, claimId: string) => {
        const number = claimNumbers.get(claimId)
        return number ? `[^${number}]` : `${marker} **[UNRESOLVED CLAIM]**`
      })
      const factResolved = renderFactReferences(resolved, workspace.factBookEntries).rendered
      return `## ${section.part}: ${section.title}\n\n${factResolved}\n\n_Section status: ${section.status.replaceAll("_", " ")}_`
    })
    .join("\n\n---\n\n")
  const footnotes = workspace.claims
    .filter((claim) => claim.status === "verified")
    .map((claim) => {
      const number = claimNumbers.get(claim.id)
      const evidence = workspace.evidence.find((item) => item.id === claim.evidenceId)
      return `[^${number}]: ${evidence?.title ?? "Unknown source"}, p. ${claim.sourcePage}. Supporting excerpt: “${claim.sourceExcerpt.replace(/\s+/g, " ").trim()}”`
    })
    .join("\n\n")
  const quality = checks
    .map((check) => `- **${check.severity.toUpperCase()} — ${check.title}:** ${check.detail}`)
    .join("\n")
  return `# ${workspace.dossier.name}\n\n> **WORKING DRAFT — NOT A GRAS CONCLUSION OR FDA SUBMISSION**\n>\n> Generated from Greenlit's verified claim ledger. ${blockers.length} blocking quality controls remain. Human scientific and regulatory review is required.\n\n## Workspace quality summary\n\n${quality}\n\n---\n\n${sections}\n\n## Verified source notes\n\n${footnotes || "No verified claim citations are available."}\n`
}

function buildSubmissionPackageFiles(workspace: DossierWorkspaceData) {
  const quality = evaluateDossierQuality(workspace)
  const activeRelease = workspace.releases.find((item) => item.status === "locked")
  const claims = [
    "claim_id,status,section,statement,source_title,source_page,source_excerpt",
    ...workspace.claims.map((claim) => {
      const section = workspace.sections.find((item) => item.id === claim.sectionId)
      const evidence = workspace.evidence.find((item) => item.id === claim.evidenceId)
      return [
        claim.id,
        claim.status,
        section?.part,
        claim.statement,
        evidence?.title,
        claim.sourcePage,
        claim.sourceExcerpt,
      ]
        .map(safeCsvCell)
        .join(",")
    }),
  ].join("\r\n")
  const evidence = [
    "evidence_id,title,category,verification_status,pages,requirement,created_at",
    ...workspace.evidence.map((item) =>
      [
        item.id,
        item.title,
        item.category,
        item.verificationStatus,
        item.pageCount,
        workspace.requirements.find((requirement) => requirement.id === item.requirementId)?.title,
        item.createdAt,
      ]
        .map(safeCsvCell)
        .join(",")
    ),
  ].join("\r\n")
  const audit = [
    "timestamp,action,target_type,target_id,summary",
    ...workspace.auditEvents.map((item) =>
      [item.createdAt, item.action, item.targetType, item.targetId, item.summary]
        .map(safeCsvCell)
        .join(",")
    ),
  ].join("\r\n")
  const facts = buildFactBookCsv(workspace.factBookEntries)
  const attestations = workspace.attestations
    .filter((item) => item.status === "signed")
    .map((item) => ({
      kind: item.kind,
      signerName: item.signerName,
      signerRole: item.signerRole,
      statement: item.statement,
      signedAt: item.signedAt,
    }))
  const initial = [
    {
      name: "README.txt",
      content: `Greenlit controlled dossier package\n\nSubstance: ${workspace.dossier.intake.substanceName}\nSponsor: ${workspace.dossier.intake.companyName || "Not specified"}\nGenerated: ${new Date().toISOString()}\nRelease: ${activeRelease ? `Locked v${activeRelease.packageVersion}` : "Working package — not release locked"}\n\nThis package supports human scientific and regulatory review. It is not a GRAS conclusion and is not an FDA submission by itself.\n`,
    },
    { name: "01-dossier.md", content: buildDossierMarkdown(workspace) },
    { name: "02-claim-ledger.csv", content: claims },
    { name: "03-evidence-index.csv", content: evidence },
    {
      name: "04-quality-report.json",
      content: JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          blockers: quality.filter((item) => item.severity === "blocker").length,
          checks: quality,
        },
        null,
        2
      ),
    },
    { name: "05-release-attestations.json", content: JSON.stringify(attestations, null, 2) },
    { name: "06-audit-trail.csv", content: audit },
    { name: "07-fact-book.csv", content: facts },
  ]
  const manifest = {
    packageFormat: "greenlit-dossier-package",
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    dossierId: workspace.dossier.id,
    substanceName: workspace.dossier.intake.substanceName,
    release: activeRelease
      ? {
          id: activeRelease.id,
          version: activeRelease.packageVersion,
          lockedAt: activeRelease.lockedAt,
        }
      : null,
    files: initial.map((file) => ({
      name: file.name,
      bytes: Buffer.byteLength(file.content),
      sha256: createHash("sha256").update(file.content).digest("hex"),
    })),
  }
  return [...initial, { name: "manifest.json", content: JSON.stringify(manifest, null, 2) }]
}

export function buildFactBookCsv(entries: FactBookEntry[]) {
  return [
    "fact_id,kind,title,status,field,value,evidence_id",
    ...entries.flatMap((fact) =>
      Object.entries(fact.fields).map(([field, value]) =>
        [fact.id, fact.kind, fact.title, fact.status, field, value, fact.evidenceId]
          .map(safeCsvCell)
          .join(",")
      )
    ),
  ].join("\r\n")
}

export function safeCsvCell(value: unknown) {
  const raw = String(value ?? "")
  const neutralized = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw
  return `"${neutralized.replaceAll('"', '""')}"`
}

function createZipArchive(files: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = encoder.encode(file.content)
    const crc = crc32(data)
    const local = zipHeader(0x04034b50, 30 + name.length)
    const localView = new DataView(local.buffer)
    localView.setUint16(4, 20, true)
    localView.setUint16(8, 0, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, data.length, true)
    localView.setUint32(22, data.length, true)
    localView.setUint16(26, name.length, true)
    local.set(name, 30)
    chunks.push(local, data)
    const entry = zipHeader(0x02014b50, 46 + name.length)
    const view = new DataView(entry.buffer)
    view.setUint16(4, 20, true)
    view.setUint16(6, 20, true)
    view.setUint32(16, crc, true)
    view.setUint32(20, data.length, true)
    view.setUint32(24, data.length, true)
    view.setUint16(28, name.length, true)
    view.setUint32(42, offset, true)
    entry.set(name, 46)
    central.push(entry)
    offset += local.length + data.length
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0)
  const end = zipHeader(0x06054b50, 22)
  const endView = new DataView(end.buffer)
  endView.setUint16(8, files.length, true)
  endView.setUint16(10, files.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)
  return Buffer.concat([...chunks, ...central, end])
}

function zipHeader(signature: number, size: number) {
  const bytes = new Uint8Array(size)
  new DataView(bytes.buffer).setUint32(0, signature, true)
  return bytes
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function evidenceCategory(value: unknown): EvidenceCategory {
  const categories: EvidenceCategory[] = [
    "identity",
    "manufacturing",
    "specification",
    "exposure",
    "safety_study",
    "regulatory",
    "other",
  ]
  return categories.includes(value as EvidenceCategory) ? (value as EvidenceCategory) : "other"
}

async function createEvidenceRecord(
  storage: ReturnType<typeof createConfiguredStorage>,
  input: Omit<
    DossierEvidence,
    "id" | "verificationStatus" | "excerpt" | "pageCount" | "createdAt" | "updatedAt"
  > & {
    bytes: Uint8Array
    requirements: DossierRequirement[]
  }
) {
  const extracted = await extractPdfText(input.bytes)
  validatePdfPageCount(extracted.pageCount)
  const now = new Date().toISOString()
  const mappedRequirement =
    input.requirementId === "auto"
      ? suggestDossierRequirement(extracted.text, input.requirements)
      : input.requirements.find((requirement) => requirement.id === input.requirementId)
  if (!mappedRequirement) throw new Error("No dossier requirement is available for this evidence")
  const evidenceId = randomUUID()
  const evidence: DossierEvidence = {
    id: evidenceId,
    ownerId: input.ownerId,
    dossierId: input.dossierId,
    requirementId: mappedRequirement.id,
    title: input.title,
    category: input.category,
    verificationStatus: "needs_review",
    artifact: input.artifact,
    excerpt: extracted.text.replace(/\s+/g, " ").trim().slice(0, 1800),
    pageCount: extracted.pageCount,
    createdAt: now,
    updatedAt: now,
  }
  return storage.addDossierEvidence(
    evidence,
    extracted.pages.map((page) => ({
      id: `${evidenceId}-page-${page.pageNumber}`,
      dossierId: input.dossierId,
      evidenceId,
      ownerId: input.ownerId,
      pageNumber: page.pageNumber,
      text: page.text.slice(0, 12_000),
      createdAt: now,
    }))
  )
}

function buildSectionStarter(part: string, title: string, dossier: DossierWorkspaceData) {
  const relevantRequirements = dossier.requirements.filter((item) => item.section === part)
  const relevantEvidence = dossier.evidence.filter((item) =>
    relevantRequirements.some((requirement) => requirement.id === item.requirementId)
  )
  const citations = relevantEvidence
    .filter((item) => item.verificationStatus === "verified")
    .map((item) => `${item.title} (${item.pageCount} pages)`)
  const verifiedClaims = dossier.claims.filter(
    (claim) =>
      claim.sectionId === dossier.sections.find((section) => section.part === part)?.id &&
      claim.status === "verified"
  )
  const intake = dossier.dossier.intake
  const factContext = dossier.factBookEntries
    .filter((fact) => fact.status === "verified")
    .map(
      (fact) =>
        `- ${fact.title}: ${Object.entries(fact.fields)
          .map(([key, value]) => `${key.replaceAll("_", " ")}=${value}`)
          .join("; ")}`
    )
    .join("\n")
  const baseClaimDraft =
    verifiedClaims.length > 0
      ? verifiedClaims.map((claim) => `${claim.statement} [[claim:${claim.id}]]`).join("\n\n")
      : "No verified claims are currently available for this section. Add and approve claims in the claim ledger before treating this draft as evidence-grounded."
  const claimDraft = `${baseClaimDraft}\n\n## Verified Fact Book context\n\n${factContext || "- No verified structured facts are available."}`
  return `# ${part}. ${title}\n\n${claimDraft}\n\n## Drafting context\n\nThe notified substance is ${intake.substanceName}. Its intended technical effect is ${intake.intendedEffect || "to be confirmed"}, and its proposed conditions of use are ${intake.intendedUses || "not yet fully specified"}. This context is intake information, not a verified scientific claim.\n\n## Drafting record\n\nThis working section was initialized from the verified dossier workspace. It requires regulatory-lead review before use.\n\n## Evidence mapped to this part\n\n${citations.length > 0 ? citations.map((citation) => `- ${citation}`).join("\n") : "- No verified evidence is currently mapped to this part."}\n\n## Open requirements\n\n${relevantRequirements.length > 0 ? relevantRequirements.map((item) => `- ${item.title}: ${item.status}`).join("\n") : "- No requirement rows are currently mapped to this part."}`
}

function validateUpload(file: FormDataEntryValue | FormDataEntryValue[] | undefined) {
  if (!isFile(file)) {
    return "Upload a PDF file to start an analysis."
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return "Only PDF uploads are supported for the MVP."
  }

  if (file.name.length > 255 || [...file.name].some((character) => character.charCodeAt(0) < 32)) {
    return "The PDF filename is invalid or too long."
  }

  if (file.type && file.type !== "application/pdf") {
    return "The selected file must be a PDF."
  }

  if (file.size <= 0) {
    return "The selected PDF is empty."
  }

  if (file.size > maxUploadBytes) {
    return "The selected PDF is over the 40 MB local MVP limit."
  }

  return null
}

function isFile(value: FormDataEntryValue | FormDataEntryValue[] | undefined): value is File {
  return (
    typeof File !== "undefined" && value instanceof File && typeof value.arrayBuffer === "function"
  )
}

function uploadInspectionError(bytes: Uint8Array) {
  const inspection = inspectPdfUpload(bytes)
  if (inspection.accepted) return null
  if (inspection.reason === "invalid_signature") {
    return "The uploaded file is not a valid PDF."
  }
  if (inspection.reason === "truncated") {
    return "The uploaded PDF appears incomplete or truncated."
  }
  if (inspection.reason === "encrypted") {
    return "Encrypted PDFs cannot be inspected safely. Upload an unencrypted copy."
  }
  return "This PDF contains active or embedded content that Greenlit does not accept."
}

function recordUploadRejection(context: Context) {
  recordSecurityEvent("upload_rejected", {
    method: context.req.method,
    route: redactedRequestPath(context.req.url),
    status: 400,
  })
}

function uploadPathPrefix(ownerId: string) {
  return `greenlit/uploads/${ownerId}/`
}

function safeUploadFileName(fileName: string) {
  const safe = path
    .basename(fileName)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe || "filing"}.pdf`
}

export function validatePdfPageCount(pageCount: number) {
  if (pageCount > maxPdfPages) {
    throw new Error(
      `This PDF has ${pageCount.toLocaleString()} pages. Greenlit currently supports filings up to ${maxPdfPages} pages.`
    )
  }
}

async function resolveVercelBlobArtifact(
  _ownerId: string,
  pathname: string,
  fileName: string
): Promise<ArtifactReference> {
  const blob = await head(pathname, {
    ...getBlobAuthOptions(),
  })

  if (
    blob.contentType !== "application/pdf" ||
    blob.size <= 0 ||
    blob.size > maxUploadBytes ||
    !blob.pathname.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error("Uploaded Blob is not a supported PDF.")
  }

  return {
    id: crypto.randomUUID(),
    fileName,
    mimeType: blob.contentType,
    size: blob.size,
    storageKey: blob.pathname,
    createdAt: blob.uploadedAt.toISOString(),
  }
}
