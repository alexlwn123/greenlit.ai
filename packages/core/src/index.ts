import { z } from "zod"

export const FindingSeveritySchema = z.enum(["critical", "major", "minor"])

export const FindingSchema = z.object({
  id: z.string(),
  severity: FindingSeveritySchema,
  title: z.string(),
  summary: z.string(),
  recommendedAction: z.string(),
})

export const ReadinessReportSchema = z.object({
  id: z.string(),
  filingName: z.string(),
  readinessScore: z.number().min(0).max(100),
  status: z.enum(["demo", "queued", "running", "complete", "failed"]),
  generatedAt: z.string(),
  findings: z.array(FindingSchema),
})

export type FindingSeverity = z.infer<typeof FindingSeveritySchema>
export type Finding = z.infer<typeof FindingSchema>
export type ReadinessReport = z.infer<typeof ReadinessReportSchema>

export const demoReport: ReadinessReport = {
  id: "demo-gras-report",
  filingName: "Demo GRAS Notice",
  readinessScore: 72,
  status: "demo",
  generatedAt: "2026-06-04T00:00:00.000Z",
  findings: [
    {
      id: "safety-001",
      severity: "major",
      title: "Safety narrative needs tighter evidence mapping",
      summary:
        "The draft includes safety studies, but the report should connect each study to the intended use level and population more directly.",
      recommendedAction:
        "Add a study-by-study evidence table with dose, exposure, population, endpoint, and relevance to the proposed use.",
    },
    {
      id: "comparables-001",
      severity: "major",
      title: "Comparable filings need clearer rationale",
      summary:
        "Comparable notices are referenced, but the draft does not explain why they are the closest regulatory analogs.",
      recommendedAction:
        "Document the matching criteria for each comparable filing and call out material differences from the draft notice.",
    },
    {
      id: "docs-001",
      severity: "minor",
      title: "Manufacturing controls are under-specified",
      summary:
        "The manufacturing section describes the process flow but leaves several control points and release tests implicit.",
      recommendedAction:
        "Add the missing control points, acceptance criteria, and certificate-of-analysis references before submission review.",
    },
  ],
}
