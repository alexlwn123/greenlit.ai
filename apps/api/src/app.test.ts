import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createApp, validatePdfPageCount } from "./app"

let dataDir: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "greenlit-api-"))
})

afterEach(async () => {
  await rm(dataDir, { force: true, recursive: true })
})

describe("local analysis API", () => {
  it("enforces the 500-page filing limit", () => {
    expect(() => validatePdfPageCount(500)).not.toThrow()
    expect(() => validatePdfPageCount(501)).toThrow(/supports filings up to 500 pages/)
  })

  it("saves an uploaded PDF and produces a minimum readiness score", async () => {
    const app = createApp({ dataDir, runAnalysisInline: true })
    const createdResponse = await uploadTestPdf(app, "test-session")

    expect(createdResponse.status).toBe(202)
    const created = (await createdResponse.json()) as { analysis: { id: string } }
    const analysis = await pollAnalysis(app, created.analysis.id)

    expect(analysis.status).toBe("complete")
    expect(analysis.upload?.storageKey).toContain("artifacts/")
    expect(analysis.textArtifact?.mimeType).toBe("text/plain")
    expect(analysis.report?.readinessScore).toBeGreaterThan(50)
  })

  it("enriches the saved report with grounded deep-analysis findings", async () => {
    const app = createApp({
      analysisMode: "deep",
      comparableCorpus: [
        {
          grnNumber: 742,
          substanceName: "Comparable plant protein",
          status: "no_questions",
          substanceType: "botanical_extract",
          productionMethod: "extraction",
          sourceOrganismType: "plant",
          intendedUses: ["protein_products"],
          targetPopulation: "general_population",
          grasBasis: "scientific_procedures",
          safetyDataAvailable: ["subchronic_toxicity"],
          dietaryExposureMethod: "WWEIA",
        },
      ],
      referenceVerifier: async (references) =>
        references.map((reference) => ({
          ...reference,
          verificationStatus: "metadata_verified" as const,
          verification: {
            source: "crossref" as const,
            checkedAt: "2026-07-24T00:00:00.000Z",
            matchMethod: "title" as const,
            confidence: 1,
            matchedTitle: reference.title,
            matchedAuthors: [],
            matchedYear: reference.year ?? "",
            matchedDoi: "10.1000/example",
            matchedUrl: "https://doi.org/10.1000/example",
            conflicts: [],
          },
        })),
      dataDir,
      runAnalysisInline: true,
      deepAnalyzer: async ({ pages }) => ({
        summary: "The notice relies on an incomplete test-article bridge.",
        analyzedPages: pages.map((page) => page.pageNumber),
        truncated: false,
        modelProvider: "test/provider",
        filingProfile: {
          substanceName: "Uploaded ingredient",
          substanceType: "botanical_extract",
          productionMethod: "extraction",
          sourceOrganismType: "plant",
          intendedUses: ["protein_products"],
          targetPopulation: "general_population",
          grasBasis: "scientific_procedures",
          safetyDataAvailable: ["subchronic_toxicity"],
          dietaryExposureMethod: "WWEIA",
        },
        evidenceMatrix: [],
        researchReferences: [
          {
            id: "reference",
            title: "Example safety study",
            source: "Journal",
            year: "2024",
            relevance: "Supports the safety assessment.",
            evidence: "Cited by the notifier.",
            origin: "notifier_cited",
            verificationStatus: "extracted_unverified",
            citedPages: [1],
          },
        ],
        findings: [
          {
            id: "test-article-bridge",
            category: "test_article_bridge",
            severity: "critical",
            title: "Test-article bridge is incomplete",
            summary: "The target and studied materials are not shown to be comparable.",
            recommendedAction: "Provide a structured identity, composition, and exposure bridge.",
            evidence: ["Related material is used as the pivotal test article"],
            citations: [
              {
                pageNumber: 1,
                excerpt: "Safety studies include toxicology.",
              },
            ],
            gapType: "adequacy_gap",
            domain: "safety_data",
            confidence: "high",
            evidenceRole: "pivotal",
            availability: "public_peer_reviewed",
            supportingMaterial: "Related material",
            targetMaterial: "Uploaded ingredient",
            testArticle: "Related material",
            bridgeAssessment: "partial",
          },
        ],
        safetySignals: [],
      }),
    })
    const createdResponse = await uploadTestPdf(app, "deep-session")
    const created = (await createdResponse.json()) as { analysis: { id: string } }
    const analysis = await pollAnalysis(app, created.analysis.id, "deep-session")

    expect(analysis.status).toBe("complete")
    expect(analysis.report?.readinessScore).toBe(90)
    expect(analysis.report?.findings[0]?.citations[0]?.pageNumber).toBe(1)
    expect(analysis.report?.modules.comparableFilings[0]?.grnNumber).toBe(742)
    expect(analysis.report?.modules.researchReferences[0]?.verificationStatus).toBe(
      "metadata_verified"
    )
  })

  it("keeps the minimum report when deep analysis fails", async () => {
    const app = createApp({
      analysisMode: "deep",
      dataDir,
      runAnalysisInline: true,
      deepAnalyzer: async () => {
        throw new Error("provider unavailable")
      },
    })
    const createdResponse = await uploadTestPdf(app, "fallback-session")
    const created = (await createdResponse.json()) as { analysis: { id: string } }
    const analysis = await pollAnalysis(app, created.analysis.id, "fallback-session")

    expect(analysis.status).toBe("complete")
    expect(analysis.report?.caveats).toContain(
      "Deep evidence analysis was unavailable; this saved report contains only the minimum structural fallback."
    )
  })

  it("retains grounded analysis and records optional-module failures", async () => {
    const app = createApp({
      analysisMode: "deep",
      dataDir,
      runAnalysisInline: true,
      comparableCorpus: [{ grnNumber: 742 } as never],
      referenceVerifier: async () => {
        throw new Error("metadata provider unavailable")
      },
      deepAnalyzer: async ({ pages }) => ({
        summary: "Grounded core analysis completed.",
        analyzedPages: pages.map((page) => page.pageNumber),
        truncated: false,
        modelProvider: "test/provider",
        filingProfile: {
          substanceName: "Uploaded ingredient",
          substanceType: "protein",
          productionMethod: "extraction",
          intendedUses: [],
          targetPopulation: "general_population",
          grasBasis: "scientific_procedures",
          safetyDataAvailable: [],
        },
        findings: [],
        evidenceMatrix: [],
        safetySignals: [],
        researchReferences: [
          {
            id: "notifier-source",
            title: "Notifier-cited source",
            source: "Filing",
            relevance: "Source cited by notifier.",
            evidence: "Printed reference",
            origin: "notifier_cited",
            verificationStatus: "extracted_unverified",
            citedPages: [1],
          },
        ],
      }),
    })

    const createdResponse = await uploadTestPdf(app, "module-failure-session")
    const created = (await createdResponse.json()) as { analysis: { id: string } }
    const analysis = await pollAnalysis(app, created.analysis.id, "module-failure-session")

    expect(analysis.status).toBe("complete")
    expect(analysis.report?.summary).toBe("Grounded core analysis completed.")
    expect(analysis.report?.modules.researchReferences[0]?.verificationStatus).toBe(
      "extracted_unverified"
    )
    expect(analysis.report?.caveats).toEqual(
      expect.arrayContaining([
        expect.stringContaining("metadata verification was unavailable"),
        expect.stringContaining("Comparable-filing retrieval was unavailable"),
      ])
    )
    expect(analysis.report?.caveats).not.toContain(
      "Deep evidence analysis was unavailable; this saved report contains only the minimum structural fallback."
    )
  })

  it("compares two completed evidence matrices without exposing another owner's filing", async () => {
    const app = createApp({
      analysisMode: "deep",
      dataDir,
      runAnalysisInline: true,
      deepAnalyzer: async () => ({
        summary: "The filing has one evidence-matrix row.",
        analyzedPages: [1],
        truncated: false,
        modelProvider: "test/provider",
        researchReferences: [],
        findings: [],
        evidenceMatrix: [
          {
            id: "identity-composition",
            domain: "identity_characterization",
            requirement: "Identity and composition",
            status: "present",
            assessment: "Identity and composition are documented.",
            evidenceSummary: "The ingredient is identified.",
            citations: [{ pageNumber: 1, excerpt: "Identity and composition are provided." }],
            unresolvedQuestions: [],
            relatedFindingIds: [],
          },
        ],
        safetySignals: [],
      }),
    })
    const baselineResponse = await uploadTestPdf(app, "comparison-session")
    const revisedResponse = await uploadTestPdf(app, "comparison-session")
    const baseline = (await baselineResponse.json()) as { analysis: { id: string } }
    const revised = (await revisedResponse.json()) as { analysis: { id: string } }

    const comparison = await app.request(
      `/api/analyses/${revised.analysis.id}/compare/${baseline.analysis.id}`,
      { headers: { "x-greenlit-session": "comparison-session" } }
    )
    const blocked = await app.request(
      `/api/analyses/${revised.analysis.id}/compare/${baseline.analysis.id}`,
      { headers: { "x-greenlit-session": "another-session" } }
    )

    expect(comparison.status).toBe(200)
    await expect(comparison.json()).resolves.toMatchObject({
      filingDiff: [
        {
          change: "unchanged",
          changeType: "unchanged",
          baselineCitations: [{ pageNumber: 1 }],
          draftCitations: [{ pageNumber: 1 }],
        },
      ],
    })
    expect(blocked.status).toBe(404)
  })

  it("does not expose saved analyses across sessions", async () => {
    const app = createApp({ dataDir, runAnalysisInline: true })
    const createdResponse = await uploadTestPdf(app, "owner-session")
    const created = (await createdResponse.json()) as { analysis: { id: string } }
    await pollAnalysis(app, created.analysis.id, "owner-session")

    const blockedResponse = await app.request(`/api/analyses/${created.analysis.id}`, {
      headers: {
        "x-greenlit-session": "other-session",
      },
    })
    const listResponse = await app.request("/api/analyses", {
      headers: {
        "x-greenlit-session": "other-session",
      },
    })
    const listBody = (await listResponse.json()) as { analyses: unknown[] }

    expect(blockedResponse.status).toBe(404)
    expect(listBody.analyses).toHaveLength(0)
  })

  it("deletes an analysis, its notes, and its stored artifacts for the owning session", async () => {
    const app = createApp({ dataDir, runAnalysisInline: true })
    const createdResponse = await uploadTestPdf(app, "delete-session")
    const created = (await createdResponse.json()) as { analysis: { id: string } }
    const analysis = await pollAnalysis(app, created.analysis.id, "delete-session")

    const blocked = await app.request(`/api/analyses/${analysis.id}`, {
      headers: { "x-greenlit-session": "other-session" },
      method: "DELETE",
    })
    expect(blocked.status).toBe(404)

    const deleted = await app.request(`/api/analyses/${analysis.id}`, {
      headers: { "x-greenlit-session": "delete-session" },
      method: "DELETE",
    })
    expect(deleted.status).toBe(204)

    const missing = await app.request(`/api/analyses/${analysis.id}`, {
      headers: { "x-greenlit-session": "delete-session" },
    })
    expect(missing.status).toBe(404)
    for (const artifact of [analysis.upload, analysis.textArtifact]) {
      if (!artifact) continue
      await expect(readFile(path.join(dataDir, artifact.storageKey))).rejects.toMatchObject({
        code: "ENOENT",
      })
    }
  })

  it("saves workbook notes and returns outline/report downloads for the owning session", async () => {
    const app = createApp({ dataDir, runAnalysisInline: true })
    const createdResponse = await uploadTestPdf(app, "notes-session")
    const created = (await createdResponse.json()) as { analysis: { id: string } }
    await pollAnalysis(app, created.analysis.id, "notes-session")

    const noteResponse = await app.request(`/api/analyses/${created.analysis.id}/notes`, {
      body: JSON.stringify({
        body: "Check the safety evidence table.",
        status: "in_progress",
      }),
      headers: {
        "Content-Type": "application/json",
        "x-greenlit-session": "notes-session",
      },
      method: "POST",
    })
    const notesResponse = await app.request(`/api/analyses/${created.analysis.id}/notes`, {
      headers: {
        "x-greenlit-session": "notes-session",
      },
    })
    const outlineResponse = await app.request(`/api/analyses/${created.analysis.id}/outline`, {
      headers: {
        "x-greenlit-session": "notes-session",
      },
    })
    const exportResponse = await app.request(`/api/analyses/${created.analysis.id}/export`, {
      headers: {
        "x-greenlit-session": "notes-session",
      },
    })

    expect(noteResponse.status).toBe(201)
    await expect(notesResponse.json()).resolves.toMatchObject({
      notes: [
        {
          body: "Check the safety evidence table.",
          status: "in_progress",
        },
      ],
    })
    await expect(outlineResponse.text()).resolves.toContain("# Amendment Outline")
    const exported = await exportResponse.text()
    expect(exported).toContain("Check the safety evidence table.")
    expect(exported).toContain("## Evidence Matrix")
    expect(exported).toContain("## Comparable Filings")
    expect(exported).toContain("## Filing Diff")
    expect(exported).toContain("## Research References")
    expect(exported).toContain("## Amendment Plan")
  })

  it("rejects non-PDF uploads clearly", async () => {
    const app = createApp({ dataDir, runAnalysisInline: true })
    const formData = new FormData()
    formData.set("file", new File(["not a pdf"], "notice.txt", { type: "text/plain" }))

    const response = await app.request("/api/analyses", {
      body: formData,
      headers: {
        "x-greenlit-session": "test-session",
      },
      method: "POST",
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: "Only PDF uploads are supported for the MVP.",
    })
  })

  it("creates an analysis from a verified direct Blob upload", async () => {
    const storageKey = "artifacts/direct-upload.pdf"
    await mkdir(path.join(dataDir, "artifacts"), { recursive: true })
    await writeFile(
      path.join(dataDir, storageKey),
      `%PDF-1.4
      GRAS notice identity composition intended use manufacturing specifications purity safety
      toxicology NOAEL dietary exposure references journal Food Chem 2024 doi:10.1000/example`
    )
    const app = createApp({
      dataDir,
      runAnalysisInline: true,
      resolveUploadedArtifact: async (_ownerId, _pathname, fileName) => ({
        id: "blob-artifact",
        fileName,
        mimeType: "application/pdf",
        size: 240,
        storageKey,
        createdAt: new Date().toISOString(),
      }),
    })
    const response = await app.request("/api/analyses/from-upload", {
      body: JSON.stringify({
        fileName: "notice.pdf",
        pathname: "greenlit/uploads/blob-session/upload-notice.pdf",
      }),
      headers: {
        "Content-Type": "application/json",
        "x-greenlit-session": "blob-session",
      },
      method: "POST",
    })
    const body = (await response.json()) as { analysis: { filingName: string; status: string } }

    expect(response.status).toBe(202)
    expect(body.analysis.filingName).toBe("notice.pdf")
    expect(body.analysis.status).toBe("complete")
  })

  it("rejects direct uploads owned by another session", async () => {
    const app = createApp({ dataDir })
    const response = await app.request("/api/analyses/from-upload", {
      body: JSON.stringify({
        fileName: "notice.pdf",
        pathname: "greenlit/uploads/other-session/upload-notice.pdf",
      }),
      headers: {
        "Content-Type": "application/json",
        "x-greenlit-session": "blob-session",
      },
      method: "POST",
    })

    expect(response.status).toBe(403)
  })
})

describe("authenticated analysis API", () => {
  it("rejects missing bearer tokens and derives ownership from a valid token", async () => {
    const app = createApp({
      dataDir,
      resolveAuthenticatedOwner: async (token) => (token === "valid-token" ? "auth-user-1" : null),
    })

    expect((await app.request("/api/analyses")).status).toBe(401)
    const response = await app.request("/api/analyses", {
      headers: { Authorization: "Bearer valid-token", "x-greenlit-session": "spoofed-owner" },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ analyses: [] })

    const pathResponse = await app.request("/api/uploads/path", {
      body: JSON.stringify({ fileName: "../unsafe filing.pdf" }),
      headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
      method: "POST",
    })
    expect(pathResponse.status).toBe(200)
    await expect(pathResponse.json()).resolves.toMatchObject({
      pathname: expect.stringMatching(
        /^greenlit\/uploads\/auth-user-1\/[\w-]+-unsafe-filing\.pdf$/
      ),
    })
  })
})

async function uploadTestPdf(app: ReturnType<typeof createApp>, sessionId: string) {
  const formData = new FormData()
  formData.set(
    "file",
    new File(
      [
        `%PDF-1.4
        GRAS notice identity composition intended use conditions of use manufacturing quality control
        specifications purity safety toxicology NOAEL dietary exposure estimated daily intake
        references journal Food Chem 2024 doi:10.1000/example`,
      ],
      "notice.pdf",
      { type: "application/pdf" }
    )
  )

  return app.request("/api/analyses", {
    body: formData,
    headers: {
      "x-greenlit-session": sessionId,
    },
    method: "POST",
  })
}

async function pollAnalysis(
  app: ReturnType<typeof createApp>,
  analysisId: string,
  sessionId = "test-session"
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await app.request(`/api/analyses/${analysisId}`, {
      headers: {
        "x-greenlit-session": sessionId,
      },
    })
    const body = (await response.json()) as { analysis: { status: string } }
    if (body.analysis.status === "complete" || body.analysis.status === "failed") {
      return body.analysis as {
        id: string
        status: string
        upload?: { storageKey: string }
        textArtifact?: { mimeType: string; storageKey: string }
        report?: {
          readinessScore: number
          summary: string
          caveats: string[]
          findings: Array<{ citations: Array<{ pageNumber: number }> }>
          modules: {
            comparableFilings: Array<{ grnNumber?: number }>
            researchReferences: Array<{ verificationStatus?: string }>
          }
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  throw new Error("Timed out waiting for analysis to complete")
}
