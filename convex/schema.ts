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
  dossiers: defineTable({
    id: v.string(),
    ownerId: v.string(),
    name: v.string(),
    status: v.union(
      v.literal("planning"),
      v.literal("collecting_evidence"),
      v.literal("drafting"),
      v.literal("review")
    ),
    intake: v.object({
      substanceName: v.string(),
      companyName: v.string(),
      substanceType: v.union(
        v.literal("fermentation"),
        v.literal("enzyme"),
        v.literal("protein"),
        v.literal("botanical"),
        v.literal("chemical"),
        v.literal("other")
      ),
      intendedEffect: v.string(),
      intendedUses: v.string(),
      manufacturingSummary: v.string(),
      targetPopulation: v.string(),
      grasBasis: v.literal("scientific_procedures"),
    }),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_dossier_id", ["id"])
    .index("by_owner_updated_at", ["ownerId", "updatedAt"]),
  dossierRequirements: defineTable({
    id: v.string(),
    dossierId: v.string(),
    ownerId: v.string(),
    section: v.string(),
    title: v.string(),
    guidance: v.string(),
    status: v.union(v.literal("missing"), v.literal("partial"), v.literal("ready")),
    evidenceCount: v.number(),
    blockingIssue: v.optional(v.string()),
    sortOrder: v.number(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_dossier_id_and_sort_order", ["dossierId", "sortOrder"])
    .index("by_owner_id_and_dossier_id", ["ownerId", "dossierId"]),
  dossierEvidence: defineTable({
    id: v.string(),
    dossierId: v.string(),
    ownerId: v.string(),
    requirementId: v.string(),
    title: v.string(),
    category: v.union(
      v.literal("identity"),
      v.literal("manufacturing"),
      v.literal("specification"),
      v.literal("exposure"),
      v.literal("safety_study"),
      v.literal("regulatory"),
      v.literal("other")
    ),
    verificationStatus: v.union(
      v.literal("needs_review"),
      v.literal("verified"),
      v.literal("rejected")
    ),
    artifact: v.any(),
    excerpt: v.string(),
    pageCount: v.number(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_evidence_id", ["id"])
    .index("by_dossier_id_and_created_at", ["dossierId", "createdAt"]),
  dossierEvidencePassages: defineTable({
    id: v.string(),
    dossierId: v.string(),
    evidenceId: v.string(),
    ownerId: v.string(),
    pageNumber: v.number(),
    text: v.string(),
    createdAt: v.string(),
  })
    .index("by_evidence_id_and_page_number", ["evidenceId", "pageNumber"])
    .index("by_dossier_id", ["dossierId"]),
  dossierSections: defineTable({
    id: v.string(),
    dossierId: v.string(),
    ownerId: v.string(),
    part: v.string(),
    title: v.string(),
    content: v.string(),
    status: v.union(
      v.literal("not_started"),
      v.literal("draft"),
      v.literal("in_review"),
      v.literal("approved")
    ),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_section_id", ["id"])
    .index("by_dossier_id_and_part", ["dossierId", "part"]),
  dossierClaims: defineTable({
    id: v.string(),
    dossierId: v.string(),
    ownerId: v.string(),
    sectionId: v.string(),
    requirementId: v.string(),
    evidenceId: v.string(),
    statement: v.string(),
    sourceExcerpt: v.string(),
    sourcePage: v.number(),
    status: v.union(v.literal("proposed"), v.literal("verified"), v.literal("rejected")),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_claim_id", ["id"])
    .index("by_dossier_id_and_created_at", ["dossierId", "createdAt"])
    .index("by_section_id_and_created_at", ["sectionId", "createdAt"]),
  dossierSectionVersions: defineTable({
    id: v.string(),
    dossierId: v.string(),
    sectionId: v.string(),
    ownerId: v.string(),
    content: v.string(),
    status: v.union(
      v.literal("not_started"),
      v.literal("draft"),
      v.literal("in_review"),
      v.literal("approved")
    ),
    version: v.number(),
    createdAt: v.string(),
  })
    .index("by_section_id_and_version", ["sectionId", "version"])
    .index("by_dossier_id", ["dossierId"]),
  dossierAuditEvents: defineTable({
    id: v.string(),
    dossierId: v.string(),
    ownerId: v.string(),
    action: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    summary: v.string(),
    createdAt: v.string(),
  }).index("by_dossier_id_and_created_at", ["dossierId", "createdAt"]),
  evidenceRequests: defineTable({
    id: v.string(),
    dossierId: v.string(),
    requirementId: v.string(),
    ownerId: v.string(),
    title: v.string(),
    detail: v.string(),
    priority: v.union(v.literal("blocking"), v.literal("high"), v.literal("normal")),
    status: v.union(
      v.literal("open"),
      v.literal("received"),
      v.literal("resolved"),
      v.literal("rejected")
    ),
    responseNote: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_request_id", ["id"])
    .index("by_dossier_id_and_updated_at", ["dossierId", "updatedAt"]),
  releaseAttestations: defineTable({
    id: v.string(),
    dossierId: v.string(),
    ownerId: v.string(),
    kind: v.union(
      v.literal("scientific_accuracy"),
      v.literal("source_traceability"),
      v.literal("regulatory_completeness"),
      v.literal("final_authorization")
    ),
    signerName: v.string(),
    signerRole: v.string(),
    statement: v.string(),
    status: v.union(v.literal("signed"), v.literal("revoked")),
    signedAt: v.string(),
    updatedAt: v.string(),
  }).index("by_dossier_id_and_updated_at", ["dossierId", "updatedAt"]),
  dossierReleases: defineTable({
    id: v.string(),
    dossierId: v.string(),
    ownerId: v.string(),
    status: v.union(v.literal("locked"), v.literal("unlocked")),
    qualitySnapshot: v.array(
      v.object({
        id: v.string(),
        severity: v.union(v.literal("blocker"), v.literal("warning"), v.literal("passed")),
        title: v.string(),
        detail: v.string(),
        target: v.string(),
      })
    ),
    packageVersion: v.number(),
    lockedAt: v.string(),
    unlockedAt: v.optional(v.string()),
    updatedAt: v.string(),
  }).index("by_dossier_id_and_updated_at", ["dossierId", "updatedAt"]),
  consultantHandoffs: defineTable({
    id: v.string(),
    dossierId: v.string(),
    ownerId: v.string(),
    consultantName: v.string(),
    consultantEmail: v.optional(v.string()),
    scope: v.string(),
    dueDate: v.optional(v.string()),
    status: v.union(
      v.literal("prepared"),
      v.literal("in_review"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    responseNote: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_dossier_id_and_updated_at", ["dossierId", "updatedAt"]),
  factBookEntries: defineTable({
    id: v.string(),
    dossierId: v.string(),
    ownerId: v.string(),
    kind: v.union(
      v.literal("identity"),
      v.literal("manufacturing"),
      v.literal("intended_use"),
      v.literal("exposure"),
      v.literal("specification"),
      v.literal("batch_result"),
      v.literal("safety_study")
    ),
    title: v.string(),
    fields: v.record(v.string(), v.string()),
    evidenceId: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("verified")),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_dossier_id_and_updated_at", ["dossierId", "updatedAt"]),
})
