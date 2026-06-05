import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  analyses: defineTable({
    ownerId: v.string(),
    filingName: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("complete"),
      v.literal("failed")
    ),
    readinessScore: v.optional(v.number()),
    reportArtifactId: v.optional(v.string()),
    uploadedFileArtifactId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_created_at", ["ownerId", "createdAt"])
    .index("by_owner_status", ["ownerId", "status"]),
  workbookNotes: defineTable({
    analysisId: v.id("analyses"),
    ownerId: v.string(),
    body: v.string(),
    status: v.union(v.literal("open"), v.literal("in_progress"), v.literal("done")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_analysis_created_at", ["analysisId", "createdAt"]),
})
