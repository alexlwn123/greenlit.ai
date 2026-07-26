import { randomUUID } from "node:crypto"
import path from "node:path"
import { head, issueSignedToken, presignUrl } from "@vercel/blob"
import type { HandleUploadPresignedBody } from "@vercel/blob/client"
import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import { type Context, Hono } from "hono"
import { cors } from "hono/cors"
import { secureHeaders } from "hono/secure-headers"
import {
  type AnalysisRecord,
  type ArtifactReference,
  applyDeepAnalysis,
  type ComparableAction,
  compareEvidenceMatrices,
  createMinimumReadinessReport,
  mergeComparableActionsIntoOutline,
  type NoticeProfile,
  type ReadinessReport,
  ReadinessReportSchema,
  type ResearchReference,
  rankComparableFilings,
  type WorkbookNote,
} from "../../../packages/core/src/index.js"
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
import { extractPdfText } from "./pdf.js"
import { verifyReferenceSources } from "./source-verification.js"
import { createConfiguredStorage, defaultDataDir } from "./storage.js"

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
export const maxPdfPages = 500

export function createApp(options: CreateAppOptions = {}) {
  const dataDir = options.dataDir ?? process.env.GREENLIT_LOCAL_DATA_DIR ?? defaultDataDir()
  const app = new Hono()

  app.use("/api/*", secureHeaders())
  app.use("/api/*", async (context, next) => {
    await next()
    context.header("Cache-Control", "no-store")
  })

  app.onError((error, context) => {
    if (error.message === "Not authenticated") {
      return context.json({ error: "Not authenticated" }, 401)
    }
    throw error
  })

  app.use(
    "/api/*",
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      allowHeaders: ["Authorization", "Content-Type", "x-greenlit-session"],
      allowMethods: ["DELETE", "GET", "POST", "OPTIONS"],
    })
  )

  app.get("/api/health", (context) =>
    context.json({
      ok: true,
      service: "greenlit-local-api",
    })
  )

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
            cacheDir: path.join(dataDir, "model-cache"),
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
                    cacheDir: path.join(dataDir, "model-cache"),
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
                      cacheDir: path.join(dataDir, "model-cache"),
                    })
                    comparableActions = await synthesizeComparableActionsWithAnthropic({
                      evidenceMatrix: deepResult.evidenceMatrix,
                      filings: comparableFilings,
                      cacheDir: path.join(dataDir, "model-cache"),
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
                    cacheDir: path.join(dataDir, "model-cache"),
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
                    cacheDir: path.join(dataDir, "model-cache"),
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
      process.env.GREENLIT_METADATA_DRIVER === "convex" || options.resolveAuthenticatedOwner
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

function validateUpload(file: FormDataEntryValue | FormDataEntryValue[] | undefined) {
  if (!isFile(file)) {
    return "Upload a PDF file to start an analysis."
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return "Only PDF uploads are supported for the MVP."
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
