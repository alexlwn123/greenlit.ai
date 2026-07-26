import { authTables } from "@convex-dev/auth/server"
import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  ...authTables,
  analyses: defineTable({
    id: v.string(),
    ownerId: v.string(),
    filingName: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("complete"),
      v.literal("failed")
    ),
    upload: v.optional(v.any()),
    textArtifact: v.optional(v.any()),
    report: v.optional(v.any()),
    error: v.optional(v.string()),
    readinessScore: v.optional(v.number()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_analysis_id", ["id"])
    .index("by_owner_created_at", ["ownerId", "createdAt"])
    .index("by_owner_status", ["ownerId", "status"]),
  workbookNotes: defineTable({
    id: v.string(),
    analysisId: v.string(),
    ownerId: v.string(),
    body: v.string(),
    status: v.union(v.literal("open"), v.literal("in_progress"), v.literal("done")),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_analysis_created_at", ["analysisId", "createdAt"])
    .index("by_owner_analysis_created_at", ["ownerId", "analysisId", "createdAt"]),
})
