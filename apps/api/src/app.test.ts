import { createHmac } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createApp,
  createDeletionReceipt,
  type DeletionReceipt,
  redactedRequestPath,
  safeCsvCell,
  validatePdfPageCount,
} from "./app"

let dataDir: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "greenlit-api-"))
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(dataDir, { force: true, recursive: true })
})

describe("local analysis API", () => {
  it("reports the confidential processing boundary without exposing secrets", async () => {
    vi.stubEnv("GREENLIT_MODEL_PROVIDER", "customer_gateway")
    vi.stubEnv("GREENLIT_CUSTOMER_GATEWAY_URL", "https://models.example.com/invoke")
    vi.stubEnv("GREENLIT_CUSTOMER_GATEWAY_TOKEN", "do-not-return")
    const app = createApp({ dataDir })
    const response = await app.request("/api/privacy/model-processing", {
      headers: { "x-greenlit-session": "privacy-user" },
    })
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain("customer_cloud")
    expect(body).toContain("models.example.com")
    expect(body).not.toContain("do-not-return")
    expect(body).not.toContain("/invoke")
  })

  it("reports security-control configuration without exposing endpoints or secrets", async () => {
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("GREENLIT_UPLOAD_SCANNER_URL", "https://scanner.customer.example/private/scan")
    vi.stubEnv("GREENLIT_UPLOAD_SCANNER_TOKEN", "do-not-return-scanner-token")
    vi.stubEnv("GREENLIT_ALLOW_EXTERNAL_UPLOAD_SCANNING", "true")
    vi.stubEnv("GREENLIT_REQUIRE_UPLOAD_MALWARE_SCAN", "true")
    vi.stubEnv("GREENLIT_SECURITY_TELEMETRY_URL", "https://siem.customer.example/private/events")
    vi.stubEnv("GREENLIT_SECURITY_TELEMETRY_TOKEN", "do-not-return-telemetry-token")
    vi.stubEnv("GREENLIT_ALLOW_EXTERNAL_SECURITY_TELEMETRY", "true")
    vi.stubEnv("GREENLIT_DELETION_RECEIPT_SECRET", "do-not-return-a-secret-that-is-long-enough")
    vi.stubEnv("GREENLIT_DELETION_RECEIPT_KEY_ID", "receipts-2026")
    const app = createApp({
      dataDir,
      resolveAuthenticatedOwner: async (token) =>
        token === "valid-auditor-token" ? "owner" : null,
    })

    const response = await app.request("/api/privacy/security-controls", {
      headers: { Authorization: "Bearer valid-auditor-token" },
    })
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(JSON.parse(body)).toMatchObject({
      uploadSecurity: {
        localInspection: "required",
        malwareScannerConfigured: true,
        configurationValid: true,
        malwareScanningRequired: true,
        hostedExternalScanningApproved: true,
        endpointHost: "scanner.customer.example",
        sendsFilename: false,
        digestBinding: "sha256",
      },
      securityTelemetry: {
        configured: true,
        configurationValid: true,
        hostedExternalDeliveryApproved: true,
        endpointHost: "siem.customer.example",
        eventSigning: "hmac-sha256",
        payloadPolicy: "metadata_only",
      },
      deletionReceipts: {
        configured: true,
        algorithm: "HMAC-SHA256",
        keyId: "receipts-2026",
      },
    })
    expect(body).not.toMatch(/do-not-return|\/private\//)
  })

  it("enforces the 500-page filing limit", () => {
    expect(() => validatePdfPageCount(500)).not.toThrow()
    expect(() => validatePdfPageCount(501)).toThrow(/supports filings up to 500 pages/)
  })

  it("returns a privacy-safe receipt only after dossier deletion completes", async () => {
    const app = createApp({ dataDir })
    const headers = { "Content-Type": "application/json", "x-greenlit-session": "delete-dossier" }
    const createdResponse = await app.request("/api/dossiers", {
      method: "POST",
      headers,
      body: JSON.stringify({
        substanceName: "Receipt test ingredient",
        companyName: "Receipt test company",
        substanceType: "other",
        intendedEffect: "Technical effect",
        intendedUses: "Selected foods",
        manufacturingSummary: "Controlled process",
        targetPopulation: "General population",
        grasBasis: "scientific_procedures",
      }),
    })
    const created = (await createdResponse.json()) as { dossier: { id: string } }

    const deleted = await app.request(`/api/dossiers/${created.dossier.id}`, {
      method: "DELETE",
      headers,
    })
    expect(deleted.status).toBe(200)
    const result = (await deleted.json()) as { receipt: DeletionReceipt }
    expect(result.receipt).toMatchObject({
      schemaVersion: 1,
      targetType: "dossier",
      primaryMetadata: "deleted",
      privateObjects: "deleted",
      derivedCaches: "not_applicable",
      providerBackups: "subject_to_provider_lifecycle",
      verification: { status: "unsigned" },
    })
    expect(result.receipt.targetSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(result.receipt)).not.toContain(created.dossier.id)
    expect(await app.request(`/api/dossiers/${created.dossier.id}`, { headers })).toMatchObject({
      status: 404,
    })
  })

  it("signs deletion receipts when an approved server-side key is configured", () => {
    vi.stubEnv(
      "GREENLIT_DELETION_RECEIPT_SECRET",
      "a-secure-receipt-secret-with-at-least-32-characters"
    )
    vi.stubEnv("GREENLIT_DELETION_RECEIPT_KEY_ID", "greenlit-receipts-2026-01")

    const receipt = createDeletionReceipt("analysis", "private-analysis-id")
    expect(receipt.verification).toEqual({
      status: "signed",
      algorithm: "HMAC-SHA256",
      keyId: "greenlit-receipts-2026-01",
      signature: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    const { verification, ...signedFields } = receipt
    if (verification.status !== "signed") throw new Error("Expected a signed receipt")
    expect(verification.signature).toBe(
      createHmac("sha256", "a-secure-receipt-secret-with-at-least-32-characters")
        .update(JSON.stringify(signedFields))
        .digest("hex")
    )
  })

  it("removes capability tokens and record identifiers from log paths", () => {
    expect(
      redactedRequestPath(
        "https://greenlit.ai/api/dossiers/019fa64b-4d08-4900-b955-572b2216d835/sections"
      )
    ).toBe("/api/dossiers/[id]/sections")
    expect(redactedRequestPath(`https://greenlit.ai/api/respond/${"a".repeat(64)}`)).toBe(
      "/api/respond/[redacted]"
    )
  })

  it("issues one-time external evidence response links", async () => {
    const app = createApp({ dataDir })
    const headers = { "Content-Type": "application/json", "x-greenlit-session": "link-user" }
    const createdResponse = await app.request("/api/dossiers", {
      method: "POST",
      headers,
      body: JSON.stringify({
        substanceName: "Test ingredient",
        companyName: "Example Foods",
        substanceType: "other",
        intendedEffect: "Technical effect",
        intendedUses: "Selected foods",
        manufacturingSummary: "Controlled process",
        targetPopulation: "General population",
        grasBasis: "scientific_procedures",
      }),
    })
    const created = (await createdResponse.json()) as {
      dossier: { id: string }
      requirements: Array<{ id: string }>
    }
    const requestResponse = await app.request(`/api/dossiers/${created.dossier.id}/requests`, {
      method: "POST",
      headers,
      body: JSON.stringify({ requirementId: created.requirements[0].id }),
    })
    const workspace = (await requestResponse.json()) as {
      evidenceRequests: Array<{ id: string; status: string; responseNote?: string }>
    }
    const requestId = workspace.evidenceRequests[0].id
    const linkResponse = await app.request(
      `/api/dossiers/${created.dossier.id}/requests/${requestId}/link`,
      { method: "POST", headers, body: JSON.stringify({ expiresInDays: 7 }) }
    )
    expect(linkResponse.status).toBe(201)
    const link = (await linkResponse.json()) as { url: string; expiresAt: string }
    const token = capabilityToken(link.url)
    expect(token).toHaveLength(64)
    expect(new URL(link.url).pathname).toBe("/respond")
    expect(new URL(link.url).hash).toBe(`#token=${token}`)

    const privateWorkspace = (await (
      await app.request(`/api/dossiers/${created.dossier.id}`, { headers })
    ).json()) as { evidenceRequestLinks: Array<{ tokenHash: string }> }
    expect(privateWorkspace.evidenceRequestLinks).toContainEqual(
      expect.objectContaining({ tokenHash: "" })
    )

    const publicRequest = await app.request(`/api/respond/${token}`)
    expect(publicRequest.status).toBe(200)
    const response = await app.request(`/api/respond/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responseNote: "Certificate and batch records are available." }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: true })
    expect((await app.request(`/api/respond/${token}`)).status).toBe(410)

    const reused = await app.request(`/api/respond/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responseNote: "Second response must fail." }),
    })
    expect(reused.status).toBe(410)

    const uploadLinkResponse = await app.request(
      `/api/dossiers/${created.dossier.id}/requests/${requestId}/link`,
      { method: "POST", headers, body: JSON.stringify({ expiresInDays: 7 }) }
    )
    const uploadLink = (await uploadLinkResponse.json()) as { url: string }
    const uploadToken = capabilityToken(uploadLink.url)
    const uploadBody = new FormData()
    uploadBody.set(
      "file",
      new File(["%PDF-1.4 certificate of analysis lead not more than 0.5 ppm\n%%EOF"], "coa.pdf", {
        type: "application/pdf",
      })
    )
    uploadBody.set("category", "specification")
    uploadBody.set("responseNote", "Current certificate of analysis attached.")
    const uploadResponse = await app.request(`/api/respond/${uploadToken}/evidence`, {
      method: "POST",
      body: uploadBody,
    })
    expect(uploadResponse.status).toBe(201)
    const updated = (await (
      await app.request(`/api/dossiers/${created.dossier.id}`, { headers })
    ).json()) as {
      evidence: Array<{ id: string; title: string; verificationStatus: string }>
      evidenceRequests: Array<{ id: string; status: string }>
    }
    expect(updated.evidence).toContainEqual(
      expect.objectContaining({ title: "coa.pdf", verificationStatus: "needs_review" })
    )
    expect(updated.evidenceRequests.find((item) => item.id === requestId)?.status).toBe("received")
    const uploadedEvidence = updated.evidence.find((item) => item.title === "coa.pdf") as {
      id: string
    }
    const suggestionsResponse = await app.request(
      `/api/dossiers/${created.dossier.id}/evidence/${uploadedEvidence.id}/fact-suggestions`,
      { method: "POST", headers }
    )
    expect(suggestionsResponse.status).toBe(200)
    const suggestions = (await suggestionsResponse.json()) as {
      candidates: Array<{ id: string; status: string; kind: string }>
    }
    expect(suggestions.candidates).toContainEqual(
      expect.objectContaining({ status: "proposed", kind: "specification" })
    )
    const candidateId = suggestions.candidates[0].id
    const acceptedResponse = await app.request(
      `/api/dossiers/${created.dossier.id}/extraction-candidates/${candidateId}`,
      { method: "POST", headers, body: JSON.stringify({ action: "accept" }) }
    )
    expect(acceptedResponse.status).toBe(200)
    const accepted = (await acceptedResponse.json()) as {
      extractionCandidates: Array<{ id: string; status: string; acceptedFactId?: string }>
      factBookEntries: Array<{ id: string; status: string }>
    }
    const candidate = accepted.extractionCandidates.find((item) => item.id === candidateId)
    expect(candidate).toMatchObject({ status: "accepted", acceptedFactId: expect.any(String) })
    expect(accepted.factBookEntries).toContainEqual(
      expect.objectContaining({ id: candidate?.acceptedFactId, status: "draft" })
    )

    const activeLinkResponse = await app.request(
      `/api/dossiers/${created.dossier.id}/requests/${requestId}/link`,
      { method: "POST", headers, body: JSON.stringify({ expiresInDays: 7 }) }
    )
    const activeLink = (await activeLinkResponse.json()) as { url: string }
    const activeToken = capabilityToken(activeLink.url)
    const resolvedResponse = await app.request(
      `/api/dossiers/${created.dossier.id}/requests/${requestId}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ status: "resolved", responseNote: "Materials accepted." }),
      }
    )
    expect(resolvedResponse.status).toBe(200)
    expect((await app.request(`/api/respond/${activeToken}`)).status).toBe(410)
    expect(
      (
        await app.request(`/api/dossiers/${created.dossier.id}/requests/${requestId}/link`, {
          method: "POST",
          headers,
          body: "{}",
        })
      ).status
    ).toBe(409)
  })

  it("provides a secure consultant review portal with targeted findings", async () => {
    const app = createApp({ dataDir })
    const headers = { "Content-Type": "application/json", "x-greenlit-session": "review-user" }
    const createdResponse = await app.request("/api/dossiers", {
      method: "POST",
      headers,
      body: JSON.stringify({
        substanceName: "Review ingredient",
        companyName: "Example",
        substanceType: "other",
        intendedEffect: "Effect",
        intendedUses: "Foods",
        manufacturingSummary: "Process",
        targetPopulation: "General population",
        grasBasis: "scientific_procedures",
      }),
    })
    const created = (await createdResponse.json()) as {
      dossier: { id: string }
      sections: Array<{ id: string }>
    }
    const handoffResponse = await app.request(`/api/dossiers/${created.dossier.id}/handoffs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ consultantName: "Dr. Reviewer", scope: "Independent dossier review" }),
    })
    const handedOff = (await handoffResponse.json()) as { handoffs: Array<{ id: string }> }
    const linkResponse = await app.request(
      `/api/dossiers/${created.dossier.id}/handoffs/${handedOff.handoffs[0].id}/link`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ expiresInDays: 5 }),
      }
    )
    expect(linkResponse.status).toBe(201)
    const link = (await linkResponse.json()) as { url: string }
    const token = capabilityToken(link.url)
    const portalResponse = await app.request(`/api/review/${token}`)
    expect(portalResponse.status).toBe(200)
    const issueResponse = await app.request(`/api/review/${token}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "section",
        targetId: created.sections[0].id,
        title: "Certification needs revision",
        body: "Clarify the signatory authority.",
        priority: "blocking",
      }),
    })
    expect(issueResponse.status).toBe(201)
    const reviewed = (await issueResponse.json()) as {
      issues: Array<{ title: string; status: string; priority: string }>
    }
    expect(reviewed.issues).toContainEqual(
      expect.objectContaining({
        title: "Certification needs revision",
        status: "open",
        priority: "blocking",
      })
    )
    const completed = await app.request(
      `/api/dossiers/${created.dossier.id}/handoffs/${handedOff.handoffs[0].id}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ status: "completed", responseNote: "Review complete." }),
      }
    )
    expect(completed.status).toBe(200)
    expect((await app.request(`/api/review/${token}`)).status).toBe(410)
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

  it("supports the evidence-to-draft dossier workflow", async () => {
    const app = createApp({ dataDir })
    const headers = { "Content-Type": "application/json", "x-greenlit-session": "dossier-user" }
    const createdResponse = await app.request("/api/dossiers", {
      method: "POST",
      headers,
      body: JSON.stringify({
        substanceName: "Fermented pea protein",
        companyName: "Example Foods",
        substanceType: "fermentation",
        intendedEffect: "Protein source",
        intendedUses: "Nutrition bars at specified use levels",
        manufacturingSummary: "Controlled fermentation and purification",
        targetPopulation: "General U.S. population",
        grasBasis: "scientific_procedures",
      }),
    })
    expect(createdResponse.status).toBe(201)
    const created = (await createdResponse.json()) as {
      dossier: { id: string }
      requirements: Array<{ id: string }>
      sections: Array<{ id: string }>
    }

    const evidenceForm = new FormData()
    evidenceForm.set("requirementId", "auto")
    evidenceForm.set("category", "identity")
    evidenceForm.set(
      "file",
      new File(
        ["%PDF-1.4 identity composition analytical characterization\n%%EOF"],
        "identity.pdf",
        {
          type: "application/pdf",
        }
      )
    )
    const evidenceResponse = await app.request(`/api/dossiers/${created.dossier.id}/evidence`, {
      method: "POST",
      headers: { "x-greenlit-session": "dossier-user" },
      body: evidenceForm,
    })
    expect(evidenceResponse.status).toBe(201)
    const withEvidence = (await evidenceResponse.json()) as {
      evidence: Array<{ id: string; verificationStatus: string }>
    }
    expect(withEvidence.evidence[0].verificationStatus).toBe("needs_review")
    expect((withEvidence.evidence[0] as { requirementId?: string }).requirementId).toBe(
      created.requirements[0].id
    )
    const passagesResponse = await app.request(
      `/api/dossiers/${created.dossier.id}/evidence/${withEvidence.evidence[0].id}/pages`,
      { headers: { "x-greenlit-session": "dossier-user" } }
    )
    expect(passagesResponse.status).toBe(200)
    await expect(passagesResponse.json()).resolves.toMatchObject({
      passages: [{ pageNumber: 1, text: expect.stringContaining("analytical characterization") }],
    })

    const verifiedResponse = await app.request(
      `/api/dossiers/${created.dossier.id}/evidence/${withEvidence.evidence[0].id}/verify`,
      { method: "POST", headers, body: JSON.stringify({ status: "verified" }) }
    )
    expect(verifiedResponse.status).toBe(200)

    const claimResponse = await app.request(`/api/dossiers/${created.dossier.id}/claims`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        evidenceId: withEvidence.evidence[0].id,
        sectionId: created.sections[0].id,
        statement: "The notified substance is analytically characterized.",
        sourceExcerpt: "identity composition analytical characterization",
        sourcePage: 1,
      }),
    })
    expect(claimResponse.status).toBe(201)
    const withClaim = (await claimResponse.json()) as { claims: Array<{ id: string }> }
    const claimId = withClaim.claims[0].id
    const claimReviewResponse = await app.request(
      `/api/dossiers/${created.dossier.id}/claims/${claimId}/review`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          statement: "The notified substance is analytically characterized.",
          status: "verified",
        }),
      }
    )
    expect(claimReviewResponse.status).toBe(200)

    const starterResponse = await app.request(
      `/api/dossiers/${created.dossier.id}/sections/${created.sections[0].id}/starter`,
      { method: "POST", headers }
    )
    expect(starterResponse.status).toBe(200)
    const drafted = (await starterResponse.json()) as {
      sections: Array<{ content: string; status: string }>
    }
    expect(drafted.sections[0].content).toContain("working section")
    expect(drafted.sections[0].content).toContain(`[[claim:${claimId}]]`)

    const exportResponse = await app.request(`/api/dossiers/${created.dossier.id}/export`, {
      headers: { "x-greenlit-session": "dossier-user" },
    })
    expect(exportResponse.status).toBe(200)
    const exported = await exportResponse.text()
    expect(exported).toContain("WORKING DRAFT")
    expect(exported).toContain("[^1]")
    expect(exported).toContain("identity.pdf, p. 1")
    expect(drafted.sections[0].status).toBe("draft")

    const qualityResponse = await app.request(`/api/dossiers/${created.dossier.id}/quality`, {
      headers: { "x-greenlit-session": "dossier-user" },
    })
    expect(qualityResponse.status).toBe(200)
    await expect(qualityResponse.json()).resolves.toMatchObject({ checks: expect.any(Array) })

    const deleteEvidenceResponse = await app.request(
      `/api/dossiers/${created.dossier.id}/evidence/${withEvidence.evidence[0].id}`,
      { method: "DELETE", headers: { "x-greenlit-session": "dossier-user" } }
    )
    expect(deleteEvidenceResponse.status).toBe(200)
    const afterDelete = (await deleteEvidenceResponse.json()) as {
      evidence: unknown[]
      claims: unknown[]
      requirements: Array<{ id: string; evidenceCount: number; status: string }>
    }
    expect(afterDelete.evidence).toEqual([])
    expect(afterDelete.claims).toEqual([])
    expect(
      afterDelete.requirements.find((item) => item.id === created.requirements[0].id)
    ).toMatchObject({
      evidenceCount: 0,
      status: "missing",
    })
  })

  it("builds a consultant handoff and multi-artifact dossier package", async () => {
    const app = createApp({ dataDir })
    const headers = { "Content-Type": "application/json", "x-greenlit-session": "release-user" }
    const createdResponse = await app.request("/api/dossiers", {
      method: "POST",
      headers,
      body: JSON.stringify({
        substanceName: "Release ingredient",
        companyName: "Example Foods",
        substanceType: "other",
        intendedEffect: "Technical effect",
        intendedUses: "Selected foods",
        manufacturingSummary: "Controlled manufacturing",
        targetPopulation: "General U.S. population",
        grasBasis: "scientific_procedures",
      }),
    })
    const created = (await createdResponse.json()) as { dossier: { id: string } }
    const handoffResponse = await app.request(`/api/dossiers/${created.dossier.id}/handoffs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        consultantName: "Dr. Reviewer",
        consultantEmail: "reviewer@example.com",
        scope: "Independent scientific review",
      }),
    })
    expect(handoffResponse.status).toBe(201)
    const handedOff = (await handoffResponse.json()) as {
      handoffs: Array<{ id: string; status: string }>
    }
    expect(handedOff.handoffs[0].status).toBe("prepared")
    const reviewResponse = await app.request(
      `/api/dossiers/${created.dossier.id}/handoffs/${handedOff.handoffs[0].id}`,
      { method: "POST", headers, body: JSON.stringify({ status: "in_review" }) }
    )
    expect(reviewResponse.status).toBe(200)
    const factResponse = await app.request(`/api/dossiers/${created.dossier.id}/facts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        kind: "specification",
        title: "Lead specification",
        fields: { parameter: "Lead", limit: "≤0.5", unit: "ppm", method: "ICP-MS" },
      }),
    })
    expect(factResponse.status).toBe(201)
    const withFact = (await factResponse.json()) as {
      factBookEntries: Array<{ id: string; status: string }>
    }
    const verifyFact = await app.request(
      `/api/dossiers/${created.dossier.id}/facts/${withFact.factBookEntries[0].id}/review`,
      { method: "POST", headers, body: JSON.stringify({ status: "verified" }) }
    )
    expect(verifyFact.status).toBe(200)
    const packageResponse = await app.request(`/api/dossiers/${created.dossier.id}/package`, {
      headers: { "x-greenlit-session": "release-user" },
    })
    expect(packageResponse.status).toBe(200)
    expect(packageResponse.headers.get("content-type")).toBe("application/zip")
    const archive = Buffer.from(await packageResponse.arrayBuffer())
    expect(archive.subarray(0, 4).toString("hex")).toBe("504b0304")
    expect(archive.toString("utf8")).toContain("manifest.json")
    expect(archive.toString("utf8")).toContain("02-claim-ledger.csv")
    expect(archive.toString("utf8")).toContain("07-fact-book.csv")
  })

  it("blocks controlled-content edits while a release is locked", async () => {
    const app = createApp({ dataDir })
    const headers = { "Content-Type": "application/json", "x-greenlit-session": "locked-user" }
    const response = await app.request("/api/dossiers", {
      method: "POST",
      headers,
      body: JSON.stringify({
        substanceName: "Locked ingredient",
        companyName: "Example",
        substanceType: "other",
        intendedEffect: "Effect",
        intendedUses: "Foods",
        manufacturingSummary: "Process",
        targetPopulation: "General population",
        grasBasis: "scientific_procedures",
      }),
    })
    const created = (await response.json()) as {
      dossier: { id: string; ownerId: string }
      sections: Array<{ id: string }>
    }
    const databasePath = path.join(dataDir, "db.json")
    const database = JSON.parse(await readFile(databasePath, "utf8")) as {
      dossierReleases?: unknown[]
    }
    database.dossierReleases = [
      {
        id: "release-1",
        dossierId: created.dossier.id,
        ownerId: created.dossier.ownerId,
        status: "locked",
        qualitySnapshot: [],
        packageVersion: 1,
        lockedAt: "2026-07-26T00:00:00.000Z",
        updatedAt: "2026-07-26T00:00:00.000Z",
      },
    ]
    await writeFile(databasePath, JSON.stringify(database))
    const edit = await app.request(
      `/api/dossiers/${created.dossier.id}/sections/${created.sections[0].id}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ content: "Changed controlled content", status: "draft" }),
      }
    )
    expect(edit.status).toBe(423)
    await expect(edit.json()).resolves.toMatchObject({ error: expect.stringContaining("Unlock") })

    const submissionResponse = await app.request(
      `/api/dossiers/${created.dossier.id}/submissions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          releaseId: "release-1",
          agency: "FDA",
          status: "submitted",
          trackingNumber: "GRN-TEST",
        }),
      }
    )
    expect(submissionResponse.status).toBe(201)
    const submitted = (await submissionResponse.json()) as {
      submissions: Array<{ id: string; status: string }>
    }
    const submissionId = submitted.submissions[0].id
    const questionResponse = await app.request(
      `/api/dossiers/${created.dossier.id}/submissions/${submissionId}/questions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "Clarify specifications",
          body: "Provide supporting batch data.",
          priority: "blocking",
        }),
      }
    )
    expect(questionResponse.status).toBe(201)
    const questioned = (await questionResponse.json()) as {
      agencyQuestions: Array<{ id: string; status: string }>
      submissions: Array<{ id: string; status: string }>
    }
    expect(questioned.submissions.find((item) => item.id === submissionId)?.status).toBe(
      "questions"
    )
    const questionId = questioned.agencyQuestions[0].id
    const answeredResponse = await app.request(
      `/api/dossiers/${created.dossier.id}/questions/${questionId}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          status: "answered",
          response: "Three representative batch records are attached.",
        }),
      }
    )
    expect(answeredResponse.status).toBe(200)
    const answered = (await answeredResponse.json()) as {
      agencyQuestions: Array<{ id: string; status: string }>
    }
    expect(answered.agencyQuestions.find((item) => item.id === questionId)?.status).toBe("answered")
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
    const cacheDirectory = path.join(dataDir, "model-cache", analysis.id)
    await mkdir(cacheDirectory, { recursive: true })
    await writeFile(path.join(cacheDirectory, "confidential-model-output.json"), "{}")

    const blocked = await app.request(`/api/analyses/${analysis.id}`, {
      headers: { "x-greenlit-session": "other-session" },
      method: "DELETE",
    })
    expect(blocked.status).toBe(404)

    const deleted = await app.request(`/api/analyses/${analysis.id}`, {
      headers: { "x-greenlit-session": "delete-session" },
      method: "DELETE",
    })
    expect(deleted.status).toBe(200)
    await expect(deleted.json()).resolves.toMatchObject({
      receipt: {
        schemaVersion: 1,
        targetType: "analysis",
        targetSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        primaryMetadata: "deleted",
        privateObjects: "deleted",
        derivedCaches: "deleted",
        providerBackups: "subject_to_provider_lifecycle",
      },
    })

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
    await expect(
      readFile(path.join(cacheDirectory, "confidential-model-output.json"))
    ).rejects.toMatchObject({
      code: "ENOENT",
    })
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
      toxicology NOAEL dietary exposure references journal Food Chem 2024 doi:10.1000/example
      %%EOF`
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
    const body = (await response.json()) as {
      analysis: {
        filingName: string
        status: string
        upload?: { security?: { sha256: string; malwareScan: { status: string } } }
      }
    }

    expect(response.status).toBe(202)
    expect(body.analysis.filingName).toBe("notice.pdf")
    expect(body.analysis.status).toBe("complete")
    expect(body.analysis.upload?.security).toMatchObject({
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      malwareScan: { status: "not_configured" },
    })
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

describe("API security boundaries", () => {
  it("redacts bearer credentials from application log paths", () => {
    expect(redactedRequestPath(`https://greenlit.ai/api/respond/${"a".repeat(64)}/evidence`)).toBe(
      "/api/respond/[redacted]/evidence"
    )
    expect(redactedRequestPath(`https://greenlit.ai/api/review/${"b".repeat(64)}/issues`)).toBe(
      "/api/review/[redacted]/issues"
    )
  })

  it("neutralizes spreadsheet formulas in CSV exports", () => {
    expect(safeCsvCell('=HYPERLINK("https://attacker.invalid")')).toBe(
      '"\'=HYPERLINK(""https://attacker.invalid"")"'
    )
    expect(safeCsvCell("  -2+3")).toBe('"\'  -2+3"')
    expect(safeCsvCell("ordinary text")).toBe('"ordinary text"')
  })
  it("fails closed in hosted environments instead of trusting a browser session header", async () => {
    vi.stubEnv("VERCEL", "1")
    const app = createApp({ dataDir })

    const response = await app.request("/api/analyses", {
      headers: { "x-greenlit-session": "attacker-selected-owner" },
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Not authenticated" })
  })

  it("rejects oversized JSON before parsing it", async () => {
    const app = createApp({ dataDir })
    const response = await app.request("/api/dossiers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(256 * 1024 + 1),
        "x-greenlit-session": "size-test",
      },
      body: "{}",
    })

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({ error: "JSON request body is too large." })
  })

  it("rejects files that claim to be PDFs without a PDF signature", async () => {
    const app = createApp({ dataDir })
    const formData = new FormData()
    formData.set("file", new File(["not a pdf"], "filing.pdf", { type: "application/pdf" }))

    const response = await app.request("/api/analyses", {
      method: "POST",
      headers: { "x-greenlit-session": "signature-test" },
      body: formData,
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "The uploaded file is not a valid PDF.",
    })
  })

  it("quarantines PDFs containing active content before creating an analysis", async () => {
    const app = createApp({ dataDir })
    const formData = new FormData()
    formData.set(
      "file",
      new File(["%PDF-1.7\n1 0 obj << /JavaScript 2 0 R >> endobj\n%%EOF"], "active-content.pdf", {
        type: "application/pdf",
      })
    )

    const response = await app.request("/api/analyses", {
      method: "POST",
      headers: { "x-greenlit-session": "active-content-test" },
      body: formData,
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "This PDF contains active or embedded content that Greenlit does not accept.",
    })
    const analyses = await app.request("/api/analyses", {
      headers: { "x-greenlit-session": "active-content-test" },
    })
    await expect(analyses.json()).resolves.toEqual({ analyses: [] })
  })

  it("fails closed before storage when required malware scanning is unavailable", async () => {
    vi.stubEnv("GREENLIT_REQUIRE_UPLOAD_MALWARE_SCAN", "true")
    const app = createApp({ dataDir })
    const formData = new FormData()
    formData.set(
      "file",
      new File(["%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF"], "passive.pdf", {
        type: "application/pdf",
      })
    )

    const response = await app.request("/api/analyses", {
      method: "POST",
      headers: { "x-greenlit-session": "required-scan-test" },
      body: formData,
    })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: "Upload security scanning is temporarily unavailable. Try again later.",
    })
    const analyses = await app.request("/api/analyses", {
      headers: { "x-greenlit-session": "required-scan-test" },
    })
    await expect(analyses.json()).resolves.toEqual({ analyses: [] })
  })

  it("marks API responses private and applies browser hardening headers", async () => {
    const response = await createApp({ dataDir }).request("/api/health")

    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("pragma")).toBe("no-cache")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  })

  it("throttles repeated writes against public bearer links", async () => {
    const app = createApp({ dataDir })
    const token = "a".repeat(64)
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await app.request(`/api/respond/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      expect(response.status).toBe(400)
    }

    const blocked = await app.request(`/api/respond/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get("retry-after")).toBeTruthy()
    await expect(blocked.json()).resolves.toEqual({ error: "Too many requests. Try again later." })
  })

  it("bounds public review content before it reaches storage", async () => {
    const response = await createApp({ dataDir }).request(`/api/review/${"b".repeat(64)}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "dossier",
        targetId: "dossier-id",
        title: "x".repeat(201),
        body: "Review note",
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Finding titles cannot exceed 200 characters and notes cannot exceed 10,000.",
    })
  })
})

function capabilityToken(url: string) {
  return new URLSearchParams(new URL(url).hash.slice(1)).get("token") ?? ""
}

async function uploadTestPdf(app: ReturnType<typeof createApp>, sessionId: string) {
  const formData = new FormData()
  formData.set(
    "file",
    new File(
      [
        `%PDF-1.4
        GRAS notice identity composition intended use conditions of use manufacturing quality control
        specifications purity safety toxicology NOAEL dietary exposure estimated daily intake
        references journal Food Chem 2024 doi:10.1000/example
        %%EOF`,
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
