import { z } from "zod"

export const DossierSubstanceTypeSchema = z.enum([
  "fermentation",
  "enzyme",
  "protein",
  "botanical",
  "chemical",
  "other",
])

export const DossierStatusSchema = z.enum(["planning", "collecting_evidence", "drafting", "review"])
export const DossierRequirementStatusSchema = z.enum(["missing", "partial", "ready"])

export const DossierIntakeSchema = z.object({
  substanceName: z.string().min(1),
  companyName: z.string().default(""),
  substanceType: DossierSubstanceTypeSchema,
  intendedEffect: z.string().default(""),
  intendedUses: z.string().default(""),
  manufacturingSummary: z.string().default(""),
  targetPopulation: z.string().default("General U.S. population"),
  grasBasis: z.literal("scientific_procedures"),
})

export const DossierRecordSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  status: DossierStatusSchema,
  intake: DossierIntakeSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const DossierRequirementSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  ownerId: z.string(),
  section: z.string(),
  title: z.string(),
  guidance: z.string(),
  status: DossierRequirementStatusSchema,
  evidenceCount: z.number().int().nonnegative(),
  blockingIssue: z.string().optional(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const DossierEvidenceSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  ownerId: z.string(),
  requirementId: z.string(),
  title: z.string(),
  category: z.enum([
    "identity",
    "manufacturing",
    "specification",
    "exposure",
    "safety_study",
    "regulatory",
    "other",
  ]),
  verificationStatus: z.enum(["needs_review", "verified", "rejected"]),
  artifact: z.any(),
  excerpt: z.string(),
  pageCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const DossierEvidencePassageSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  evidenceId: z.string(),
  ownerId: z.string(),
  pageNumber: z.number().int().positive(),
  text: z.string(),
  createdAt: z.string(),
})

export const DossierSectionSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  ownerId: z.string(),
  part: z.string(),
  title: z.string(),
  content: z.string(),
  status: z.enum(["not_started", "draft", "in_review", "approved"]),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const DossierClaimSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  ownerId: z.string(),
  sectionId: z.string(),
  requirementId: z.string(),
  evidenceId: z.string(),
  statement: z.string(),
  sourceExcerpt: z.string(),
  sourcePage: z.number().int().positive(),
  status: z.enum(["proposed", "verified", "rejected"]),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const DossierSectionVersionSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  sectionId: z.string(),
  ownerId: z.string(),
  content: z.string(),
  status: z.enum(["not_started", "draft", "in_review", "approved"]),
  version: z.number().int().positive(),
  createdAt: z.string(),
})

export const DossierAuditEventSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  ownerId: z.string(),
  action: z.enum([
    "dossier_created",
    "evidence_added",
    "evidence_verified",
    "evidence_rejected",
    "evidence_removed",
    "claim_proposed",
    "claim_verified",
    "claim_rejected",
    "section_saved",
    "section_reviewed",
    "section_approved",
    "section_restored",
    "request_created",
    "request_resolved",
    "attestation_signed",
    "attestation_revoked",
    "release_locked",
    "release_unlocked",
    "handoff_created",
    "handoff_started",
    "handoff_completed",
    "handoff_cancelled",
    "fact_created",
    "fact_verified",
    "fact_reopened",
    "fact_removed",
  ]),
  targetType: z.enum([
    "dossier",
    "evidence",
    "claim",
    "section",
    "request",
    "attestation",
    "handoff",
    "fact",
  ]),
  targetId: z.string(),
  summary: z.string(),
  createdAt: z.string(),
})

export const EvidenceRequestSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  requirementId: z.string(),
  ownerId: z.string(),
  title: z.string(),
  detail: z.string(),
  priority: z.enum(["blocking", "high", "normal"]),
  status: z.enum(["open", "received", "resolved", "rejected"]),
  responseNote: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const ReleaseAttestationSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  ownerId: z.string(),
  kind: z.enum([
    "scientific_accuracy",
    "source_traceability",
    "regulatory_completeness",
    "final_authorization",
  ]),
  signerName: z.string(),
  signerRole: z.string(),
  statement: z.string(),
  status: z.enum(["signed", "revoked"]),
  signedAt: z.string(),
  updatedAt: z.string(),
})

export const DossierReleaseSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  ownerId: z.string(),
  status: z.enum(["locked", "unlocked"]),
  qualitySnapshot: z.array(
    z.object({
      id: z.string(),
      severity: z.enum(["blocker", "warning", "passed"]),
      title: z.string(),
      detail: z.string(),
      target: z.string(),
    })
  ),
  packageVersion: z.number(),
  lockedAt: z.string(),
  unlockedAt: z.string().optional(),
  updatedAt: z.string(),
})

export const ConsultantHandoffSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  ownerId: z.string(),
  consultantName: z.string(),
  consultantEmail: z.string().optional(),
  scope: z.string(),
  dueDate: z.string().optional(),
  status: z.enum(["prepared", "in_review", "completed", "cancelled"]),
  responseNote: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const FactBookEntrySchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  ownerId: z.string(),
  kind: z.enum([
    "identity",
    "manufacturing",
    "intended_use",
    "exposure",
    "specification",
    "batch_result",
    "safety_study",
  ]),
  title: z.string(),
  fields: z.record(z.string(), z.string()),
  evidenceId: z.string().optional(),
  status: z.enum(["draft", "verified"]),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const DossierQualityCheckSchema = z.object({
  id: z.string(),
  severity: z.enum(["blocker", "warning", "passed"]),
  title: z.string(),
  detail: z.string(),
  target: z.string(),
})

export type DossierIntake = z.infer<typeof DossierIntakeSchema>
export type DossierRecord = z.infer<typeof DossierRecordSchema>
export type DossierRequirement = z.infer<typeof DossierRequirementSchema>
export type DossierEvidence = z.infer<typeof DossierEvidenceSchema>
export type DossierEvidencePassage = z.infer<typeof DossierEvidencePassageSchema>
export type DossierSection = z.infer<typeof DossierSectionSchema>
export type DossierClaim = z.infer<typeof DossierClaimSchema>
export type DossierSectionVersion = z.infer<typeof DossierSectionVersionSchema>
export type DossierAuditEvent = z.infer<typeof DossierAuditEventSchema>
export type EvidenceRequest = z.infer<typeof EvidenceRequestSchema>
export type ReleaseAttestation = z.infer<typeof ReleaseAttestationSchema>
export type DossierRelease = z.infer<typeof DossierReleaseSchema>
export type ConsultantHandoff = z.infer<typeof ConsultantHandoffSchema>
export type FactBookEntry = z.infer<typeof FactBookEntrySchema>
export type DossierQualityCheck = z.infer<typeof DossierQualityCheckSchema>

const baseRequirements: ReadonlyArray<readonly [string, string, string]> = [
  [
    "Part 2",
    "Identity and composition",
    "Define the notified substance and support its composition with analytical evidence.",
  ],
  [
    "Part 2",
    "Manufacturing process",
    "Describe the complete process, controls, processing aids, and potential impurities.",
  ],
  [
    "Part 2",
    "Specifications and batch analyses",
    "Establish food-grade specifications and demonstrate consistency across representative lots.",
  ],
  [
    "Part 3",
    "Dietary exposure",
    "Connect proposed food uses and use levels to a defensible exposure estimate.",
  ],
  [
    "Part 4",
    "Self-limiting levels of use",
    "Explain any technical, organoleptic, or economic limits on use.",
  ],
  [
    "Part 5",
    "Experience based on common use",
    "Document applicability or explain why the conclusion rests on scientific procedures.",
  ],
  [
    "Part 6",
    "Safety narrative",
    "Integrate metabolism, toxicology, allergenicity, and other relevant safety evidence.",
  ],
  [
    "Part 6",
    "Test-article bridge",
    "Show that pivotal study materials represent the commercial notified substance.",
  ],
  [
    "Part 6",
    "General recognition",
    "Identify the publicly available evidence supporting general recognition among qualified experts.",
  ],
  [
    "Part 7",
    "Supporting data and information",
    "Index cited materials and address information that may appear inconsistent with the conclusion.",
  ],
]

export function buildInitialDossierRequirements(
  dossierId: string,
  ownerId: string,
  intake: DossierIntake,
  now: string
): DossierRequirement[] {
  const tailored: Array<readonly [string, string, string]> = [...baseRequirements]
  if (intake.substanceType === "fermentation" || intake.substanceType === "enzyme") {
    tailored.splice(3, 0, [
      "Part 2",
      "Production organism and genetic construction",
      "Characterize the production strain, lineage, modifications, and absence or control of viable cells and DNA.",
    ])
  }
  if (intake.substanceType === "protein" || intake.substanceType === "botanical") {
    tailored.splice(7, 0, [
      "Part 6",
      "Allergenicity and source hazards",
      "Assess source-organism hazards, sequence or clinical evidence, and relevant anti-nutrients.",
    ])
  }

  return tailored.map(([section, title, guidance], index) => ({
    id: `${dossierId}-requirement-${index + 1}`,
    dossierId,
    ownerId,
    section,
    title,
    guidance,
    status: "missing",
    evidenceCount: 0,
    blockingIssue: `Evidence has not yet been added for ${title.toLowerCase()}.`,
    sortOrder: index,
    createdAt: now,
    updatedAt: now,
  }))
}

const sectionTitles = [
  ["Part 1", "Signed statements and certification"],
  ["Part 2", "Identity, manufacture, specifications, and technical effect"],
  ["Part 3", "Dietary exposure"],
  ["Part 4", "Self-limiting levels of use"],
  ["Part 5", "Experience based on common use in food"],
  ["Part 6", "Narrative supporting the GRAS conclusion"],
  ["Part 7", "Supporting data and information"],
] as const

export function buildInitialDossierSections(
  dossierId: string,
  ownerId: string,
  now: string
): DossierSection[] {
  return sectionTitles.map(([part, title], index) => ({
    id: `${dossierId}-section-${index + 1}`,
    dossierId,
    ownerId,
    part,
    title,
    content: "",
    status: "not_started",
    createdAt: now,
    updatedAt: now,
  }))
}

export function evaluateDossierQuality(input: {
  requirements: DossierRequirement[]
  evidence: DossierEvidence[]
  sections: DossierSection[]
  claims?: DossierClaim[]
  evidenceRequests?: EvidenceRequest[]
  attestations?: ReleaseAttestation[]
  handoffs?: ConsultantHandoff[]
  factBookEntries?: FactBookEntry[]
}): DossierQualityCheck[] {
  const checks: DossierQualityCheck[] = []
  const missing = input.requirements.filter((item) => item.evidenceCount === 0)
  checks.push({
    id: "evidence-coverage",
    severity: missing.length > 0 ? "blocker" : "passed",
    title: "Evidence coverage",
    detail:
      missing.length > 0
        ? `${missing.length} requirements have no mapped evidence.`
        : "Every dossier requirement has mapped evidence.",
    target: "Evidence room",
  })
  const facts = input.factBookEntries ?? []
  const requiredFactKinds: FactBookEntry["kind"][] = [
    "identity",
    "manufacturing",
    "intended_use",
    "exposure",
    "specification",
    "safety_study",
  ]
  const missingFactKinds = requiredFactKinds.filter(
    (kind) => !facts.some((fact) => fact.kind === kind)
  )
  checks.push({
    id: "fact-book-coverage",
    severity: missingFactKinds.length > 0 ? "warning" : "passed",
    title: "Structured fact coverage",
    detail:
      missingFactKinds.length > 0
        ? `Fact Book is missing ${missingFactKinds.map((kind) => kind.replaceAll("_", " ")).join(", ")}.`
        : "Identity, manufacture, uses, exposure, specifications, and safety are represented as structured facts.",
    target: "Fact Book",
  })
  const unverifiedFacts = facts.filter((fact) => fact.status !== "verified")
  checks.push({
    id: "fact-book-verification",
    severity: unverifiedFacts.length > 0 ? "warning" : "passed",
    title: "Structured fact verification",
    detail:
      unverifiedFacts.length > 0
        ? `${unverifiedFacts.length} Fact Book entries still require human verification.`
        : "All Fact Book entries are verified.",
    target: "Fact Book",
  })
  const incompleteStructured = facts.filter(
    (fact) =>
      (fact.kind === "intended_use" &&
        (!fact.fields.foodCategory || !fact.fields.useLevel || !fact.fields.unit)) ||
      (fact.kind === "specification" &&
        (!fact.fields.parameter || !fact.fields.limit || !fact.fields.unit)) ||
      (fact.kind === "safety_study" && (!fact.fields.studyType || !fact.fields.outcome))
  ).length
  checks.push({
    id: "fact-book-completeness",
    severity: incompleteStructured > 0 ? "blocker" : "passed",
    title: "Structured record completeness",
    detail:
      incompleteStructured > 0
        ? `${incompleteStructured} use, specification, or safety records lack required fields.`
        : "Structured use, specification, and safety records contain their required fields.",
    target: "Fact Book",
  })
  const identityNames = new Set(
    facts
      .filter(
        (fact) =>
          fact.kind === "identity" && fact.status === "verified" && fact.fields.substanceName
      )
      .map((fact) => fact.fields.substanceName.trim().toLowerCase())
  )
  checks.push({
    id: "identity-consistency",
    severity: identityNames.size > 1 ? "blocker" : "passed",
    title: "Canonical identity consistency",
    detail:
      identityNames.size > 1
        ? "Verified identity records use conflicting substance names."
        : "Verified identity records use one canonical substance name.",
    target: "Fact Book",
  })
  const specificationParameters = new Set(
    facts
      .filter((fact) => fact.kind === "specification")
      .map((fact) => fact.fields.parameter?.trim().toLowerCase())
      .filter(Boolean)
  )
  const orphanBatchResults = facts.filter(
    (fact) =>
      fact.kind === "batch_result" &&
      fact.fields.parameter &&
      !specificationParameters.has(fact.fields.parameter.trim().toLowerCase())
  )
  checks.push({
    id: "batch-specification-bridge",
    severity: orphanBatchResults.length > 0 ? "warning" : "passed",
    title: "Batch-to-specification bridge",
    detail:
      orphanBatchResults.length > 0
        ? `${orphanBatchResults.length} batch results do not map to a named specification parameter.`
        : "Every batch result maps to a named specification parameter.",
    target: "Fact Book",
  })
  const unlinkedSafety = facts.filter((fact) => fact.kind === "safety_study" && !fact.evidenceId)
  checks.push({
    id: "safety-source-linkage",
    severity: unlinkedSafety.length > 0 ? "warning" : "passed",
    title: "Safety-study source linkage",
    detail:
      unlinkedSafety.length > 0
        ? `${unlinkedSafety.length} safety-study records are not linked to source evidence.`
        : "Every safety-study record links to source evidence.",
    target: "Fact Book",
  })
  const signedKinds = new Set(
    (input.attestations ?? []).filter((item) => item.status === "signed").map((item) => item.kind)
  )
  checks.push({
    id: "release-attestations",
    severity: signedKinds.size === 4 ? "passed" : "warning",
    title: "Release attestations",
    detail:
      signedKinds.size === 4
        ? "All four named human attestations are signed."
        : `${4 - signedKinds.size} release attestations still require a named signer.`,
    target: "Release center",
  })

  const activeHandoffs = (input.handoffs ?? []).filter(
    (item) => item.status === "prepared" || item.status === "in_review"
  )
  checks.push({
    id: "consultant-review",
    severity: activeHandoffs.some((item) => item.status === "in_review") ? "warning" : "passed",
    title: "External review status",
    detail: activeHandoffs.some((item) => item.status === "in_review")
      ? "A consultant review is still in progress."
      : "No consultant review is currently in progress.",
    target: "Release center",
  })
  const openRequests = (input.evidenceRequests ?? []).filter(
    (request) => request.status === "open" || request.status === "received"
  )
  checks.push({
    id: "open-evidence-requests",
    severity: openRequests.some((request) => request.priority === "blocking")
      ? "blocker"
      : openRequests.length > 0
        ? "warning"
        : "passed",
    title: "Evidence request closure",
    detail:
      openRequests.length > 0
        ? `${openRequests.length} evidence requests remain open or received but unresolved.`
        : "All evidence requests are closed.",
    target: "Evidence requests",
  })

  const knownClaims = new Set((input.claims ?? []).map((claim) => claim.id))
  const orphanedMarkers = input.sections
    .flatMap((section) =>
      [...section.content.matchAll(/\[\[claim:([^\]]+)\]\]/g)].map((match) => match[1])
    )
    .filter((claimId) => !knownClaims.has(claimId)).length
  checks.push({
    id: "orphaned-citations",
    severity: orphanedMarkers > 0 ? "blocker" : "passed",
    title: "Citation integrity",
    detail:
      orphanedMarkers > 0
        ? `${orphanedMarkers} draft citations point to missing claim records.`
        : "Every claim marker points to a current ledger record.",
    target: "Drafting studio",
  })

  const unverified = input.evidence.filter((item) => item.verificationStatus !== "verified")
  checks.push({
    id: "evidence-verification",
    severity: unverified.length > 0 ? "warning" : "passed",
    title: "Source verification",
    detail:
      unverified.length > 0
        ? `${unverified.length} evidence items still require human verification.`
        : "All uploaded evidence has been verified.",
    target: "Evidence room",
  })

  const emptySections = input.sections.filter((section) => section.content.trim().length < 80)
  checks.push({
    id: "section-completeness",
    severity: emptySections.length > 0 ? "blocker" : "passed",
    title: "Draft completeness",
    detail:
      emptySections.length > 0
        ? `${emptySections.length} sections are missing a substantive draft.`
        : "All seven notice sections contain substantive draft text.",
    target: "Drafting studio",
  })

  const approved = input.sections.filter((section) => section.status === "approved").length
  checks.push({
    id: "section-approval",
    severity: approved === input.sections.length ? "passed" : "warning",
    title: "Human approval",
    detail:
      approved === input.sections.length
        ? "Every section has been approved by the regulatory lead."
        : `${input.sections.length - approved} sections have not received human approval.`,
    target: "Drafting studio",
  })

  const substantiveSections = input.sections.filter(
    (section) => section.content.trim().length >= 80
  )
  const verifiedClaims = (input.claims ?? []).filter((claim) => claim.status === "verified")
  const unsupported = substantiveSections.filter(
    (section) =>
      !verifiedClaims.some(
        (claim) =>
          claim.sectionId === section.id && section.content.includes(`[[claim:${claim.id}]]`)
      )
  )
  checks.push({
    id: "claim-traceability",
    severity: unsupported.length > 0 ? "blocker" : "passed",
    title: "Claim-level traceability",
    detail:
      unsupported.length > 0
        ? `${unsupported.length} substantive sections lack a linked, verified claim citation.`
        : substantiveSections.length === 0
          ? "Traceability will be evaluated once substantive drafting begins."
          : "Every substantive section contains a durable citation to a verified claim.",
    target: "Claim ledger",
  })
  return checks
}

export function suggestDossierRequirement(
  text: string,
  requirements: DossierRequirement[]
): DossierRequirement | undefined {
  const normalized = text.toLowerCase()
  return requirements
    .map((requirement) => ({
      requirement,
      score: meaningfulWords(`${requirement.title} ${requirement.guidance}`).reduce(
        (score, word) => score + (normalized.includes(word) ? 1 : 0),
        0
      ),
    }))
    .sort((a, b) => b.score - a.score || a.requirement.sortOrder - b.requirement.sortOrder)[0]
    ?.requirement
}

export function suggestClaimsFromPassage(text: string, requirement: DossierRequirement) {
  const requirementWords = new Set(meaningfulWords(`${requirement.title} ${requirement.guidance}`))
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 35 && sentence.length <= 600)
    .map((sentence, index) => ({
      sentence,
      index,
      score:
        meaningfulWords(sentence).reduce(
          (score, word) => score + (requirementWords.has(word) ? 2 : 0),
          0
        ) +
        (/\b(is|are|was|were|demonstrat|show|contain|consist|specif|manufactur|exposure|noael)\w*/i.test(
          sentence
        )
          ? 1
          : 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map((item) => item.sentence)
}

function meaningfulWords(value: string) {
  const ignored = new Set([
    "about",
    "after",
    "before",
    "describe",
    "document",
    "evidence",
    "explain",
    "information",
    "relevant",
    "requirement",
    "support",
    "supporting",
    "their",
    "these",
    "those",
    "using",
    "with",
  ])
  return [...new Set(value.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [])].filter(
    (word) => !ignored.has(word)
  )
}
