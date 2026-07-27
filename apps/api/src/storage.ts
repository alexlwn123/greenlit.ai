import { randomUUID } from "node:crypto"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { del, get, put } from "@vercel/blob"
import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import type {
  AnalysisRecord,
  ArtifactReference,
  ConsultantHandoff,
  DossierAuditEvent,
  DossierClaim,
  DossierEvidence,
  DossierEvidencePassage,
  DossierIntake,
  DossierRecord,
  DossierRelease,
  DossierRequirement,
  DossierSection,
  DossierSectionVersion,
  EvidenceRequest,
  FactBookEntry,
  ReadinessReport,
  ReleaseAttestation,
  WorkbookNote,
  WorkbookNoteStatus,
} from "../../../packages/core/src/index.js"
import { getBlobAuthOptions } from "./blob-auth.js"

type Database = {
  analyses: AnalysisRecord[]
  notes: WorkbookNote[]
  dossiers: DossierRecord[]
  dossierRequirements: DossierRequirement[]
  dossierEvidence: DossierEvidence[]
  dossierEvidencePassages: DossierEvidencePassage[]
  dossierSections: DossierSection[]
  dossierClaims: DossierClaim[]
  dossierAuditEvents: DossierAuditEvent[]
  dossierSectionVersions: DossierSectionVersion[]
  evidenceRequests: EvidenceRequest[]
  releaseAttestations: ReleaseAttestation[]
  dossierReleases: DossierRelease[]
  consultantHandoffs: ConsultantHandoff[]
  factBookEntries: FactBookEntry[]
}

type CreateArtifactInput = {
  bytes: Uint8Array
  fileName: string
  mimeType: string
}

const blobAccess = "private" as const

const convexFunctions = {
  createFactBookEntry: makeFunctionReference<
    "mutation",
    { fact: Omit<FactBookEntry, "ownerId"> },
    FactBookEntry
  >("dossiers:createFact"),
  reviewFactBookEntry: makeFunctionReference<
    "mutation",
    { factId: string; status: FactBookEntry["status"]; updatedAt: string },
    FactBookEntry
  >("dossiers:reviewFact"),
  removeFactBookEntry: makeFunctionReference<"mutation", { factId: string }, FactBookEntry>(
    "dossiers:removeFact"
  ),
  signReleaseAttestation: makeFunctionReference<
    "mutation",
    { attestation: Omit<ReleaseAttestation, "ownerId"> },
    ReleaseAttestation
  >("dossiers:signAttestation"),
  revokeReleaseAttestation: makeFunctionReference<
    "mutation",
    { attestationId: string; updatedAt: string },
    ReleaseAttestation
  >("dossiers:revokeAttestation"),
  lockDossierRelease: makeFunctionReference<
    "mutation",
    { release: Omit<DossierRelease, "ownerId" | "unlockedAt"> },
    DossierRelease
  >("dossiers:lockRelease"),
  unlockDossierRelease: makeFunctionReference<
    "mutation",
    { releaseId: string; updatedAt: string },
    DossierRelease
  >("dossiers:unlockRelease"),
  createConsultantHandoff: makeFunctionReference<
    "mutation",
    { handoff: Omit<ConsultantHandoff, "ownerId" | "responseNote"> },
    ConsultantHandoff
  >("dossiers:createHandoff"),
  updateConsultantHandoff: makeFunctionReference<
    "mutation",
    {
      handoffId: string
      status: ConsultantHandoff["status"]
      responseNote?: string
      updatedAt: string
    },
    ConsultantHandoff
  >("dossiers:updateHandoff"),
  createEvidenceRequest: makeFunctionReference<
    "mutation",
    { request: Omit<EvidenceRequest, "ownerId" | "responseNote"> },
    EvidenceRequest
  >("dossiers:createRequest"),
  createDossierClaim: makeFunctionReference<
    "mutation",
    { claim: Omit<DossierClaim, "ownerId"> },
    DossierClaim
  >("dossiers:createClaim"),
  addDossierEvidence: makeFunctionReference<
    "mutation",
    {
      evidence: Omit<DossierEvidence, "ownerId">
      passages: Omit<DossierEvidencePassage, "ownerId">[]
    },
    DossierEvidence
  >("dossiers:addEvidence"),
  createDossier: makeFunctionReference<
    "mutation",
    {
      dossier: Omit<DossierRecord, "ownerId">
      requirements: Omit<DossierRequirement, "ownerId">[]
      sections: Omit<DossierSection, "ownerId">[]
    },
    {
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
  >("dossiers:create"),
  getDossier: makeFunctionReference<
    "query",
    { dossierId: string },
    {
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
    } | null
  >("dossiers:get"),
  listDossiers: makeFunctionReference<"query", Record<string, never>, DossierRecord[]>(
    "dossiers:list"
  ),
  listEvidencePassages: makeFunctionReference<
    "query",
    { evidenceId: string },
    DossierEvidencePassage[]
  >("dossiers:listEvidencePassages"),
  listSectionVersions: makeFunctionReference<
    "query",
    { sectionId: string },
    DossierSectionVersion[]
  >("dossiers:listSectionVersions"),
  restoreSectionVersion: makeFunctionReference<
    "mutation",
    { sectionId: string; versionId: string; updatedAt: string },
    DossierSection
  >("dossiers:restoreSectionVersion"),
  reviewDossierClaim: makeFunctionReference<
    "mutation",
    { claimId: string; statement: string; status: "verified" | "rejected"; updatedAt: string },
    DossierClaim
  >("dossiers:reviewClaim"),
  removeDossierEvidence: makeFunctionReference<"mutation", { evidenceId: string }, DossierEvidence>(
    "dossiers:removeEvidence"
  ),
  removeDossierBatch: makeFunctionReference<
    "mutation",
    { dossierId: string },
    { done: boolean; storageKeys: string[] }
  >("dossiers:removeBatch"),
  updateDossierSection: makeFunctionReference<
    "mutation",
    {
      sectionId: string
      content: string
      status: "draft" | "in_review" | "approved"
      updatedAt: string
    },
    DossierSection
  >("dossiers:updateSection"),
  updateEvidenceRequest: makeFunctionReference<
    "mutation",
    {
      requestId: string
      status: EvidenceRequest["status"]
      responseNote?: string
      updatedAt: string
    },
    EvidenceRequest
  >("dossiers:updateRequest"),
  verifyDossierEvidence: makeFunctionReference<
    "mutation",
    { evidenceId: string; status: "verified" | "rejected"; updatedAt: string },
    DossierEvidence
  >("dossiers:verifyEvidence"),
  createAnalysis: makeFunctionReference<
    "mutation",
    { analysis: Omit<AnalysisRecord, "ownerId"> },
    AnalysisRecord
  >("analyses:create"),
  createNote: makeFunctionReference<
    "mutation",
    { note: Omit<WorkbookNote, "ownerId"> },
    WorkbookNote
  >("analyses:createNote"),
  deleteAnalysis: makeFunctionReference<"mutation", { analysisId: string }, { deleted: boolean }>(
    "analyses:remove"
  ),
  getAnalysis: makeFunctionReference<"query", { analysisId: string }, AnalysisRecord | null>(
    "analyses:get"
  ),
  getAnalysisById: makeFunctionReference<"query", { analysisId: string }, AnalysisRecord | null>(
    "analyses:getById"
  ),
  listAnalyses: makeFunctionReference<"query", Record<string, never>, AnalysisRecord[]>(
    "analyses:list"
  ),
  listNotes: makeFunctionReference<"query", { analysisId: string }, WorkbookNote[]>(
    "analyses:listNotes"
  ),
  updateAnalysis: makeFunctionReference<
    "mutation",
    {
      analysisId: string
      updates: Partial<Pick<AnalysisRecord, "status" | "textArtifact" | "report" | "updatedAt">> & {
        error?: string | null
      }
    },
    AnalysisRecord
  >("analyses:update"),
}

export function defaultDataDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", ".local-data")
}

export function createConfiguredStorage(dataDir = defaultDataDir(), authToken?: string) {
  if (process.env.GREENLIT_METADATA_DRIVER === "convex") {
    if (process.env.GREENLIT_STORAGE_DRIVER !== "vercel-blob") {
      throw new Error(
        "GREENLIT_METADATA_DRIVER=convex requires GREENLIT_STORAGE_DRIVER=vercel-blob"
      )
    }

    return createConvexBlobStorage(authToken)
  }

  if (process.env.GREENLIT_STORAGE_DRIVER === "vercel-blob") {
    throw new Error(
      "The Vercel Blob JSON metadata driver has been removed. Set GREENLIT_METADATA_DRIVER=convex."
    )
  }

  return createStorage(dataDir)
}

export function createStorage(dataDir = defaultDataDir()) {
  const artifactsDir = path.join(dataDir, "artifacts")
  const dbPath = path.join(dataDir, "db.json")

  async function ensureReady() {
    await mkdir(artifactsDir, { recursive: true })
  }

  async function readDatabase(): Promise<Database> {
    await ensureReady()

    try {
      const raw = await readFile(dbPath, "utf8")
      const parsed = JSON.parse(raw) as Partial<Database>
      return {
        analyses: parsed.analyses ?? [],
        notes: parsed.notes ?? [],
        dossiers: parsed.dossiers ?? [],
        dossierRequirements: parsed.dossierRequirements ?? [],
        dossierEvidence: parsed.dossierEvidence ?? [],
        dossierEvidencePassages: parsed.dossierEvidencePassages ?? [],
        dossierSections: parsed.dossierSections ?? [],
        dossierClaims: parsed.dossierClaims ?? [],
        dossierAuditEvents: parsed.dossierAuditEvents ?? [],
        dossierSectionVersions: parsed.dossierSectionVersions ?? [],
        evidenceRequests: parsed.evidenceRequests ?? [],
        releaseAttestations: parsed.releaseAttestations ?? [],
        dossierReleases: parsed.dossierReleases ?? [],
        consultantHandoffs: parsed.consultantHandoffs ?? [],
        factBookEntries: parsed.factBookEntries ?? [],
      }
    } catch (error) {
      if (isNotFound(error)) {
        return {
          analyses: [],
          notes: [],
          dossiers: [],
          dossierRequirements: [],
          dossierEvidence: [],
          dossierEvidencePassages: [],
          dossierSections: [],
          dossierClaims: [],
          dossierAuditEvents: [],
          dossierSectionVersions: [],
          evidenceRequests: [],
          releaseAttestations: [],
          dossierReleases: [],
          consultantHandoffs: [],
          factBookEntries: [],
        }
      }

      throw error
    }
  }

  async function writeDatabase(database: Database) {
    await ensureReady()
    await writeFile(dbPath, `${JSON.stringify(database, null, 2)}\n`, "utf8")
  }

  async function createArtifact(input: CreateArtifactInput): Promise<ArtifactReference> {
    await ensureReady()
    const id = randomUUID()
    const extension = extensionForFile(input.fileName, input.mimeType)
    const storageKey = `artifacts/${id}${extension}`
    const artifactPath = path.join(dataDir, storageKey)

    await writeFile(artifactPath, input.bytes)

    return {
      id,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
      storageKey,
      createdAt: new Date().toISOString(),
    }
  }

  async function readArtifact(artifact: ArtifactReference) {
    return readFile(path.join(dataDir, artifact.storageKey))
  }

  async function createAnalysis(input: {
    ownerId: string
    filingName: string
    upload: ArtifactReference
  }) {
    const database = await readDatabase()
    const now = new Date().toISOString()
    const analysis: AnalysisRecord = {
      id: randomUUID(),
      ownerId: input.ownerId,
      filingName: input.filingName,
      status: "queued",
      upload: input.upload,
      createdAt: now,
      updatedAt: now,
    }

    database.analyses.unshift(analysis)
    await writeDatabase(database)
    return analysis
  }

  async function createDossier(input: {
    ownerId: string
    id: string
    name: string
    intake: DossierIntake
    requirements: DossierRequirement[]
    sections: DossierSection[]
  }) {
    const database = await readDatabase()
    const now = new Date().toISOString()
    const dossier: DossierRecord = {
      id: input.id,
      ownerId: input.ownerId,
      name: input.name,
      status: "planning",
      intake: input.intake,
      createdAt: now,
      updatedAt: now,
    }
    database.dossiers.unshift(dossier)
    database.dossierRequirements.push(...input.requirements)
    database.dossierSections.push(...input.sections)
    pushAudit(
      database,
      input.ownerId,
      dossier.id,
      "dossier_created",
      "dossier",
      dossier.id,
      `Created ${dossier.name}`
    )
    await writeDatabase(database)
    return {
      dossier,
      requirements: input.requirements,
      evidence: [],
      sections: input.sections,
      claims: [],
      auditEvents: database.dossierAuditEvents.filter((event) => event.dossierId === dossier.id),
      evidenceRequests: [],
      attestations: [],
      releases: [],
      handoffs: [],
      factBookEntries: [],
    }
  }

  async function listDossiers(ownerId: string) {
    const database = await readDatabase()
    return database.dossiers
      .filter((dossier) => dossier.ownerId === ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async function getDossier(ownerId: string, dossierId: string) {
    const database = await readDatabase()
    const dossier = database.dossiers.find(
      (candidate) => candidate.id === dossierId && candidate.ownerId === ownerId
    )
    if (!dossier) return null
    return {
      dossier,
      requirements: database.dossierRequirements
        .filter((requirement) => requirement.dossierId === dossierId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      evidence: database.dossierEvidence
        .filter((item) => item.dossierId === dossierId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      sections: database.dossierSections
        .filter((section) => section.dossierId === dossierId)
        .sort((a, b) => a.part.localeCompare(b.part)),
      claims: database.dossierClaims
        .filter((claim) => claim.dossierId === dossierId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      auditEvents: database.dossierAuditEvents
        .filter((event) => event.dossierId === dossierId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 200),
      evidenceRequests: database.evidenceRequests
        .filter((request) => request.dossierId === dossierId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 200),
      attestations: database.releaseAttestations
        .filter((item) => item.dossierId === dossierId && item.ownerId === ownerId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 20),
      releases: database.dossierReleases
        .filter((item) => item.dossierId === dossierId && item.ownerId === ownerId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 20),
      handoffs: database.consultantHandoffs
        .filter((item) => item.dossierId === dossierId && item.ownerId === ownerId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 100),
      factBookEntries: database.factBookEntries
        .filter((item) => item.dossierId === dossierId && item.ownerId === ownerId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 500),
    }
  }

  async function addDossierEvidence(
    evidence: DossierEvidence,
    passages: DossierEvidencePassage[] = []
  ) {
    const database = await readDatabase()
    const dossier = database.dossiers.find(
      (item) => item.id === evidence.dossierId && item.ownerId === evidence.ownerId
    )
    if (!dossier) throw new Error("Dossier not found")
    const requirement = database.dossierRequirements.find(
      (item) => item.id === evidence.requirementId && item.ownerId === evidence.ownerId
    )
    if (!requirement) throw new Error("Requirement not found")
    database.dossierEvidence.unshift(evidence)
    database.dossierEvidencePassages.push(...passages)
    requirement.evidenceCount += 1
    requirement.status = "partial"
    requirement.blockingIssue = undefined
    requirement.updatedAt = evidence.updatedAt
    dossier.status = "collecting_evidence"
    dossier.updatedAt = evidence.updatedAt
    await writeDatabase(database)
    return evidence
  }

  async function listEvidencePassages(ownerId: string, evidenceId: string) {
    const database = await readDatabase()
    const evidence = database.dossierEvidence.find(
      (item) => item.id === evidenceId && item.ownerId === ownerId
    )
    if (!evidence) throw new Error("Evidence not found")
    return database.dossierEvidencePassages
      .filter((passage) => passage.evidenceId === evidenceId && passage.ownerId === ownerId)
      .sort((a, b) => a.pageNumber - b.pageNumber)
  }

  async function createDossierClaim(claim: DossierClaim) {
    const database = await readDatabase()
    const evidence = database.dossierEvidence.find(
      (item) =>
        item.id === claim.evidenceId &&
        item.ownerId === claim.ownerId &&
        item.verificationStatus === "verified"
    )
    if (!evidence) throw new Error("A claim requires verified evidence")
    const section = database.dossierSections.find(
      (item) => item.id === claim.sectionId && item.ownerId === claim.ownerId
    )
    if (!section) throw new Error("Section not found")
    database.dossierClaims.unshift(claim)
    await writeDatabase(database)
    return claim
  }

  async function reviewDossierClaim(
    ownerId: string,
    claimId: string,
    statement: string,
    status: "verified" | "rejected"
  ) {
    const database = await readDatabase()
    const claim = database.dossierClaims.find(
      (item) => item.id === claimId && item.ownerId === ownerId
    )
    if (!claim) throw new Error("Claim not found")
    claim.statement = statement
    claim.status = status
    claim.updatedAt = new Date().toISOString()
    await writeDatabase(database)
    return claim
  }

  async function verifyDossierEvidence(
    ownerId: string,
    evidenceId: string,
    status: "verified" | "rejected"
  ) {
    const database = await readDatabase()
    const evidence = database.dossierEvidence.find(
      (item) => item.id === evidenceId && item.ownerId === ownerId
    )
    if (!evidence) throw new Error("Evidence not found")
    evidence.verificationStatus = status
    evidence.updatedAt = new Date().toISOString()
    if (status === "verified") {
      const requirement = database.dossierRequirements.find(
        (item) => item.id === evidence.requirementId && item.ownerId === ownerId
      )
      if (requirement) {
        requirement.status = "ready"
        requirement.updatedAt = evidence.updatedAt
      }
    }
    await writeDatabase(database)
    return evidence
  }

  async function deleteDossierEvidence(ownerId: string, dossierId: string, evidenceId: string) {
    const database = await readDatabase()
    const evidence = database.dossierEvidence.find(
      (item) => item.id === evidenceId && item.dossierId === dossierId && item.ownerId === ownerId
    )
    if (!evidence) throw new Error("Evidence not found")
    try {
      await unlink(path.join(dataDir, evidence.artifact.storageKey))
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
    database.dossierEvidence = database.dossierEvidence.filter((item) => item.id !== evidenceId)
    database.dossierEvidencePassages = database.dossierEvidencePassages.filter(
      (passage) => passage.evidenceId !== evidenceId
    )
    database.dossierClaims = database.dossierClaims.filter(
      (claim) => claim.evidenceId !== evidenceId
    )
    const requirement = database.dossierRequirements.find(
      (item) => item.id === evidence.requirementId && item.ownerId === ownerId
    )
    if (requirement) {
      const remaining = database.dossierEvidence.filter(
        (item) => item.requirementId === requirement.id && item.ownerId === ownerId
      )
      requirement.evidenceCount = remaining.length
      requirement.status = remaining.some((item) => item.verificationStatus === "verified")
        ? "ready"
        : remaining.length > 0
          ? "partial"
          : "missing"
      requirement.blockingIssue =
        remaining.length > 0
          ? undefined
          : `Evidence has not yet been added for ${requirement.title.toLowerCase()}.`
      requirement.updatedAt = new Date().toISOString()
    }
    await writeDatabase(database)
    return true
  }

  async function deleteDossier(ownerId: string, dossierId: string) {
    const database = await readDatabase()
    const dossier = database.dossiers.find(
      (item) => item.id === dossierId && item.ownerId === ownerId
    )
    if (!dossier) return false
    const evidence = database.dossierEvidence.filter(
      (item) => item.dossierId === dossierId && item.ownerId === ownerId
    )
    for (const item of evidence) {
      try {
        await unlink(path.join(dataDir, item.artifact.storageKey))
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
    }
    database.dossiers = database.dossiers.filter((item) => item.id !== dossierId)
    database.dossierRequirements = database.dossierRequirements.filter(
      (item) => item.dossierId !== dossierId
    )
    database.dossierEvidence = database.dossierEvidence.filter(
      (item) => item.dossierId !== dossierId
    )
    database.dossierEvidencePassages = database.dossierEvidencePassages.filter(
      (item) => item.dossierId !== dossierId
    )
    database.dossierSections = database.dossierSections.filter(
      (item) => item.dossierId !== dossierId
    )
    database.dossierClaims = database.dossierClaims.filter((item) => item.dossierId !== dossierId)
    database.dossierAuditEvents = database.dossierAuditEvents.filter(
      (item) => item.dossierId !== dossierId
    )
    database.dossierSectionVersions = database.dossierSectionVersions.filter(
      (item) => item.dossierId !== dossierId
    )
    database.evidenceRequests = database.evidenceRequests.filter(
      (item) => item.dossierId !== dossierId
    )
    database.releaseAttestations = database.releaseAttestations.filter(
      (item) => item.dossierId !== dossierId
    )
    database.dossierReleases = database.dossierReleases.filter(
      (item) => item.dossierId !== dossierId
    )
    database.consultantHandoffs = database.consultantHandoffs.filter(
      (item) => item.dossierId !== dossierId
    )
    database.factBookEntries = database.factBookEntries.filter(
      (item) => item.dossierId !== dossierId
    )
    await writeDatabase(database)
    return true
  }

  async function updateDossierSection(input: {
    ownerId: string
    sectionId: string
    content: string
    status: "draft" | "in_review" | "approved"
  }) {
    const database = await readDatabase()
    const section = database.dossierSections.find(
      (item) => item.id === input.sectionId && item.ownerId === input.ownerId
    )
    if (!section) throw new Error("Section not found")
    section.content = input.content
    section.status = input.status
    section.updatedAt = new Date().toISOString()
    const previousVersion = database.dossierSectionVersions
      .filter((version) => version.sectionId === section.id)
      .sort((a, b) => b.version - a.version)[0]
    database.dossierSectionVersions.push({
      id: randomUUID(),
      dossierId: section.dossierId,
      sectionId: section.id,
      ownerId: input.ownerId,
      content: section.content,
      status: section.status,
      version: (previousVersion?.version ?? 0) + 1,
      createdAt: section.updatedAt,
    })
    const dossier = database.dossiers.find((item) => item.id === section.dossierId)
    if (dossier) {
      dossier.status = "drafting"
      dossier.updatedAt = section.updatedAt
    }
    pushAudit(
      database,
      input.ownerId,
      section.dossierId,
      input.status === "approved"
        ? "section_approved"
        : input.status === "in_review"
          ? "section_reviewed"
          : "section_saved",
      "section",
      section.id,
      `${section.part} saved as ${input.status.replaceAll("_", " ")}`
    )
    await writeDatabase(database)
    return section
  }

  async function createEvidenceRequest(request: EvidenceRequest) {
    const database = await readDatabase()
    const dossier = database.dossiers.find(
      (item) => item.id === request.dossierId && item.ownerId === request.ownerId
    )
    if (!dossier) throw new Error("Dossier not found")
    database.evidenceRequests.unshift(request)
    pushAudit(
      database,
      request.ownerId,
      request.dossierId,
      "request_created",
      "request",
      request.id,
      request.title
    )
    await writeDatabase(database)
    return request
  }

  async function listSectionVersions(ownerId: string, sectionId: string) {
    const database = await readDatabase()
    const section = database.dossierSections.find(
      (item) => item.id === sectionId && item.ownerId === ownerId
    )
    if (!section) throw new Error("Section not found")
    return database.dossierSectionVersions
      .filter((item) => item.sectionId === sectionId && item.ownerId === ownerId)
      .sort((a, b) => b.version - a.version)
      .slice(0, 100)
  }

  async function restoreSectionVersion(ownerId: string, sectionId: string, versionId: string) {
    const database = await readDatabase()
    const section = database.dossierSections.find(
      (item) => item.id === sectionId && item.ownerId === ownerId
    )
    const source = database.dossierSectionVersions.find(
      (item) => item.id === versionId && item.sectionId === sectionId && item.ownerId === ownerId
    )
    if (!section || !source) throw new Error("Section version not found")
    section.content = source.content
    section.status = "draft"
    section.updatedAt = new Date().toISOString()
    const version =
      Math.max(
        0,
        ...database.dossierSectionVersions
          .filter((item) => item.sectionId === sectionId)
          .map((item) => item.version)
      ) + 1
    database.dossierSectionVersions.push({
      ...source,
      id: randomUUID(),
      version,
      status: "draft",
      createdAt: section.updatedAt,
    })
    pushAudit(
      database,
      ownerId,
      section.dossierId,
      "section_restored",
      "section",
      section.id,
      `${section.part} restored from version ${source.version}`
    )
    await writeDatabase(database)
    return section
  }

  async function updateEvidenceRequest(
    ownerId: string,
    requestId: string,
    status: EvidenceRequest["status"],
    responseNote?: string
  ) {
    const database = await readDatabase()
    const request = database.evidenceRequests.find(
      (item) => item.id === requestId && item.ownerId === ownerId
    )
    if (!request) throw new Error("Evidence request not found")
    request.status = status
    request.responseNote = responseNote
    request.updatedAt = new Date().toISOString()
    if (status === "resolved") {
      pushAudit(
        database,
        ownerId,
        request.dossierId,
        "request_resolved",
        "request",
        request.id,
        request.title
      )
    }
    await writeDatabase(database)
    return request
  }

  async function signReleaseAttestation(attestation: ReleaseAttestation) {
    const database = await readDatabase()
    if (
      !database.dossiers.some(
        (item) => item.id === attestation.dossierId && item.ownerId === attestation.ownerId
      )
    )
      throw new Error("Dossier not found")
    for (const item of database.releaseAttestations.filter(
      (item) =>
        item.dossierId === attestation.dossierId &&
        item.kind === attestation.kind &&
        item.status === "signed"
    )) {
      item.status = "revoked"
      item.updatedAt = attestation.updatedAt
    }
    database.releaseAttestations.unshift(attestation)
    pushAudit(
      database,
      attestation.ownerId,
      attestation.dossierId,
      "attestation_signed",
      "attestation",
      attestation.id,
      `${attestation.signerName} signed ${attestation.kind.replaceAll("_", " ")}`
    )
    await writeDatabase(database)
    return attestation
  }

  async function revokeReleaseAttestation(ownerId: string, attestationId: string) {
    const database = await readDatabase()
    const item = database.releaseAttestations.find(
      (candidate) => candidate.id === attestationId && candidate.ownerId === ownerId
    )
    if (!item) throw new Error("Attestation not found")
    item.status = "revoked"
    item.updatedAt = new Date().toISOString()
    pushAudit(
      database,
      ownerId,
      item.dossierId,
      "attestation_revoked",
      "attestation",
      item.id,
      `${item.kind.replaceAll("_", " ")} attestation revoked`
    )
    await writeDatabase(database)
    return item
  }

  async function lockDossierRelease(release: DossierRelease) {
    const database = await readDatabase()
    if (release.qualitySnapshot.some((item) => item.severity === "blocker"))
      throw new Error("Blocking quality controls must be resolved before release")
    if (
      database.dossierReleases.some(
        (item) =>
          item.dossierId === release.dossierId &&
          item.ownerId === release.ownerId &&
          item.status === "locked"
      )
    )
      throw new Error("This dossier already has a locked release")
    const signed = new Set(
      database.releaseAttestations
        .filter(
          (item) =>
            item.dossierId === release.dossierId &&
            item.ownerId === release.ownerId &&
            item.status === "signed"
        )
        .map((item) => item.kind)
    )
    if (signed.size < 4) throw new Error("All four release attestations are required")
    database.dossierReleases.unshift(release)
    pushAudit(
      database,
      release.ownerId,
      release.dossierId,
      "release_locked",
      "dossier",
      release.id,
      `Release package v${release.packageVersion} locked`
    )
    await writeDatabase(database)
    return release
  }

  async function unlockDossierRelease(ownerId: string, releaseId: string) {
    const database = await readDatabase()
    const release = database.dossierReleases.find(
      (item) => item.id === releaseId && item.ownerId === ownerId
    )
    if (!release) throw new Error("Release not found")
    release.status = "unlocked"
    release.unlockedAt = new Date().toISOString()
    release.updatedAt = release.unlockedAt
    pushAudit(
      database,
      ownerId,
      release.dossierId,
      "release_unlocked",
      "dossier",
      release.id,
      `Release package v${release.packageVersion} unlocked for revision`
    )
    await writeDatabase(database)
    return release
  }

  async function createConsultantHandoff(handoff: ConsultantHandoff) {
    const database = await readDatabase()
    if (
      !database.dossiers.some(
        (item) => item.id === handoff.dossierId && item.ownerId === handoff.ownerId
      )
    )
      throw new Error("Dossier not found")
    database.consultantHandoffs.unshift(handoff)
    pushAudit(
      database,
      handoff.ownerId,
      handoff.dossierId,
      "handoff_created",
      "handoff",
      handoff.id,
      `Prepared handoff for ${handoff.consultantName}`
    )
    await writeDatabase(database)
    return handoff
  }

  async function createFactBookEntry(fact: FactBookEntry) {
    const database = await readDatabase()
    if (
      !database.dossiers.some((item) => item.id === fact.dossierId && item.ownerId === fact.ownerId)
    )
      throw new Error("Dossier not found")
    database.factBookEntries.unshift(fact)
    pushAudit(
      database,
      fact.ownerId,
      fact.dossierId,
      "fact_created",
      "fact",
      fact.id,
      `Added ${fact.title}`
    )
    await writeDatabase(database)
    return fact
  }

  async function reviewFactBookEntry(
    ownerId: string,
    factId: string,
    status: FactBookEntry["status"]
  ) {
    const database = await readDatabase()
    const fact = database.factBookEntries.find(
      (item) => item.id === factId && item.ownerId === ownerId
    )
    if (!fact) throw new Error("Fact not found")
    fact.status = status
    fact.updatedAt = new Date().toISOString()
    pushAudit(
      database,
      ownerId,
      fact.dossierId,
      status === "verified" ? "fact_verified" : "fact_reopened",
      "fact",
      fact.id,
      `${fact.title}: ${status}`
    )
    await writeDatabase(database)
    return fact
  }

  async function deleteFactBookEntry(ownerId: string, factId: string) {
    const database = await readDatabase()
    const fact = database.factBookEntries.find(
      (item) => item.id === factId && item.ownerId === ownerId
    )
    if (!fact) throw new Error("Fact not found")
    database.factBookEntries = database.factBookEntries.filter((item) => item.id !== factId)
    pushAudit(
      database,
      ownerId,
      fact.dossierId,
      "fact_removed",
      "fact",
      fact.id,
      `Removed ${fact.title}`
    )
    await writeDatabase(database)
    return true
  }

  async function updateConsultantHandoff(
    ownerId: string,
    handoffId: string,
    status: ConsultantHandoff["status"],
    responseNote?: string
  ) {
    const database = await readDatabase()
    const handoff = database.consultantHandoffs.find(
      (item) => item.id === handoffId && item.ownerId === ownerId
    )
    if (!handoff) throw new Error("Handoff not found")
    handoff.status = status
    handoff.responseNote = responseNote
    handoff.updatedAt = new Date().toISOString()
    const action =
      status === "in_review"
        ? "handoff_started"
        : status === "completed"
          ? "handoff_completed"
          : status === "cancelled"
            ? "handoff_cancelled"
            : "handoff_created"
    pushAudit(
      database,
      ownerId,
      handoff.dossierId,
      action,
      "handoff",
      handoff.id,
      `${handoff.consultantName}: ${status.replaceAll("_", " ")}`
    )
    await writeDatabase(database)
    return handoff
  }

  async function updateAnalysis(
    analysisId: string,
    updates: Partial<
      Pick<AnalysisRecord, "status" | "textArtifact" | "report" | "error" | "updatedAt">
    >
  ) {
    const database = await readDatabase()
    const index = database.analyses.findIndex((analysis) => analysis.id === analysisId)

    if (index === -1) {
      throw new Error(`Analysis not found: ${analysisId}`)
    }

    const current = database.analyses[index]
    const next: AnalysisRecord = {
      ...current,
      ...updates,
      updatedAt: updates.updatedAt ?? new Date().toISOString(),
    }

    database.analyses[index] = next
    await writeDatabase(database)
    return next
  }

  async function setReport(
    analysisId: string,
    report: ReadinessReport,
    textArtifact: ArtifactReference
  ) {
    return updateAnalysis(analysisId, {
      status: "complete",
      report,
      textArtifact,
      error: undefined,
    })
  }

  async function getAnalysis(ownerId: string, analysisId: string) {
    const database = await readDatabase()
    return database.analyses.find(
      (analysis) => analysis.ownerId === ownerId && analysis.id === analysisId
    )
  }

  async function getAnalysisById(analysisId: string) {
    const database = await readDatabase()
    return database.analyses.find((analysis) => analysis.id === analysisId)
  }

  async function listAnalyses(ownerId: string) {
    const database = await readDatabase()
    return database.analyses
      .filter((analysis) => analysis.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async function listNotes(ownerId: string, analysisId: string) {
    const database = await readDatabase()
    return database.notes
      .filter((note) => note.ownerId === ownerId && note.analysisId === analysisId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async function createNote(input: {
    ownerId: string
    analysisId: string
    body: string
    status?: WorkbookNoteStatus
  }) {
    const database = await readDatabase()
    const now = new Date().toISOString()
    const note: WorkbookNote = {
      id: randomUUID(),
      analysisId: input.analysisId,
      ownerId: input.ownerId,
      body: input.body,
      status: input.status ?? "open",
      createdAt: now,
      updatedAt: now,
    }

    database.notes.unshift(note)
    await writeDatabase(database)
    return note
  }

  async function deleteAnalysis(ownerId: string, analysisId: string) {
    const database = await readDatabase()
    const analysis = database.analyses.find(
      (candidate) => candidate.ownerId === ownerId && candidate.id === analysisId
    )
    if (!analysis) return false

    for (const artifact of [analysis.upload, analysis.textArtifact]) {
      if (!artifact) continue
      try {
        await unlink(path.join(dataDir, artifact.storageKey))
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
    }

    database.analyses = database.analyses.filter((candidate) => candidate.id !== analysisId)
    database.notes = database.notes.filter((note) => note.analysisId !== analysisId)
    await writeDatabase(database)
    return true
  }

  return {
    addDossierEvidence,
    createConsultantHandoff,
    createDossier,
    createDossierClaim,
    createEvidenceRequest,
    createFactBookEntry,
    createNote,
    createAnalysis,
    createArtifact,
    deleteDossierEvidence,
    deleteDossier,
    deleteFactBookEntry,
    deleteAnalysis,
    getAnalysis,
    getAnalysisById,
    getDossier,
    listNotes,
    listAnalyses,
    listDossiers,
    listEvidencePassages,
    listSectionVersions,
    readArtifact,
    restoreSectionVersion,
    signReleaseAttestation,
    revokeReleaseAttestation,
    lockDossierRelease,
    unlockDossierRelease,
    setReport,
    updateAnalysis,
    updateDossierSection,
    updateEvidenceRequest,
    updateConsultantHandoff,
    verifyDossierEvidence,
    reviewDossierClaim,
    reviewFactBookEntry,
  }
}

export function createConvexBlobStorage(authToken?: string) {
  const client = new ConvexHttpClient(requiredConvexUrl(), {
    logger: false,
  })
  if (authToken) client.setAuth(authToken)

  async function createArtifact(input: CreateArtifactInput): Promise<ArtifactReference> {
    const id = randomUUID()
    const extension = extensionForFile(input.fileName, input.mimeType)
    const storageKey = `greenlit/artifacts/${id}${extension}`

    await put(storageKey, Buffer.from(input.bytes), {
      ...getBlobAuthOptions(),
      access: blobAccess,
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: input.mimeType,
    })

    return {
      id,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
      storageKey,
      createdAt: new Date().toISOString(),
    }
  }

  async function createDossier(input: {
    ownerId: string
    id: string
    name: string
    intake: DossierIntake
    requirements: DossierRequirement[]
    sections: DossierSection[]
  }) {
    const now = new Date().toISOString()
    return client.mutation(
      convexFunctions.createDossier,
      {
        dossier: {
          id: input.id,
          name: input.name,
          status: "planning",
          intake: input.intake,
          createdAt: now,
          updatedAt: now,
        },
        requirements: input.requirements.map(
          ({ ownerId: _ownerId, ...requirement }) => requirement
        ),
        sections: input.sections.map(({ ownerId: _ownerId, ...section }) => section),
      },
      { skipQueue: true }
    )
  }

  async function listDossiers(_ownerId: string) {
    return client.query(convexFunctions.listDossiers, {})
  }

  async function getDossier(_ownerId: string, dossierId: string) {
    return client.query(convexFunctions.getDossier, { dossierId })
  }

  async function addDossierEvidence(
    evidence: DossierEvidence,
    passages: DossierEvidencePassage[] = []
  ) {
    const { ownerId: _ownerId, ...authenticatedEvidence } = evidence
    return client.mutation(
      convexFunctions.addDossierEvidence,
      {
        evidence: authenticatedEvidence,
        passages: passages.map(({ ownerId: _passageOwnerId, ...passage }) => passage),
      },
      { skipQueue: true }
    )
  }

  async function listEvidencePassages(_ownerId: string, evidenceId: string) {
    return client.query(convexFunctions.listEvidencePassages, { evidenceId })
  }

  async function createDossierClaim(claim: DossierClaim) {
    const { ownerId: _ownerId, ...authenticatedClaim } = claim
    return client.mutation(
      convexFunctions.createDossierClaim,
      { claim: authenticatedClaim },
      { skipQueue: true }
    )
  }

  async function createEvidenceRequest(request: EvidenceRequest) {
    const { ownerId: _ownerId, responseNote: _responseNote, ...input } = request
    return client.mutation(
      convexFunctions.createEvidenceRequest,
      { request: input },
      { skipQueue: true }
    )
  }

  async function updateEvidenceRequest(
    _ownerId: string,
    requestId: string,
    status: EvidenceRequest["status"],
    responseNote?: string
  ) {
    return client.mutation(
      convexFunctions.updateEvidenceRequest,
      { requestId, status, responseNote, updatedAt: new Date().toISOString() },
      { skipQueue: true }
    )
  }

  async function signReleaseAttestation(attestation: ReleaseAttestation) {
    const { ownerId: _ownerId, ...input } = attestation
    return client.mutation(
      convexFunctions.signReleaseAttestation,
      { attestation: input },
      { skipQueue: true }
    )
  }

  async function revokeReleaseAttestation(_ownerId: string, attestationId: string) {
    return client.mutation(
      convexFunctions.revokeReleaseAttestation,
      { attestationId, updatedAt: new Date().toISOString() },
      { skipQueue: true }
    )
  }

  async function lockDossierRelease(release: DossierRelease) {
    const { ownerId: _ownerId, unlockedAt: _unlockedAt, ...input } = release
    return client.mutation(
      convexFunctions.lockDossierRelease,
      { release: input },
      { skipQueue: true }
    )
  }

  async function unlockDossierRelease(_ownerId: string, releaseId: string) {
    return client.mutation(
      convexFunctions.unlockDossierRelease,
      { releaseId, updatedAt: new Date().toISOString() },
      { skipQueue: true }
    )
  }

  async function createConsultantHandoff(handoff: ConsultantHandoff) {
    const { ownerId: _ownerId, responseNote: _responseNote, ...input } = handoff
    return client.mutation(
      convexFunctions.createConsultantHandoff,
      { handoff: input },
      { skipQueue: true }
    )
  }

  async function updateConsultantHandoff(
    _ownerId: string,
    handoffId: string,
    status: ConsultantHandoff["status"],
    responseNote?: string
  ) {
    return client.mutation(
      convexFunctions.updateConsultantHandoff,
      { handoffId, status, responseNote, updatedAt: new Date().toISOString() },
      { skipQueue: true }
    )
  }

  async function createFactBookEntry(fact: FactBookEntry) {
    const { ownerId: _ownerId, ...input } = fact
    return client.mutation(
      convexFunctions.createFactBookEntry,
      { fact: input },
      { skipQueue: true }
    )
  }

  async function reviewFactBookEntry(
    _ownerId: string,
    factId: string,
    status: FactBookEntry["status"]
  ) {
    return client.mutation(
      convexFunctions.reviewFactBookEntry,
      { factId, status, updatedAt: new Date().toISOString() },
      { skipQueue: true }
    )
  }

  async function deleteFactBookEntry(_ownerId: string, factId: string) {
    await client.mutation(convexFunctions.removeFactBookEntry, { factId }, { skipQueue: true })
    return true
  }

  async function reviewDossierClaim(
    _ownerId: string,
    claimId: string,
    statement: string,
    status: "verified" | "rejected"
  ) {
    return client.mutation(
      convexFunctions.reviewDossierClaim,
      { claimId, statement, status, updatedAt: new Date().toISOString() },
      { skipQueue: true }
    )
  }

  async function verifyDossierEvidence(
    _ownerId: string,
    evidenceId: string,
    status: "verified" | "rejected"
  ) {
    return client.mutation(
      convexFunctions.verifyDossierEvidence,
      { evidenceId, status, updatedAt: new Date().toISOString() },
      { skipQueue: true }
    )
  }

  async function deleteDossierEvidence(_ownerId: string, dossierId: string, evidenceId: string) {
    const workspace = await client.query(convexFunctions.getDossier, { dossierId })
    const evidence = workspace?.evidence.find((item) => item.id === evidenceId)
    if (!evidence) throw new Error("Evidence not found")
    await client.mutation(
      convexFunctions.removeDossierEvidence,
      { evidenceId },
      { skipQueue: true }
    )
    if (typeof evidence.artifact?.storageKey === "string") {
      await del(evidence.artifact.storageKey, getBlobAuthOptions())
    }
    return true
  }

  async function deleteDossier(_ownerId: string, dossierId: string) {
    for (let batch = 0; batch < 100; batch += 1) {
      const result = await client.mutation(
        convexFunctions.removeDossierBatch,
        { dossierId },
        { skipQueue: true }
      )
      if (result.storageKeys.length > 0) await del(result.storageKeys, getBlobAuthOptions())
      if (result.done) return true
    }
    throw new Error("Dossier deletion exceeded the safe batch limit; retry to continue.")
  }

  async function updateDossierSection(input: {
    ownerId: string
    sectionId: string
    content: string
    status: "draft" | "in_review" | "approved"
  }) {
    return client.mutation(
      convexFunctions.updateDossierSection,
      {
        sectionId: input.sectionId,
        content: input.content,
        status: input.status,
        updatedAt: new Date().toISOString(),
      },
      { skipQueue: true }
    )
  }

  async function listSectionVersions(_ownerId: string, sectionId: string) {
    return client.query(convexFunctions.listSectionVersions, { sectionId })
  }

  async function restoreSectionVersion(_ownerId: string, sectionId: string, versionId: string) {
    return client.mutation(
      convexFunctions.restoreSectionVersion,
      { sectionId, versionId, updatedAt: new Date().toISOString() },
      { skipQueue: true }
    )
  }

  async function readArtifact(artifact: ArtifactReference) {
    const result = await get(artifact.storageKey, {
      ...getBlobAuthOptions(),
      access: blobAccess,
      useCache: false,
    })
    if (!result?.stream) {
      throw new Error(`Artifact not found: ${artifact.storageKey}`)
    }

    return Buffer.from(await streamToUint8Array(result.stream))
  }

  async function createAnalysis(input: {
    ownerId: string
    filingName: string
    upload: ArtifactReference
  }) {
    const now = new Date().toISOString()
    const analysis: AnalysisRecord = {
      id: randomUUID(),
      ownerId: input.ownerId,
      filingName: input.filingName,
      status: "queued",
      upload: input.upload,
      createdAt: now,
      updatedAt: now,
    }

    const { ownerId: _ownerId, ...authenticatedAnalysis } = analysis
    return client.mutation(
      convexFunctions.createAnalysis,
      { analysis: authenticatedAnalysis },
      { skipQueue: true }
    )
  }

  async function updateAnalysis(
    analysisId: string,
    updates: Partial<
      Pick<AnalysisRecord, "status" | "textArtifact" | "report" | "error" | "updatedAt">
    >
  ) {
    return client.mutation(
      convexFunctions.updateAnalysis,
      {
        analysisId,
        updates: toConvexAnalysisUpdates(updates),
      },
      { skipQueue: true }
    )
  }

  async function setReport(
    analysisId: string,
    report: ReadinessReport,
    textArtifact: ArtifactReference
  ) {
    return updateAnalysis(analysisId, {
      status: "complete",
      report,
      textArtifact,
      error: undefined,
    })
  }

  async function getAnalysis(_ownerId: string, analysisId: string) {
    return client.query(convexFunctions.getAnalysis, { analysisId })
  }

  async function getAnalysisById(analysisId: string) {
    return client.query(convexFunctions.getAnalysisById, { analysisId })
  }

  async function listAnalyses(_ownerId: string) {
    return client.query(convexFunctions.listAnalyses, {})
  }

  async function listNotes(_ownerId: string, analysisId: string) {
    return client.query(convexFunctions.listNotes, { analysisId })
  }

  async function createNote(input: {
    ownerId: string
    analysisId: string
    body: string
    status?: WorkbookNoteStatus
  }) {
    const now = new Date().toISOString()
    const note: WorkbookNote = {
      id: randomUUID(),
      analysisId: input.analysisId,
      ownerId: input.ownerId,
      body: input.body,
      status: input.status ?? "open",
      createdAt: now,
      updatedAt: now,
    }

    const { ownerId: _ownerId, ...authenticatedNote } = note
    return client.mutation(
      convexFunctions.createNote,
      { note: authenticatedNote },
      { skipQueue: true }
    )
  }

  async function deleteAnalysis(_ownerId: string, analysisId: string) {
    const analysis = await client.query(convexFunctions.getAnalysis, { analysisId })
    if (!analysis) return false

    const storageKeys = [analysis.upload?.storageKey, analysis.textArtifact?.storageKey].filter(
      (storageKey): storageKey is string => typeof storageKey === "string"
    )
    if (storageKeys.length > 0) {
      await del(storageKeys, getBlobAuthOptions())
    }
    await client.mutation(convexFunctions.deleteAnalysis, { analysisId }, { skipQueue: true })
    return true
  }

  return {
    addDossierEvidence,
    createDossier,
    createDossierClaim,
    createEvidenceRequest,
    createNote,
    createAnalysis,
    createArtifact,
    deleteDossierEvidence,
    deleteDossier,
    deleteAnalysis,
    getAnalysis,
    getAnalysisById,
    getDossier,
    listNotes,
    listAnalyses,
    listDossiers,
    listEvidencePassages,
    readArtifact,
    listSectionVersions,
    restoreSectionVersion,
    createFactBookEntry,
    deleteFactBookEntry,
    createConsultantHandoff,
    signReleaseAttestation,
    revokeReleaseAttestation,
    lockDossierRelease,
    unlockDossierRelease,
    setReport,
    updateAnalysis,
    updateDossierSection,
    updateEvidenceRequest,
    updateConsultantHandoff,
    verifyDossierEvidence,
    reviewDossierClaim,
    reviewFactBookEntry,
  }
}

function extensionForFile(fileName: string, mimeType: string) {
  const extension = path.extname(fileName)
  if (extension) {
    return extension
  }

  if (mimeType === "application/pdf") {
    return ".pdf"
  }

  if (mimeType.startsWith("text/")) {
    return ".txt"
  }

  return ".bin"
}

function pushAudit(
  database: Database,
  ownerId: string,
  dossierId: string,
  action: DossierAuditEvent["action"],
  targetType: DossierAuditEvent["targetType"],
  targetId: string,
  summary: string
) {
  database.dossierAuditEvents.unshift({
    id: randomUUID(),
    dossierId,
    ownerId,
    action,
    targetType,
    targetId,
    summary,
    createdAt: new Date().toISOString(),
  })
}

function isNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  )
}

function requiredConvexUrl() {
  const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL

  if (!url) {
    throw new Error("GREENLIT_METADATA_DRIVER=convex requires CONVEX_URL or VITE_CONVEX_URL")
  }

  return url
}

function toConvexAnalysisUpdates(
  updates: Partial<
    Pick<AnalysisRecord, "status" | "textArtifact" | "report" | "error" | "updatedAt">
  >
) {
  const next: Partial<Pick<AnalysisRecord, "status" | "textArtifact" | "report" | "updatedAt">> & {
    error?: string | null
  } = {}

  if (updates.status !== undefined) {
    next.status = updates.status
  }

  if (updates.textArtifact !== undefined) {
    next.textArtifact = updates.textArtifact
  }

  if (updates.report !== undefined) {
    next.report = updates.report
  }

  if (updates.updatedAt !== undefined) {
    next.updatedAt = updates.updatedAt
  }

  if ("error" in updates) {
    next.error = updates.error ?? null
  }

  return next
}

async function streamToUint8Array(stream: ReadableStream<Uint8Array>) {
  const chunks: Uint8Array[] = []
  const reader = stream.getReader()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const bytes = new Uint8Array(size)
  let offset = 0

  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return bytes
}
