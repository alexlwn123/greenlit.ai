import { type Context, Hono } from "hono"
import { cors } from "hono/cors"
import {
  type AnalysisRecord,
  createMinimumReadinessReport,
  type ReadinessReport,
  type WorkbookNote,
} from "../../../packages/core/src/index.js"
import { extractPdfText } from "./pdf.js"
import { createConfiguredStorage, defaultDataDir } from "./storage.js"

type CreateAppOptions = {
  dataDir?: string
  runAnalysisInline?: boolean
}

const maxUploadBytes = 40 * 1024 * 1024

export function createApp(options: CreateAppOptions = {}) {
  const storage = createConfiguredStorage(
    options.dataDir ?? process.env.GREENLIT_LOCAL_DATA_DIR ?? defaultDataDir()
  )
  const app = new Hono()

  app.use(
    "/api/*",
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      allowHeaders: ["Content-Type", "x-greenlit-session"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    })
  )

  app.get("/api/health", (context) =>
    context.json({
      ok: true,
      service: "greenlit-local-api",
    })
  )

  app.get("/api/analyses", async (context) => {
    const ownerId = getOwnerId(context.req.header("x-greenlit-session"))
    const analyses = await storage.listAnalyses(ownerId)
    return context.json({ analyses })
  })

  app.get("/api/analyses/:id", async (context) => {
    const ownerId = getOwnerId(context.req.header("x-greenlit-session"))
    const analysis = await storage.getAnalysis(ownerId, context.req.param("id"))

    if (!analysis) {
      return context.json({ error: "Analysis not found" }, 404)
    }

    return context.json({ analysis })
  })

  app.get("/api/analyses/:id/notes", async (context) => {
    const ownerId = getOwnerId(context.req.header("x-greenlit-session"))
    const analysis = await storage.getAnalysis(ownerId, context.req.param("id"))

    if (!analysis) {
      return context.json({ error: "Analysis not found" }, 404)
    }

    const notes = await storage.listNotes(ownerId, analysis.id)
    return context.json({ notes })
  })

  app.post("/api/analyses/:id/notes", async (context) => {
    const ownerId = getOwnerId(context.req.header("x-greenlit-session"))
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
    const ownerId = getOwnerId(context.req.header("x-greenlit-session"))
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
    const ownerId = getOwnerId(context.req.header("x-greenlit-session"))
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
    const ownerId = getOwnerId(context.req.header("x-greenlit-session"))
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
      await processAnalysis(analysis.id)
      const completed = await storage.getAnalysisById(analysis.id)
      return context.json({ analysis: completed ?? analysis }, 202)
    }

    setTimeout(() => {
      void processAnalysis(analysis.id)
    }, 0)

    return context.json({ analysis }, 202)
  })

  async function processAnalysis(analysisId: string) {
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
      const textArtifact = await storage.createArtifact({
        bytes: Buffer.from(extracted.text, "utf8"),
        fileName: `${analysis.filingName}.txt`,
        mimeType: "text/plain",
      })
      const report = createMinimumReadinessReport({
        analysisId: analysis.id,
        filingName: analysis.filingName,
        extractedText: extracted.text,
        pageCount: extracted.pageCount,
      })

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
      return `## ${section.title}\n\n${items}`
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

## Workbook Notes

${notesMarkdown}
`
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
