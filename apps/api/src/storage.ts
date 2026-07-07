import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { get, put } from "@vercel/blob"
import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import type {
  AnalysisRecord,
  ArtifactReference,
  ReadinessReport,
  WorkbookNote,
  WorkbookNoteStatus,
} from "../../../packages/core/src/index.js"

type Database = {
  analyses: AnalysisRecord[]
  notes: WorkbookNote[]
}

type CreateArtifactInput = {
  bytes: Uint8Array
  fileName: string
  mimeType: string
}

type ApiSecretArgs = {
  apiSecret: string
}

const blobAccess = "private" as const

const convexFunctions = {
  createAnalysis: makeFunctionReference<
    "mutation",
    { analysis: AnalysisRecord } & ApiSecretArgs,
    AnalysisRecord
  >("analyses:create"),
  createNote: makeFunctionReference<
    "mutation",
    { note: WorkbookNote } & ApiSecretArgs,
    WorkbookNote
  >("analyses:createNote"),
  getAnalysis: makeFunctionReference<
    "query",
    { ownerId: string; analysisId: string } & ApiSecretArgs,
    AnalysisRecord | null
  >("analyses:get"),
  getAnalysisById: makeFunctionReference<
    "query",
    { analysisId: string } & ApiSecretArgs,
    AnalysisRecord | null
  >("analyses:getById"),
  listAnalyses: makeFunctionReference<
    "query",
    { ownerId: string } & ApiSecretArgs,
    AnalysisRecord[]
  >("analyses:list"),
  listNotes: makeFunctionReference<
    "query",
    { ownerId: string; analysisId: string } & ApiSecretArgs,
    WorkbookNote[]
  >("analyses:listNotes"),
  updateAnalysis: makeFunctionReference<
    "mutation",
    {
      analysisId: string
      updates: Partial<Pick<AnalysisRecord, "status" | "textArtifact" | "report" | "updatedAt">> & {
        error?: string | null
      }
    } & ApiSecretArgs,
    AnalysisRecord
  >("analyses:update"),
}

export function defaultDataDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", ".local-data")
}

export function createConfiguredStorage(dataDir = defaultDataDir()) {
  if (process.env.GREENLIT_METADATA_DRIVER === "convex") {
    if (process.env.GREENLIT_STORAGE_DRIVER !== "vercel-blob") {
      throw new Error(
        "GREENLIT_METADATA_DRIVER=convex requires GREENLIT_STORAGE_DRIVER=vercel-blob"
      )
    }

    return createConvexBlobStorage()
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
      }
    } catch (error) {
      if (isNotFound(error)) {
        return {
          analyses: [],
          notes: [],
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

  return {
    createNote,
    createAnalysis,
    createArtifact,
    getAnalysis,
    getAnalysisById,
    listNotes,
    listAnalyses,
    readArtifact,
    setReport,
    updateAnalysis,
  }
}

export function createConvexBlobStorage() {
  const client = new ConvexHttpClient(requiredConvexUrl(), {
    logger: false,
  })
  const apiSecret = requiredConvexApiSecret()

  async function createArtifact(input: CreateArtifactInput): Promise<ArtifactReference> {
    const id = randomUUID()
    const extension = extensionForFile(input.fileName, input.mimeType)
    const storageKey = `greenlit/artifacts/${id}${extension}`

    await put(storageKey, Buffer.from(input.bytes), {
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

  async function readArtifact(artifact: ArtifactReference) {
    const result = await get(artifact.storageKey, {
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

    return client.mutation(
      convexFunctions.createAnalysis,
      { analysis, apiSecret },
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
        apiSecret,
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

  async function getAnalysis(ownerId: string, analysisId: string) {
    return client.query(convexFunctions.getAnalysis, { ownerId, analysisId, apiSecret })
  }

  async function getAnalysisById(analysisId: string) {
    return client.query(convexFunctions.getAnalysisById, { analysisId, apiSecret })
  }

  async function listAnalyses(ownerId: string) {
    return client.query(convexFunctions.listAnalyses, { ownerId, apiSecret })
  }

  async function listNotes(ownerId: string, analysisId: string) {
    return client.query(convexFunctions.listNotes, { ownerId, analysisId, apiSecret })
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

    return client.mutation(convexFunctions.createNote, { note, apiSecret }, { skipQueue: true })
  }

  return {
    createNote,
    createAnalysis,
    createArtifact,
    getAnalysis,
    getAnalysisById,
    listNotes,
    listAnalyses,
    readArtifact,
    setReport,
    updateAnalysis,
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

function requiredConvexApiSecret() {
  const secret = process.env.GREENLIT_CONVEX_API_SECRET

  if (!secret) {
    throw new Error("GREENLIT_METADATA_DRIVER=convex requires GREENLIT_CONVEX_API_SECRET")
  }

  return secret
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
