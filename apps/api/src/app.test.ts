import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createApp } from "./app"

let dataDir: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "greenlit-api-"))
})

afterEach(async () => {
  await rm(dataDir, { force: true, recursive: true })
})

describe("local analysis API", () => {
  it("saves an uploaded PDF and produces a minimum readiness score", async () => {
    const app = createApp({ dataDir })
    const createdResponse = await uploadTestPdf(app, "test-session")

    expect(createdResponse.status).toBe(202)
    const created = (await createdResponse.json()) as { analysis: { id: string } }
    const analysis = await pollAnalysis(app, created.analysis.id)

    expect(analysis.status).toBe("complete")
    expect(analysis.upload?.storageKey).toContain("artifacts/")
    expect(analysis.textArtifact?.mimeType).toBe("text/plain")
    expect(analysis.report?.readinessScore).toBeGreaterThan(50)
  })

  it("does not expose saved analyses across sessions", async () => {
    const app = createApp({ dataDir })
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

  it("returns a clear auth error when no local session is present", async () => {
    const app = createApp({ dataDir })
    const response = await app.request("/api/analyses")

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: "Sign in to continue.",
    })
  })

  it("saves workbook notes and returns outline/report downloads for the owning session", async () => {
    const app = createApp({ dataDir })
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
    await expect(exportResponse.text()).resolves.toContain("Check the safety evidence table.")
  })

  it("rejects non-PDF uploads clearly", async () => {
    const app = createApp({ dataDir })
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
        status: string
        upload?: { storageKey: string }
        textArtifact?: { mimeType: string }
        report?: { readinessScore: number }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  throw new Error("Timed out waiting for analysis to complete")
}
