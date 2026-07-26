import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import type { Doc } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"

const analysisStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("failed")
)

const noteStatus = v.union(v.literal("open"), v.literal("in_progress"), v.literal("done"))

const analysisRecord = v.object({
  id: v.string(),
  ownerId: v.string(),
  filingName: v.string(),
  status: analysisStatus,
  upload: v.optional(v.any()),
  textArtifact: v.optional(v.any()),
  report: v.optional(v.any()),
  error: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
})
const analysisInput = analysisRecord.omit("ownerId")

const analysisUpdates = v.object({
  status: v.optional(analysisStatus),
  textArtifact: v.optional(v.any()),
  report: v.optional(v.any()),
  error: v.optional(v.union(v.string(), v.null())),
  updatedAt: v.optional(v.string()),
})

const workbookNote = v.object({
  id: v.string(),
  analysisId: v.string(),
  ownerId: v.string(),
  body: v.string(),
  status: noteStatus,
  createdAt: v.string(),
  updatedAt: v.string(),
})
const workbookNoteInput = workbookNote.omit("ownerId")

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx)
    const analyses = await ctx.db
      .query("analyses")
      .withIndex("by_owner_created_at", (index) => index.eq("ownerId", ownerId))
      .order("desc")
      .collect()

    return analyses.map(toAnalysisRecord)
  },
})

export const get = query({
  args: {
    analysisId: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const analysis = await getAnalysisDoc(ctx, args.analysisId)

    if (!analysis || analysis.ownerId !== ownerId) {
      return null
    }

    return toAnalysisRecord(analysis)
  },
})

export const getById = query({
  args: {
    analysisId: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const analysis = await getAnalysisDoc(ctx, args.analysisId)
    return analysis?.ownerId === ownerId ? toAnalysisRecord(analysis) : null
  },
})

export const create = mutation({
  args: {
    analysis: analysisInput,
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const existing = await getAnalysisDoc(ctx, args.analysis.id)

    if (existing) {
      throw new Error(`Analysis already exists: ${args.analysis.id}`)
    }

    await ctx.db.insert("analyses", {
      ...args.analysis,
      ownerId,
      readinessScore: readinessScoreFromReport(args.analysis.report),
    })

    return { ...args.analysis, ownerId }
  },
})

export const update = mutation({
  args: {
    analysisId: v.string(),
    updates: analysisUpdates,
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const analysis = await getAnalysisDoc(ctx, args.analysisId)

    if (!analysis || analysis.ownerId !== ownerId) {
      throw new Error(`Analysis not found: ${args.analysisId}`)
    }

    const patch: Partial<Doc<"analyses">> = {
      updatedAt: args.updates.updatedAt ?? new Date().toISOString(),
    }

    if (args.updates.status !== undefined) {
      patch.status = args.updates.status
    }

    if (args.updates.textArtifact !== undefined) {
      patch.textArtifact = args.updates.textArtifact
    }

    if (args.updates.report !== undefined) {
      patch.report = args.updates.report
      patch.readinessScore = readinessScoreFromReport(args.updates.report)
    }

    if (args.updates.error !== undefined) {
      patch.error = args.updates.error ?? undefined
    }

    await ctx.db.patch(analysis._id, patch)

    const updated = await ctx.db.get(analysis._id)
    if (!updated) {
      throw new Error(`Analysis not found after update: ${args.analysisId}`)
    }

    return toAnalysisRecord(updated)
  },
})

export const listNotes = query({
  args: {
    analysisId: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const analysis = await getAnalysisDoc(ctx, args.analysisId)
    if (!analysis || analysis.ownerId !== ownerId) throw new Error("Unauthorized")
    const notes = await ctx.db
      .query("workbookNotes")
      .withIndex("by_owner_analysis_created_at", (index) =>
        index.eq("ownerId", ownerId).eq("analysisId", args.analysisId)
      )
      .order("desc")
      .collect()

    return notes.map(toWorkbookNote)
  },
})

export const createNote = mutation({
  args: {
    note: workbookNoteInput,
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const analysis = await getAnalysisDoc(ctx, args.note.analysisId)
    if (!analysis || analysis.ownerId !== ownerId) throw new Error("Unauthorized")
    const note = { ...args.note, ownerId }
    await ctx.db.insert("workbookNotes", note)
    return note
  },
})

export const remove = mutation({
  args: {
    analysisId: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const analysis = await getAnalysisDoc(ctx, args.analysisId)
    if (!analysis || analysis.ownerId !== ownerId) throw new Error("Analysis not found")

    const notes = await ctx.db
      .query("workbookNotes")
      .withIndex("by_owner_analysis_created_at", (index) =>
        index.eq("ownerId", ownerId).eq("analysisId", args.analysisId)
      )
      .collect()

    await Promise.all(notes.map((note) => ctx.db.delete(note._id)))
    await ctx.db.delete(analysis._id)
    return { deleted: true }
  },
})

async function getAnalysisDoc(ctx: QueryCtx | MutationCtx, analysisId: string) {
  return await ctx.db
    .query("analyses")
    .withIndex("by_analysis_id", (index) => index.eq("id", analysisId))
    .first()
}

function toAnalysisRecord(doc: Doc<"analyses">) {
  const record: {
    id: string
    ownerId: string
    filingName: string
    status: "queued" | "running" | "complete" | "failed"
    upload?: unknown
    textArtifact?: unknown
    report?: unknown
    error?: string
    createdAt: string
    updatedAt: string
  } = {
    id: doc.id,
    ownerId: doc.ownerId,
    filingName: doc.filingName,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }

  if (doc.upload !== undefined) {
    record.upload = doc.upload
  }

  if (doc.textArtifact !== undefined) {
    record.textArtifact = doc.textArtifact
  }

  if (doc.report !== undefined) {
    record.report = doc.report
  }

  if (doc.error !== undefined) {
    record.error = doc.error
  }

  return record
}

function toWorkbookNote(doc: Doc<"workbookNotes">) {
  return {
    id: doc.id,
    analysisId: doc.analysisId,
    ownerId: doc.ownerId,
    body: doc.body,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function readinessScoreFromReport(report: unknown) {
  if (typeof report !== "object" || report === null || !("readinessScore" in report)) {
    return undefined
  }

  const score = report.readinessScore
  return typeof score === "number" ? score : undefined
}

async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("Not authenticated")
  return userId
}
