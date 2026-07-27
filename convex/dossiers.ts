import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"

const intake = v.object({
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
})

const dossierInput = v.object({
  id: v.string(),
  name: v.string(),
  status: v.literal("planning"),
  intake,
  createdAt: v.string(),
  updatedAt: v.string(),
})

const requirementInput = v.object({
  id: v.string(),
  dossierId: v.string(),
  section: v.string(),
  title: v.string(),
  guidance: v.string(),
  status: v.literal("missing"),
  evidenceCount: v.number(),
  blockingIssue: v.optional(v.string()),
  sortOrder: v.number(),
  createdAt: v.string(),
  updatedAt: v.string(),
})

const sectionInput = v.object({
  id: v.string(),
  dossierId: v.string(),
  part: v.string(),
  title: v.string(),
  content: v.string(),
  status: v.literal("not_started"),
  createdAt: v.string(),
  updatedAt: v.string(),
})

const evidenceInput = v.object({
  id: v.string(),
  dossierId: v.string(),
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
  verificationStatus: v.literal("needs_review"),
  artifact: v.any(),
  excerpt: v.string(),
  pageCount: v.number(),
  createdAt: v.string(),
  updatedAt: v.string(),
})

const evidencePassageInput = v.object({
  id: v.string(),
  dossierId: v.string(),
  evidenceId: v.string(),
  pageNumber: v.number(),
  text: v.string(),
  createdAt: v.string(),
})

const claimInput = v.object({
  id: v.string(),
  dossierId: v.string(),
  sectionId: v.string(),
  requirementId: v.string(),
  evidenceId: v.string(),
  statement: v.string(),
  sourceExcerpt: v.string(),
  sourcePage: v.number(),
  status: v.literal("proposed"),
  createdAt: v.string(),
  updatedAt: v.string(),
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx)
    return await ctx.db
      .query("dossiers")
      .withIndex("by_owner_updated_at", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(100)
  },
})

export const get = query({
  args: { dossierId: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const dossier = await getDossier(ctx, args.dossierId)
    if (!dossier || dossier.ownerId !== ownerId) return null
    const requirements = await ctx.db
      .query("dossierRequirements")
      .withIndex("by_dossier_id_and_sort_order", (q) => q.eq("dossierId", args.dossierId))
      .take(100)
    const evidence = await ctx.db
      .query("dossierEvidence")
      .withIndex("by_dossier_id_and_created_at", (q) => q.eq("dossierId", args.dossierId))
      .order("desc")
      .take(200)
    const sections = await ctx.db
      .query("dossierSections")
      .withIndex("by_dossier_id_and_part", (q) => q.eq("dossierId", args.dossierId))
      .take(20)
    const claims = await ctx.db
      .query("dossierClaims")
      .withIndex("by_dossier_id_and_created_at", (q) => q.eq("dossierId", args.dossierId))
      .order("desc")
      .take(500)
    const auditEvents = await ctx.db
      .query("dossierAuditEvents")
      .withIndex("by_dossier_id_and_created_at", (q) => q.eq("dossierId", args.dossierId))
      .order("desc")
      .take(200)
    const evidenceRequests = await ctx.db
      .query("evidenceRequests")
      .withIndex("by_dossier_id_and_updated_at", (q) => q.eq("dossierId", args.dossierId))
      .order("desc")
      .take(200)
    const attestations = await ctx.db
      .query("releaseAttestations")
      .withIndex("by_dossier_id_and_updated_at", (q) => q.eq("dossierId", args.dossierId))
      .order("desc")
      .take(20)
    const releases = await ctx.db
      .query("dossierReleases")
      .withIndex("by_dossier_id_and_updated_at", (q) => q.eq("dossierId", args.dossierId))
      .order("desc")
      .take(20)
    const handoffs = await ctx.db
      .query("consultantHandoffs")
      .withIndex("by_dossier_id_and_updated_at", (q) => q.eq("dossierId", args.dossierId))
      .order("desc")
      .take(100)
    const factBookEntries = await ctx.db
      .query("factBookEntries")
      .withIndex("by_dossier_id_and_updated_at", (q) => q.eq("dossierId", args.dossierId))
      .order("desc")
      .take(500)
    return {
      dossier,
      requirements,
      evidence,
      sections,
      claims,
      auditEvents,
      evidenceRequests,
      attestations,
      releases,
      handoffs,
      factBookEntries,
    }
  },
})

export const create = mutation({
  args: {
    dossier: dossierInput,
    requirements: v.array(requirementInput),
    sections: v.array(sectionInput),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    if (await getDossier(ctx, args.dossier.id)) throw new Error("Dossier already exists")
    await ctx.db.insert("dossiers", { ...args.dossier, ownerId })
    for (const requirement of args.requirements) {
      await ctx.db.insert("dossierRequirements", { ...requirement, ownerId })
    }
    for (const section of args.sections) {
      await ctx.db.insert("dossierSections", { ...section, ownerId })
    }
    await addAudit(
      ctx,
      ownerId,
      args.dossier.id,
      "dossier_created",
      "dossier",
      args.dossier.id,
      `Created ${args.dossier.name}`
    )
    return {
      dossier: { ...args.dossier, ownerId },
      requirements: args.requirements.map((requirement) => ({ ...requirement, ownerId })),
      evidence: [],
      sections: args.sections.map((section) => ({ ...section, ownerId })),
      claims: [],
      auditEvents: [],
      evidenceRequests: [],
      attestations: [],
      releases: [],
      handoffs: [],
      factBookEntries: [],
    }
  },
})

export const createClaim = mutation({
  args: { claim: claimInput },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    await ensureUnlocked(ctx, args.claim.dossierId)
    const dossier = await getDossier(ctx, args.claim.dossierId)
    if (!dossier || dossier.ownerId !== ownerId) throw new Error("Dossier not found")
    const evidence = await ctx.db
      .query("dossierEvidence")
      .withIndex("by_evidence_id", (q) => q.eq("id", args.claim.evidenceId))
      .unique()
    if (!evidence || evidence.ownerId !== ownerId || evidence.verificationStatus !== "verified") {
      throw new Error("A claim requires verified evidence")
    }
    const section = await ctx.db
      .query("dossierSections")
      .withIndex("by_section_id", (q) => q.eq("id", args.claim.sectionId))
      .unique()
    if (!section || section.ownerId !== ownerId || section.dossierId !== args.claim.dossierId) {
      throw new Error("Section not found")
    }
    const claim = { ...args.claim, ownerId }
    await ctx.db.insert("dossierClaims", claim)
    await addAudit(
      ctx,
      ownerId,
      claim.dossierId,
      "claim_proposed",
      "claim",
      claim.id,
      claim.statement
    )
    return claim
  },
})

export const reviewClaim = mutation({
  args: {
    claimId: v.string(),
    statement: v.string(),
    status: v.union(v.literal("verified"), v.literal("rejected")),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const claim = await ctx.db
      .query("dossierClaims")
      .withIndex("by_claim_id", (q) => q.eq("id", args.claimId))
      .unique()
    if (!claim || claim.ownerId !== ownerId) throw new Error("Claim not found")
    await ensureUnlocked(ctx, claim.dossierId)
    await ctx.db.patch(claim._id, {
      statement: args.statement,
      status: args.status,
      updatedAt: args.updatedAt,
    })
    await addAudit(
      ctx,
      ownerId,
      claim.dossierId,
      args.status === "verified" ? "claim_verified" : "claim_rejected",
      "claim",
      claim.id,
      args.statement
    )
    return { ...claim, statement: args.statement, status: args.status, updatedAt: args.updatedAt }
  },
})

export const addEvidence = mutation({
  args: { evidence: evidenceInput, passages: v.array(evidencePassageInput) },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const dossier = await getDossier(ctx, args.evidence.dossierId)
    if (!dossier || dossier.ownerId !== ownerId) throw new Error("Dossier not found")
    await ensureUnlocked(ctx, args.evidence.dossierId)
    const requirement = await ctx.db
      .query("dossierRequirements")
      .withIndex("by_dossier_id_and_sort_order", (q) => q.eq("dossierId", args.evidence.dossierId))
      .filter((q) => q.eq(q.field("id"), args.evidence.requirementId))
      .first()
    if (!requirement || requirement.ownerId !== ownerId) throw new Error("Requirement not found")
    const evidence = { ...args.evidence, ownerId }
    await ctx.db.insert("dossierEvidence", evidence)
    for (const passage of args.passages) {
      if (passage.evidenceId !== evidence.id || passage.dossierId !== evidence.dossierId) {
        throw new Error("Evidence passage does not match its source")
      }
      await ctx.db.insert("dossierEvidencePassages", { ...passage, ownerId })
    }
    await ctx.db.patch(requirement._id, {
      evidenceCount: requirement.evidenceCount + 1,
      status: "partial",
      blockingIssue: undefined,
      updatedAt: args.evidence.updatedAt,
    })
    await ctx.db.patch(dossier._id, {
      status: "collecting_evidence",
      updatedAt: args.evidence.updatedAt,
    })
    await addAudit(
      ctx,
      ownerId,
      evidence.dossierId,
      "evidence_added",
      "evidence",
      evidence.id,
      evidence.title
    )
    return evidence
  },
})

export const listEvidencePassages = query({
  args: { evidenceId: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const evidence = await ctx.db
      .query("dossierEvidence")
      .withIndex("by_evidence_id", (q) => q.eq("id", args.evidenceId))
      .unique()
    if (!evidence || evidence.ownerId !== ownerId) throw new Error("Evidence not found")
    await ensureUnlocked(ctx, evidence.dossierId)
    return await ctx.db
      .query("dossierEvidencePassages")
      .withIndex("by_evidence_id_and_page_number", (q) => q.eq("evidenceId", args.evidenceId))
      .take(500)
  },
})

export const verifyEvidence = mutation({
  args: {
    evidenceId: v.string(),
    status: v.union(v.literal("verified"), v.literal("rejected")),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const evidence = await ctx.db
      .query("dossierEvidence")
      .withIndex("by_evidence_id", (q) => q.eq("id", args.evidenceId))
      .unique()
    if (!evidence || evidence.ownerId !== ownerId) throw new Error("Evidence not found")
    await ctx.db.patch(evidence._id, { verificationStatus: args.status, updatedAt: args.updatedAt })
    if (args.status === "verified") {
      const requirement = await ctx.db
        .query("dossierRequirements")
        .withIndex("by_dossier_id_and_sort_order", (q) => q.eq("dossierId", evidence.dossierId))
        .filter((q) => q.eq(q.field("id"), evidence.requirementId))
        .first()
      if (requirement)
        await ctx.db.patch(requirement._id, { status: "ready", updatedAt: args.updatedAt })
    }
    await addAudit(
      ctx,
      ownerId,
      evidence.dossierId,
      args.status === "verified" ? "evidence_verified" : "evidence_rejected",
      "evidence",
      evidence.id,
      evidence.title
    )
    return { ...evidence, verificationStatus: args.status, updatedAt: args.updatedAt }
  },
})

export const updateSection = mutation({
  args: {
    sectionId: v.string(),
    content: v.string(),
    status: v.union(v.literal("draft"), v.literal("in_review"), v.literal("approved")),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const section = await ctx.db
      .query("dossierSections")
      .withIndex("by_section_id", (q) => q.eq("id", args.sectionId))
      .unique()
    if (!section || section.ownerId !== ownerId) throw new Error("Section not found")
    await ensureUnlocked(ctx, section.dossierId)
    const latest = await ctx.db
      .query("dossierSectionVersions")
      .withIndex("by_section_id_and_version", (q) => q.eq("sectionId", section.id))
      .order("desc")
      .take(1)
    await ctx.db.insert("dossierSectionVersions", {
      id: crypto.randomUUID(),
      dossierId: section.dossierId,
      sectionId: section.id,
      ownerId,
      content: args.content,
      status: args.status,
      version: (latest[0]?.version ?? 0) + 1,
      createdAt: args.updatedAt,
    })
    await ctx.db.patch(section._id, {
      content: args.content,
      status: args.status,
      updatedAt: args.updatedAt,
    })
    const dossier = await getDossier(ctx, section.dossierId)
    if (dossier) await ctx.db.patch(dossier._id, { status: "drafting", updatedAt: args.updatedAt })
    await addAudit(
      ctx,
      ownerId,
      section.dossierId,
      args.status === "approved"
        ? "section_approved"
        : args.status === "in_review"
          ? "section_reviewed"
          : "section_saved",
      "section",
      section.id,
      `${section.part} saved as ${args.status.replaceAll("_", " ")}`
    )
    return { ...section, content: args.content, status: args.status, updatedAt: args.updatedAt }
  },
})

export const listSectionVersions = query({
  args: { sectionId: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const section = await ctx.db
      .query("dossierSections")
      .withIndex("by_section_id", (q) => q.eq("id", args.sectionId))
      .unique()
    if (!section || section.ownerId !== ownerId) throw new Error("Section not found")
    return await ctx.db
      .query("dossierSectionVersions")
      .withIndex("by_section_id_and_version", (q) => q.eq("sectionId", args.sectionId))
      .order("desc")
      .take(100)
  },
})

export const restoreSectionVersion = mutation({
  args: { sectionId: v.string(), versionId: v.string(), updatedAt: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const section = await ctx.db
      .query("dossierSections")
      .withIndex("by_section_id", (q) => q.eq("id", args.sectionId))
      .unique()
    if (!section || section.ownerId !== ownerId) throw new Error("Section not found")
    const source = await ctx.db
      .query("dossierSectionVersions")
      .filter((q) => q.eq(q.field("id"), args.versionId))
      .first()
    if (!source || source.ownerId !== ownerId || source.sectionId !== section.id)
      throw new Error("Section version not found")
    const latest = await ctx.db
      .query("dossierSectionVersions")
      .withIndex("by_section_id_and_version", (q) => q.eq("sectionId", section.id))
      .order("desc")
      .take(1)
    await ctx.db.insert("dossierSectionVersions", {
      id: crypto.randomUUID(),
      dossierId: section.dossierId,
      sectionId: section.id,
      ownerId,
      content: source.content,
      status: "draft",
      version: (latest[0]?.version ?? 0) + 1,
      createdAt: args.updatedAt,
    })
    await ctx.db.patch(section._id, {
      content: source.content,
      status: "draft",
      updatedAt: args.updatedAt,
    })
    await addAudit(
      ctx,
      ownerId,
      section.dossierId,
      "section_restored",
      "section",
      section.id,
      `${section.part} restored from version ${source.version}`
    )
    return {
      ...section,
      content: source.content,
      status: "draft" as const,
      updatedAt: args.updatedAt,
    }
  },
})

export const createRequest = mutation({
  args: {
    request: v.object({
      id: v.string(),
      dossierId: v.string(),
      requirementId: v.string(),
      title: v.string(),
      detail: v.string(),
      priority: v.union(v.literal("blocking"), v.literal("high"), v.literal("normal")),
      status: v.literal("open"),
      createdAt: v.string(),
      updatedAt: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const dossier = await getDossier(ctx, args.request.dossierId)
    if (!dossier || dossier.ownerId !== ownerId) throw new Error("Dossier not found")
    await ensureUnlocked(ctx, args.request.dossierId)
    const request = { ...args.request, ownerId }
    await ctx.db.insert("evidenceRequests", request)
    await addAudit(
      ctx,
      ownerId,
      request.dossierId,
      "request_created",
      "request",
      request.id,
      request.title
    )
    return request
  },
})

export const updateRequest = mutation({
  args: {
    requestId: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("received"),
      v.literal("resolved"),
      v.literal("rejected")
    ),
    responseNote: v.optional(v.string()),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const request = await ctx.db
      .query("evidenceRequests")
      .withIndex("by_request_id", (q) => q.eq("id", args.requestId))
      .unique()
    if (!request || request.ownerId !== ownerId) throw new Error("Evidence request not found")
    await ensureUnlocked(ctx, request.dossierId)
    await ctx.db.patch(request._id, {
      status: args.status,
      responseNote: args.responseNote,
      updatedAt: args.updatedAt,
    })
    if (args.status === "resolved") {
      await addAudit(
        ctx,
        ownerId,
        request.dossierId,
        "request_resolved",
        "request",
        request.id,
        request.title
      )
    }
    return {
      ...request,
      status: args.status,
      responseNote: args.responseNote,
      updatedAt: args.updatedAt,
    }
  },
})

export const signAttestation = mutation({
  args: {
    attestation: v.object({
      id: v.string(),
      dossierId: v.string(),
      kind: v.union(
        v.literal("scientific_accuracy"),
        v.literal("source_traceability"),
        v.literal("regulatory_completeness"),
        v.literal("final_authorization")
      ),
      signerName: v.string(),
      signerRole: v.string(),
      statement: v.string(),
      status: v.literal("signed"),
      signedAt: v.string(),
      updatedAt: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const dossier = await getDossier(ctx, args.attestation.dossierId)
    if (!dossier || dossier.ownerId !== ownerId) throw new Error("Dossier not found")
    await ensureUnlocked(ctx, args.attestation.dossierId)
    const existing = await ctx.db
      .query("releaseAttestations")
      .withIndex("by_dossier_id_and_updated_at", (q) =>
        q.eq("dossierId", args.attestation.dossierId)
      )
      .filter((q) =>
        q.and(q.eq(q.field("kind"), args.attestation.kind), q.eq(q.field("status"), "signed"))
      )
      .take(20)
    for (const item of existing)
      await ctx.db.patch(item._id, { status: "revoked", updatedAt: args.attestation.updatedAt })
    const attestation = { ...args.attestation, ownerId }
    await ctx.db.insert("releaseAttestations", attestation)
    await addAudit(
      ctx,
      ownerId,
      attestation.dossierId,
      "attestation_signed",
      "attestation",
      attestation.id,
      `${attestation.signerName} signed ${attestation.kind.replaceAll("_", " ")}`
    )
    return attestation
  },
})

export const revokeAttestation = mutation({
  args: { attestationId: v.string(), updatedAt: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const item = await ctx.db
      .query("releaseAttestations")
      .filter((q) => q.eq(q.field("id"), args.attestationId))
      .first()
    if (!item || item.ownerId !== ownerId) throw new Error("Attestation not found")
    await ensureUnlocked(ctx, item.dossierId)
    await ctx.db.patch(item._id, { status: "revoked", updatedAt: args.updatedAt })
    await addAudit(
      ctx,
      ownerId,
      item.dossierId,
      "attestation_revoked",
      "attestation",
      item.id,
      `${item.kind.replaceAll("_", " ")} attestation revoked`
    )
    return { ...item, status: "revoked" as const, updatedAt: args.updatedAt }
  },
})

const qualityCheckInput = v.object({
  id: v.string(),
  severity: v.union(v.literal("blocker"), v.literal("warning"), v.literal("passed")),
  title: v.string(),
  detail: v.string(),
  target: v.string(),
})
export const lockRelease = mutation({
  args: {
    release: v.object({
      id: v.string(),
      dossierId: v.string(),
      status: v.literal("locked"),
      qualitySnapshot: v.array(qualityCheckInput),
      packageVersion: v.number(),
      lockedAt: v.string(),
      updatedAt: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const dossier = await getDossier(ctx, args.release.dossierId)
    if (!dossier || dossier.ownerId !== ownerId) throw new Error("Dossier not found")
    if (args.release.qualitySnapshot.some((item) => item.severity === "blocker"))
      throw new Error("Blocking quality controls must be resolved before release")
    const activeRelease = await ctx.db
      .query("dossierReleases")
      .withIndex("by_dossier_id_and_updated_at", (q) => q.eq("dossierId", args.release.dossierId))
      .filter((q) => q.eq(q.field("status"), "locked"))
      .first()
    if (activeRelease) throw new Error("This dossier already has a locked release")
    const attestations = await ctx.db
      .query("releaseAttestations")
      .withIndex("by_dossier_id_and_updated_at", (q) => q.eq("dossierId", args.release.dossierId))
      .filter((q) => q.eq(q.field("status"), "signed"))
      .take(20)
    if (new Set(attestations.map((item) => item.kind)).size < 4)
      throw new Error("All four release attestations are required")
    const release = { ...args.release, ownerId }
    await ctx.db.insert("dossierReleases", release)
    await addAudit(
      ctx,
      ownerId,
      release.dossierId,
      "release_locked",
      "dossier",
      release.id,
      `Release package v${release.packageVersion} locked`
    )
    return release
  },
})

export const unlockRelease = mutation({
  args: { releaseId: v.string(), updatedAt: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const release = await ctx.db
      .query("dossierReleases")
      .filter((q) => q.eq(q.field("id"), args.releaseId))
      .first()
    if (!release || release.ownerId !== ownerId) throw new Error("Release not found")
    await ctx.db.patch(release._id, {
      status: "unlocked",
      unlockedAt: args.updatedAt,
      updatedAt: args.updatedAt,
    })
    await addAudit(
      ctx,
      ownerId,
      release.dossierId,
      "release_unlocked",
      "dossier",
      release.id,
      `Release package v${release.packageVersion} unlocked for revision`
    )
    return {
      ...release,
      status: "unlocked" as const,
      unlockedAt: args.updatedAt,
      updatedAt: args.updatedAt,
    }
  },
})

export const createHandoff = mutation({
  args: {
    handoff: v.object({
      id: v.string(),
      dossierId: v.string(),
      consultantName: v.string(),
      consultantEmail: v.optional(v.string()),
      scope: v.string(),
      dueDate: v.optional(v.string()),
      status: v.literal("prepared"),
      createdAt: v.string(),
      updatedAt: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const dossier = await getDossier(ctx, args.handoff.dossierId)
    if (!dossier || dossier.ownerId !== ownerId) throw new Error("Dossier not found")
    const handoff = { ...args.handoff, ownerId }
    await ctx.db.insert("consultantHandoffs", handoff)
    await addAudit(
      ctx,
      ownerId,
      handoff.dossierId,
      "handoff_created",
      "handoff",
      handoff.id,
      `Prepared handoff for ${handoff.consultantName}`
    )
    return handoff
  },
})

export const updateHandoff = mutation({
  args: {
    handoffId: v.string(),
    status: v.union(
      v.literal("prepared"),
      v.literal("in_review"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    responseNote: v.optional(v.string()),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const handoff = await ctx.db
      .query("consultantHandoffs")
      .filter((q) => q.eq(q.field("id"), args.handoffId))
      .first()
    if (!handoff || handoff.ownerId !== ownerId) throw new Error("Handoff not found")
    await ctx.db.patch(handoff._id, {
      status: args.status,
      responseNote: args.responseNote,
      updatedAt: args.updatedAt,
    })
    const action =
      args.status === "in_review"
        ? "handoff_started"
        : args.status === "completed"
          ? "handoff_completed"
          : args.status === "cancelled"
            ? "handoff_cancelled"
            : "handoff_created"
    await addAudit(
      ctx,
      ownerId,
      handoff.dossierId,
      action,
      "handoff",
      handoff.id,
      `${handoff.consultantName}: ${args.status.replaceAll("_", " ")}`
    )
    return {
      ...handoff,
      status: args.status,
      responseNote: args.responseNote,
      updatedAt: args.updatedAt,
    }
  },
})

const factInput = v.object({
  id: v.string(),
  dossierId: v.string(),
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
  status: v.literal("draft"),
  createdAt: v.string(),
  updatedAt: v.string(),
})
export const createFact = mutation({
  args: { fact: factInput },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const dossier = await getDossier(ctx, args.fact.dossierId)
    if (!dossier || dossier.ownerId !== ownerId) throw new Error("Dossier not found")
    await ensureUnlocked(ctx, args.fact.dossierId)
    if (args.fact.evidenceId) {
      const evidence = await ctx.db
        .query("dossierEvidence")
        .withIndex("by_evidence_id", (q) => q.eq("id", args.fact.evidenceId as string))
        .unique()
      if (!evidence || evidence.ownerId !== ownerId || evidence.dossierId !== args.fact.dossierId)
        throw new Error("Linked evidence not found")
    }
    const fact = { ...args.fact, ownerId }
    await ctx.db.insert("factBookEntries", fact)
    await addAudit(
      ctx,
      ownerId,
      fact.dossierId,
      "fact_created",
      "fact",
      fact.id,
      `Added ${fact.title}`
    )
    return fact
  },
})

export const reviewFact = mutation({
  args: {
    factId: v.string(),
    status: v.union(v.literal("draft"), v.literal("verified")),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const fact = await ctx.db
      .query("factBookEntries")
      .filter((q) => q.eq(q.field("id"), args.factId))
      .first()
    if (!fact || fact.ownerId !== ownerId) throw new Error("Fact not found")
    await ensureUnlocked(ctx, fact.dossierId)
    await ctx.db.patch(fact._id, { status: args.status, updatedAt: args.updatedAt })
    await addAudit(
      ctx,
      ownerId,
      fact.dossierId,
      args.status === "verified" ? "fact_verified" : "fact_reopened",
      "fact",
      fact.id,
      `${fact.title}: ${args.status}`
    )
    return { ...fact, status: args.status, updatedAt: args.updatedAt }
  },
})

export const removeFact = mutation({
  args: { factId: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const fact = await ctx.db
      .query("factBookEntries")
      .filter((q) => q.eq(q.field("id"), args.factId))
      .first()
    if (!fact || fact.ownerId !== ownerId) throw new Error("Fact not found")
    await ensureUnlocked(ctx, fact.dossierId)
    await ctx.db.delete(fact._id)
    await addAudit(
      ctx,
      ownerId,
      fact.dossierId,
      "fact_removed",
      "fact",
      fact.id,
      `Removed ${fact.title}`
    )
    return fact
  },
})

export const removeEvidence = mutation({
  args: { evidenceId: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const evidence = await ctx.db
      .query("dossierEvidence")
      .withIndex("by_evidence_id", (q) => q.eq("id", args.evidenceId))
      .unique()
    if (!evidence || evidence.ownerId !== ownerId) throw new Error("Evidence not found")
    await ensureUnlocked(ctx, evidence.dossierId)
    const passages = await ctx.db
      .query("dossierEvidencePassages")
      .withIndex("by_evidence_id_and_page_number", (q) => q.eq("evidenceId", evidence.id))
      .take(500)
    const claims = await ctx.db
      .query("dossierClaims")
      .withIndex("by_dossier_id_and_created_at", (q) => q.eq("dossierId", evidence.dossierId))
      .filter((q) => q.eq(q.field("evidenceId"), evidence.id))
      .take(500)
    for (const passage of passages) await ctx.db.delete(passage._id)
    for (const claim of claims) await ctx.db.delete(claim._id)
    await ctx.db.delete(evidence._id)
    await addAudit(
      ctx,
      ownerId,
      evidence.dossierId,
      "evidence_removed",
      "evidence",
      evidence.id,
      evidence.title
    )

    const requirement = await ctx.db
      .query("dossierRequirements")
      .withIndex("by_dossier_id_and_sort_order", (q) => q.eq("dossierId", evidence.dossierId))
      .filter((q) => q.eq(q.field("id"), evidence.requirementId))
      .first()
    if (requirement) {
      const remaining = await ctx.db
        .query("dossierEvidence")
        .withIndex("by_dossier_id_and_created_at", (q) => q.eq("dossierId", evidence.dossierId))
        .filter((q) => q.eq(q.field("requirementId"), evidence.requirementId))
        .take(200)
      const verified = remaining.some((item) => item.verificationStatus === "verified")
      await ctx.db.patch(requirement._id, {
        evidenceCount: remaining.length,
        status: verified ? "ready" : remaining.length > 0 ? "partial" : "missing",
        blockingIssue:
          remaining.length > 0
            ? undefined
            : `Evidence has not yet been added for ${requirement.title.toLowerCase()}.`,
        updatedAt: new Date().toISOString(),
      })
    }
    return evidence
  },
})

export const removeBatch = mutation({
  args: { dossierId: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const dossier = await getDossier(ctx, args.dossierId)
    if (!dossier || dossier.ownerId !== ownerId) throw new Error("Dossier not found")
    const passages = await ctx.db
      .query("dossierEvidencePassages")
      .withIndex("by_dossier_id", (q) => q.eq("dossierId", args.dossierId))
      .take(100)
    if (passages.length) {
      for (const item of passages) await ctx.db.delete(item._id)
      return { done: false, storageKeys: [] as string[] }
    }
    const facts = await ctx.db
      .query("factBookEntries")
      .withIndex("by_dossier_id_and_updated_at", (q) => q.eq("dossierId", args.dossierId))
      .take(100)
    if (facts.length) {
      for (const item of facts) await ctx.db.delete(item._id)
      return { done: false, storageKeys: [] as string[] }
    }
    const claims = await ctx.db
      .query("dossierClaims")
      .withIndex("by_dossier_id_and_created_at", (q) => q.eq("dossierId", args.dossierId))
      .take(100)
    if (claims.length) {
      for (const item of claims) await ctx.db.delete(item._id)
      return { done: false, storageKeys: [] as string[] }
    }
    const evidence = await ctx.db
      .query("dossierEvidence")
      .withIndex("by_dossier_id_and_created_at", (q) => q.eq("dossierId", args.dossierId))
      .take(50)
    if (evidence.length) {
      const storageKeys = evidence
        .map((item) => item.artifact?.storageKey)
        .filter((key): key is string => typeof key === "string")
      for (const item of evidence) await ctx.db.delete(item._id)
      return { done: false, storageKeys }
    }
    const versions = await ctx.db
      .query("dossierSectionVersions")
      .withIndex("by_dossier_id", (q) => q.eq("dossierId", args.dossierId))
      .take(100)
    if (versions.length) {
      for (const item of versions) await ctx.db.delete(item._id)
      return { done: false, storageKeys: [] as string[] }
    }
    const events = await ctx.db
      .query("dossierAuditEvents")
      .withIndex("by_dossier_id_and_created_at", (q) => q.eq("dossierId", args.dossierId))
      .take(100)
    if (events.length) {
      for (const item of events) await ctx.db.delete(item._id)
      return { done: false, storageKeys: [] as string[] }
    }
    const requests = await ctx.db
      .query("evidenceRequests")
      .withIndex("by_dossier_id_and_updated_at", (q) => q.eq("dossierId", args.dossierId))
      .take(100)
    if (requests.length) {
      for (const item of requests) await ctx.db.delete(item._id)
      return { done: false, storageKeys: [] as string[] }
    }
    const attestations = await ctx.db
      .query("releaseAttestations")
      .withIndex("by_dossier_id_and_updated_at", (q) => q.eq("dossierId", args.dossierId))
      .take(100)
    if (attestations.length) {
      for (const item of attestations) await ctx.db.delete(item._id)
      return { done: false, storageKeys: [] as string[] }
    }
    const releases = await ctx.db
      .query("dossierReleases")
      .withIndex("by_dossier_id_and_updated_at", (q) => q.eq("dossierId", args.dossierId))
      .take(100)
    if (releases.length) {
      for (const item of releases) await ctx.db.delete(item._id)
      return { done: false, storageKeys: [] as string[] }
    }
    const handoffs = await ctx.db
      .query("consultantHandoffs")
      .withIndex("by_dossier_id_and_updated_at", (q) => q.eq("dossierId", args.dossierId))
      .take(100)
    if (handoffs.length) {
      for (const item of handoffs) await ctx.db.delete(item._id)
      return { done: false, storageKeys: [] as string[] }
    }
    const sections = await ctx.db
      .query("dossierSections")
      .withIndex("by_dossier_id_and_part", (q) => q.eq("dossierId", args.dossierId))
      .take(100)
    if (sections.length) {
      for (const item of sections) await ctx.db.delete(item._id)
      return { done: false, storageKeys: [] as string[] }
    }
    const requirements = await ctx.db
      .query("dossierRequirements")
      .withIndex("by_dossier_id_and_sort_order", (q) => q.eq("dossierId", args.dossierId))
      .take(100)
    if (requirements.length) {
      for (const item of requirements) await ctx.db.delete(item._id)
      return { done: false, storageKeys: [] as string[] }
    }
    await ctx.db.delete(dossier._id)
    return { done: true, storageKeys: [] as string[] }
  },
})

async function getDossier(ctx: QueryCtx | MutationCtx, dossierId: string) {
  return await ctx.db
    .query("dossiers")
    .withIndex("by_dossier_id", (q) => q.eq("id", dossierId))
    .unique()
}

async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("Not authenticated")
  return userId
}

async function addAudit(
  ctx: MutationCtx,
  ownerId: string,
  dossierId: string,
  action: string,
  targetType: string,
  targetId: string,
  summary: string
) {
  await ctx.db.insert("dossierAuditEvents", {
    id: crypto.randomUUID(),
    dossierId,
    ownerId,
    action,
    targetType,
    targetId,
    summary,
    createdAt: new Date().toISOString(),
  })
}

async function ensureUnlocked(ctx: QueryCtx, dossierId: string) {
  const release = await ctx.db
    .query("dossierReleases")
    .withIndex("by_dossier_id_and_updated_at", (q) => q.eq("dossierId", dossierId))
    .order("desc")
    .filter((q) => q.eq(q.field("status"), "locked"))
    .first()
  if (release)
    throw new Error("This dossier is release locked. Unlock it before changing controlled content.")
}
