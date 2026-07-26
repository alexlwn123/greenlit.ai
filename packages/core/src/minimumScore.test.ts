import { describe, expect, it } from "vitest"
import { createMinimumReadinessReport } from "./minimumScore"

describe("createMinimumReadinessReport", () => {
  it("scores a document from required-section coverage and source support", () => {
    const report = createMinimumReadinessReport({
      analysisId: "analysis-test",
      filingName: "Test GRAS notice.pdf",
      generatedAt: "2026-07-06T00:00:00.000Z",
      pageCount: 4,
      extractedText: `
        Identity and composition of the substance. Intended use and conditions of use in food
        categories at maximum use level. Manufacturing process flow and quality control.
        Specifications include purity and acceptance criteria. Safety studies include toxicology,
        genotoxicity, NOAEL, and adverse event review. Dietary exposure and estimated daily intake
        are calculated for consumers. References include Food Chem 2024, Toxicol 2023, doi:10.1000/test.
      `,
    })

    expect(report.readinessScore).toBeGreaterThan(50)
    expect(report.signals).toHaveLength(4)
    expect(report.status).toBe("complete")
    expect(report.modules.documentationBenchmark).toHaveLength(7)
    expect(report.modules.safetySignals).toHaveLength(3)
    expect(report.modules.comparableFilings).toHaveLength(1)
    expect(report.modules.filingDiff).toHaveLength(7)
    expect(report.modules.researchReferences).toEqual([])
    expect(report.modules.amendmentOutline.length).toBeGreaterThan(1)
  })

  it("does not present years or citation markers as research references", () => {
    const report = createMinimumReadinessReport({
      analysisId: "analysis-reference-guard",
      filingName: "Reference markers.pdf",
      extractedText:
        "References include a 2024 report, a projected 2095 scenario, PMID:1234, and doi:10.1000/example.",
      generatedAt: "2026-07-26T00:00:00.000Z",
    })

    expect(report.modules.researchReferences).toEqual([])
  })

  it("emits review findings when critical sections are missing", () => {
    const report = createMinimumReadinessReport({
      analysisId: "analysis-short",
      filingName: "Short note.pdf",
      extractedText: "This note describes a product but does not include much else.",
      generatedAt: "2026-07-06T00:00:00.000Z",
    })

    expect(report.readinessScore).toBeLessThan(40)
    expect(report.findings.some((finding) => finding.severity === "critical")).toBe(true)
    expect(report.modules.documentationBenchmark.some((item) => item.status === "missing")).toBe(
      true
    )
  })
})
