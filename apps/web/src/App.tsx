import type { AnalysisRecord, FilingDiffItem, ReadinessReport } from "@greenlit/core"
import { demoReport, getEvidenceMatrixScoreBreakdown } from "@greenlit/core"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileSearch,
  FileText,
  FolderOpen,
  LoaderCircle,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  NotebookPen,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import {
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  compareAnalyses,
  createAnalysis,
  deleteAnalysis as deleteSavedAnalysis,
  downloadAnalysisFile,
  listAnalyses,
  waitForAnalysis,
} from "./api"

type LoadState = "idle" | "loading" | "uploading" | "polling"
type Route = { name: "home" } | { name: "analysis"; id?: string } | { name: "workspace" }

const analysisSections = [
  { id: "executive-summary", label: "Executive summary" },
  { id: "readiness-signals", label: "Readiness signals" },
  { id: "critical-findings", label: "Critical findings" },
  { id: "documentation", label: "Documentation" },
  { id: "safety-evidence", label: "Safety evidence" },
  { id: "comparable-filings", label: "Comparable filings" },
  { id: "revision-comparison", label: "Revision comparison" },
  { id: "research-references", label: "Research references" },
  { id: "amendment-plan", label: "Amendment plan" },
] as const

const scoreImportanceOrder = { high: 0, medium: 1, low: 2 } as const

export default function App() {
  const [route, setRoute] = useState<Route>(() => readRoute())
  const [history, setHistory] = useState<AnalysisRecord[]>([])
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisRecord | null>(null)
  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [error, setError] = useState<string | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const refreshHistory = useCallback(async () => {
    try {
      const analyses = await listAnalyses()
      setError(null)
      setHistory(analyses)
      setActiveAnalysis((current) => {
        const currentRoute = readRoute()
        const routeId = currentRoute.name === "analysis" ? currentRoute.id : undefined
        return (
          analyses.find((analysis) => analysis.id === routeId) ??
          analyses.find((analysis) => analysis.id === current?.id) ??
          current
        )
      })
    } catch (refreshError) {
      setError(errorMessage(refreshError))
    } finally {
      setLoadState((current) => (current === "loading" ? "idle" : current))
    }
  }, [])

  useEffect(() => {
    void refreshHistory()
    const onPopState = () => setRoute(readRoute())
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [refreshHistory])

  const navigate = useCallback((next: Route) => {
    window.history.pushState({}, "", routePath(next))
    setRoute(next)
    setMobileNavOpen(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ""
    if (!file) return

    setError(null)
    setLoadState("uploading")

    try {
      const created = await createAnalysis(file)
      setActiveAnalysis(created)
      setHistory((current) => [created, ...current.filter((item) => item.id !== created.id)])
      setLoadState("polling")

      const completed = await waitForAnalysis(created.id, (analysis) => {
        setActiveAnalysis(analysis)
        setHistory((current) => [analysis, ...current.filter((item) => item.id !== analysis.id)])
      })

      setActiveAnalysis(completed)
      await refreshHistory()
      navigate({ name: "analysis", id: completed.id })
    } catch (uploadError) {
      setError(errorMessage(uploadError))
    } finally {
      setLoadState("idle")
    }
  }

  function openAnalysis(analysis: AnalysisRecord) {
    setActiveAnalysis(analysis)
    navigate({ name: "analysis", id: analysis.id })
  }

  function openDemo() {
    setActiveAnalysis(null)
    navigate({ name: "analysis", id: "demo" })
  }

  async function download(kind: "outline" | "export") {
    if (!activeAnalysis?.id) return
    try {
      await downloadAnalysisFile(activeAnalysis.id, kind)
    } catch (downloadError) {
      setError(errorMessage(downloadError))
    }
  }

  async function removeAnalysis() {
    if (!activeAnalysis?.id) return
    const confirmed = window.confirm(
      `Permanently delete ${activeAnalysis.filingName} and its stored files? This cannot be undone.`
    )
    if (!confirmed) return

    try {
      await deleteSavedAnalysis(activeAnalysis.id)
      setHistory((current) => current.filter((analysis) => analysis.id !== activeAnalysis.id))
      setActiveAnalysis(null)
      navigate({ name: "workspace" })
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    }
  }

  const report =
    route.name === "analysis" && route.id === "demo"
      ? demoReport
      : (activeAnalysis?.report ??
        history.find((analysis) => analysis.id === (route.name === "analysis" ? route.id : ""))
          ?.report)

  return (
    <div className="site-frame">
      <Header
        route={route}
        navigate={navigate}
        mobileNavOpen={mobileNavOpen}
        setMobileNavOpen={setMobileNavOpen}
      />

      {route.name === "home" ? (
        <LandingPage
          history={history}
          loadState={loadState}
          activeAnalysis={activeAnalysis}
          error={error}
          onUpload={handleUpload}
          onOpenDemo={openDemo}
          onOpenAnalysis={openAnalysis}
        />
      ) : null}

      {route.name === "analysis" ? (
        <AnalysisPage
          key={activeAnalysis?.id ?? (route.id === "demo" ? "demo" : "missing")}
          report={report}
          analysis={activeAnalysis}
          history={history}
          error={error}
          onBack={() => navigate({ name: "home" })}
          onDelete={removeAnalysis}
          onDownload={download}
        />
      ) : null}

      {route.name === "workspace" ? (
        <WorkspacePage
          history={history}
          loadState={loadState}
          onOpenAnalysis={openAnalysis}
          onUpload={() => navigate({ name: "home" })}
        />
      ) : null}
    </div>
  )
}

function Header({
  route,
  navigate,
  mobileNavOpen,
  setMobileNavOpen,
}: {
  route: Route
  navigate: (route: Route) => void
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
}) {
  return (
    <header className="global-header">
      <button className="brand" type="button" onClick={() => navigate({ name: "home" })}>
        <span className="brand-mark">G</span>
        <span>GREENLIT</span>
      </button>

      <nav className={mobileNavOpen ? "global-nav is-open" : "global-nav"} aria-label="Primary">
        <button
          type="button"
          className={route.name === "home" ? "is-active" : ""}
          onClick={() => navigate({ name: "home" })}
        >
          Analyze
        </button>
        <button
          type="button"
          className={route.name === "workspace" ? "is-active" : ""}
          onClick={() => navigate({ name: "workspace" })}
        >
          Workspace
        </button>
        <span className="nav-divider" />
        <span className="system-status">
          <i />
          Systems operational
        </span>
      </nav>

      <div className="header-meta">
        <span className="private-badge">
          <LockKeyhole />
          Private
        </span>
        <button
          type="button"
          className="icon-button menu-button"
          aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
        >
          {mobileNavOpen ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  )
}

function LandingPage({
  history,
  loadState,
  activeAnalysis,
  error,
  onUpload,
  onOpenDemo,
  onOpenAnalysis,
}: {
  history: AnalysisRecord[]
  loadState: LoadState
  activeAnalysis: AnalysisRecord | null
  error: string | null
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onOpenDemo: () => void
  onOpenAnalysis: (analysis: AnalysisRecord) => void
}) {
  const isProcessing = loadState === "uploading" || loadState === "polling"

  return (
    <main>
      <section className="hero-section">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="kicker">
              <Sparkles />
              Regulatory intelligence, accelerated
            </p>
            <h1>
              Know if your filing
              <br />
              is ready <em>before they do.</em>
            </h1>
            <p className="hero-lede">
              Upload your draft GRAS notice. Greenlit maps the evidence, surfaces regulatory gaps,
              and builds a prioritized path to submission.
            </p>
            <div className="hero-proof">
              <span>
                <ShieldCheck />
                Confidential by design
              </span>
              <span>
                <Clock3 />
                Analysis in minutes
              </span>
            </div>
          </div>

          <UploadPanel
            loadState={loadState}
            activeAnalysis={activeAnalysis}
            error={error}
            onUpload={onUpload}
          />
        </div>
      </section>

      <section className="intel-strip" aria-label="Analysis capabilities">
        <div>
          <span>01</span>
          <strong>Evidence mapping</strong>
          <p>Trace every safety claim to source support.</p>
        </div>
        <div>
          <span>02</span>
          <strong>Regulatory benchmark</strong>
          <p>Compare structure against successful filings.</p>
        </div>
        <div>
          <span>03</span>
          <strong>Action plan</strong>
          <p>Resolve the highest-risk gaps first.</p>
        </div>
        <button type="button" onClick={onOpenDemo}>
          Explore sample analysis
          <ArrowRight />
        </button>
      </section>

      <section className="recent-section">
        <div className="section-title-row">
          <div>
            <p className="section-label">RECENT WORK</p>
            <h2>Your latest analyses</h2>
          </div>
          <span>{history.length.toString().padStart(2, "0")} FILES</span>
        </div>

        {history.length > 0 ? (
          <div className="recent-table">
            {history.slice(0, 4).map((analysis) => (
              <button key={analysis.id} type="button" onClick={() => onOpenAnalysis(analysis)}>
                <FileText />
                <span>
                  <strong>{analysis.filingName}</strong>
                  <small>{formatDate(analysis.updatedAt)}</small>
                </span>
                <span className={`state-dot state-${analysis.status}`}>
                  {analysis.status === "complete"
                    ? `${analysis.report?.readinessScore ?? "—"} / 100`
                    : analysis.status}
                </span>
                <ChevronRight />
              </button>
            ))}
          </div>
        ) : (
          <div className="recent-empty">
            <FolderOpen />
            <div>
              <strong>No analyses yet</strong>
              <p>Your uploaded filings will appear here.</p>
            </div>
          </div>
        )}
      </section>

      {isProcessing ? <ProcessingOverlay analysis={activeAnalysis} loadState={loadState} /> : null}
    </main>
  )
}

function UploadPanel({
  loadState,
  activeAnalysis,
  error,
  onUpload,
}: {
  loadState: LoadState
  activeAnalysis: AnalysisRecord | null
  error: string | null
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  const isProcessing = loadState === "uploading" || loadState === "polling"

  return (
    <div className="upload-card">
      <div className="upload-card-top">
        <span>NEW ANALYSIS</span>
        <span>PDF · MAX 40 MB / 500 PAGES</span>
      </div>
      <label className={isProcessing ? "upload-target is-busy" : "upload-target"}>
        <span className="upload-icon-wrap">
          {isProcessing ? <LoaderCircle className="spin" /> : <Upload />}
        </span>
        <strong>{isProcessing ? "Analyzing filing" : "Drop your draft filing here"}</strong>
        <p>
          {isProcessing
            ? activeAnalysis?.filingName
            : "or click to securely select a PDF from your device"}
        </p>
        <span className="upload-cta">{isProcessing ? "Processing…" : "Select PDF"}</span>
        <input
          type="file"
          accept="application/pdf"
          aria-label="Choose PDF"
          onChange={onUpload}
          disabled={isProcessing}
        />
      </label>
      <div className="upload-card-bottom">
        <span>
          <LockKeyhole />
          Encrypted in transit
        </span>
        <span>Files remain private</span>
      </div>
      {error ? (
        <div className="inline-error" role="alert">
          <CircleAlert />
          {error}
        </div>
      ) : null}
    </div>
  )
}

function ProcessingOverlay({
  analysis,
  loadState,
}: {
  analysis: AnalysisRecord | null
  loadState: LoadState
}) {
  const running = loadState === "polling"
  return (
    <div className="processing-overlay" role="status" aria-live="polite">
      <div className="processing-modal">
        <div className="processing-header">
          <span className="document-icon">
            <FileText />
          </span>
          <div>
            <p>ANALYSIS IN PROGRESS</p>
            <h2>{analysis?.filingName ?? "Securing your document"}</h2>
          </div>
          <LoaderCircle className="spin" />
        </div>
        <div className="processing-progress">
          <span style={{ width: running ? "68%" : "28%" }} />
        </div>
        <div className="processing-steps">
          <ProcessStep done label="Document received" meta="Encrypted and stored" />
          <ProcessStep
            done={running}
            active={!running}
            label="Extracting filing structure"
            meta="PDF text and section map"
          />
          <ProcessStep
            active={running}
            label="Evaluating evidence"
            meta="Claims, sources, and regulatory gaps"
          />
          <ProcessStep label="Building readiness report" meta="Scoring and prioritized actions" />
        </div>
        <p className="processing-footnote">
          You can leave this window open. This usually takes under two minutes.
        </p>
      </div>
    </div>
  )
}

function ProcessStep({
  done = false,
  active = false,
  label,
  meta,
}: {
  done?: boolean
  active?: boolean
  label: string
  meta: string
}) {
  return (
    <div className={`process-step ${done ? "is-done" : ""} ${active ? "is-active" : ""}`}>
      <span>{done ? <Check /> : active ? <LoaderCircle className="spin" /> : null}</span>
      <div>
        <strong>{label}</strong>
        <small>{meta}</small>
      </div>
    </div>
  )
}

function AnalysisPage({
  report,
  analysis,
  history,
  error,
  onBack,
  onDelete,
  onDownload,
}: {
  report: ReadinessReport | undefined
  analysis: AnalysisRecord | null
  history: AnalysisRecord[]
  error: string | null
  onBack: () => void
  onDelete: () => void
  onDownload: (kind: "outline" | "export") => void
}) {
  const modules = report?.modules ?? demoReport.modules
  const [activeSection, setActiveSection] = useState<string>(analysisSections[0].id)
  const [baselineId, setBaselineId] = useState("")
  const [revisionDiff, setRevisionDiff] = useState<FilingDiffItem[] | null>(null)
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  const comparableHistory = history.filter(
    (candidate) =>
      candidate.id !== analysis?.id &&
      candidate.status === "complete" &&
      (candidate.report?.modules.evidenceMatrix.length ?? 0) > 0
  )
  const canCompareRevisions = Boolean(analysis?.report && comparableHistory.length > 0)
  const visibleSections = useMemo(
    () =>
      analysisSections.filter(
        (section) => section.id !== "revision-comparison" || canCompareRevisions
      ),
    [canCompareRevisions]
  )
  const sectionNumber = (id: string) =>
    visibleSections
      .findIndex((section) => section.id === id)
      .toString()
      .padStart(2, "0")
  const displayedDiff = revisionDiff ?? []
  const scoreBreakdown = getEvidenceMatrixScoreBreakdown(modules.evidenceMatrix).sort(
    (left, right) => scoreImportanceOrder[left.importance] - scoreImportanceOrder[right.importance]
  )

  useEffect(() => {
    function updateActiveSection() {
      const activationLine = 130
      let currentSection: string = visibleSections[0].id
      for (const section of visibleSections) {
        const element = document.getElementById(section.id)
        if (element && element.getBoundingClientRect().top <= activationLine) {
          currentSection = section.id
        }
      }
      setActiveSection(currentSection)
    }

    updateActiveSection()
    window.addEventListener("scroll", updateActiveSection, { passive: true })
    return () => window.removeEventListener("scroll", updateActiveSection)
  }, [visibleSections])

  async function loadRevisionComparison(nextBaselineId: string) {
    setBaselineId(nextBaselineId)
    setRevisionDiff(null)
    setComparisonError(null)
    if (!nextBaselineId || !analysis?.id) return
    try {
      const comparison = await compareAnalyses(analysis.id, nextBaselineId)
      setRevisionDiff(comparison.filingDiff)
    } catch (comparisonFailure) {
      setComparisonError(errorMessage(comparisonFailure))
    }
  }

  if (!report) {
    return (
      <main className="empty-report-page">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeft /> Back to upload
        </button>
        <FileSearch />
        <h1>{analysis?.filingName ?? "Analysis not found"}</h1>
        <p>
          {analysis?.status === "failed"
            ? analysis.error
            : (error ?? "This report is still being prepared or is no longer available.")}
        </p>
      </main>
    )
  }

  return (
    <main className="analysis-page">
      <div className="analysis-toolbar">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeft /> All analyses
        </button>
        <div className="analysis-file">
          <FileText />
          <span>
            <strong>{report.filingName}</strong>
            <small>Analyzed {formatDate(report.generatedAt)}</small>
          </span>
        </div>
        <div className="analysis-actions">
          {analysis?.report ? (
            <>
              <button type="button" onClick={() => onDownload("outline")}>
                <Download /> Outline
              </button>
              <button type="button" onClick={onDelete} aria-label="Delete analysis">
                <Trash2 /> Delete
              </button>
              <button type="button" className="primary-action" onClick={() => onDownload("export")}>
                <Download /> Export report
              </button>
            </>
          ) : (
            <span className="sample-tag">SAMPLE REPORT</span>
          )}
        </div>
      </div>

      <div className="analysis-layout">
        <aside className="analysis-sidebar">
          <p>REPORT INDEX</p>
          <nav aria-label="Analysis sections">
            {visibleSections.map((section, index) => (
              <button
                type="button"
                key={section.id}
                className={activeSection === section.id ? "is-active" : ""}
                aria-current={activeSection === section.id ? "location" : undefined}
                onClick={() => {
                  setActiveSection(section.id)
                  document.getElementById(section.id)?.scrollIntoView({ block: "start" })
                }}
              >
                <span>{index.toString().padStart(2, "0")}</span>
                {section.label}
              </button>
            ))}
          </nav>
          <div className="report-meta">
            <span>PIPELINE</span>
            <strong>{report.runMetadata.pipelineVersion}</strong>
            <span>DOCUMENT</span>
            <strong>
              {report.textStats.pageCount || "—"} pages ·{" "}
              {report.textStats.wordCount.toLocaleString()} words
            </strong>
            <span>MODEL COST</span>
            <strong>
              {report.runMetadata.cacheHit
                ? "Cached · $0.00"
                : `$${report.runMetadata.estimatedCostUsd.toFixed(2)}`}
            </strong>
          </div>
        </aside>

        <article className="report-content">
          <section id="executive-summary" className="report-hero">
            <div>
              <p className="section-label">
                {sectionNumber("executive-summary")} · EXECUTIVE SUMMARY
              </p>
              <h1>Submission readiness</h1>
              <p className="report-summary">{report.summary}</p>
              {report.caveats.length > 0 ? (
                <div className="report-caveats">
                  <strong>Scope and module notes</strong>
                  <ul>
                    {report.caveats.map((caveat) => (
                      <li key={caveat}>{caveat}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <ScoreGauge score={report.readinessScore} />
          </section>

          <section id="readiness-signals" className="report-section">
            <SectionHeading
              number={sectionNumber("readiness-signals")}
              title="Readiness signals"
              aside="Weighted assessment"
            />
            <div className="signal-cards">
              {report.signals.map((signal) => {
                const percentage = Math.round((signal.score / signal.maxScore) * 100)
                return (
                  <div key={signal.id} className="signal-card">
                    <div>
                      <span>{signal.label}</span>
                      <strong>{percentage}%</strong>
                    </div>
                    <div className="signal-bar">
                      <span style={{ width: `${percentage}%` }} />
                    </div>
                    <p>{signal.summary}</p>
                  </div>
                )
              })}
            </div>
            <details className="score-breakdown">
              <summary>
                <div>
                  <strong>Show score calculation</strong>
                  <small>Overall score: {report.readinessScore} / 100</small>
                </div>
                <Plus />
              </summary>
              <div className="score-breakdown-body">
                <div className="score-method">
                  <p>
                    <strong>Importance sets the available points:</strong>
                    High (15); Medium (10); Low (5)
                  </p>
                  <p>
                    <strong>Evidence earns preset grades:</strong>
                    Present (100%); Strong with gaps (75%); Significant gaps (25%); Missing (0%)
                  </p>
                  <p>Not-applicable domains are excluded and the remaining total is normalized.</p>
                </div>
                <div className="score-breakdown-grid">
                  {scoreBreakdown.map((row) => (
                    <div key={row.id}>
                      <span>{row.importance} importance</span>
                      <strong>{row.label}</strong>
                      <small>{row.rationale}</small>
                      <div className={`score-grade score-grade-${row.status}`}>
                        <span>Evidence grade</span>
                        <strong>{formatEvidenceGrade(row.status)}</strong>
                      </div>
                      <p className="score-equation">
                        {row.maxScore} points × {Math.round(row.creditRate * 100)}% ={" "}
                        {formatScore(row.earnedScore)} points
                      </p>
                    </div>
                  ))}
                </div>
                <small>Scoring method: {report.runMetadata.scorer}</small>
              </div>
            </details>
          </section>

          <section id="critical-findings" className="report-section">
            <SectionHeading
              number={sectionNumber("critical-findings")}
              title="Priority findings"
              aside={`${report.findings.length} items`}
            />
            <div className="findings-list">
              {report.findings.map((finding, index) => (
                <details
                  key={finding.id}
                  className={`finding-row severity-${finding.severity}`}
                  open={index === 0}
                >
                  <summary>
                    <span className="finding-index">{(index + 1).toString().padStart(2, "0")}</span>
                    <span className="severity-label">{finding.severity}</span>
                    <strong>{finding.title}</strong>
                    <Plus />
                  </summary>
                  <div className="finding-detail">
                    <div>
                      <span>WHY IT MATTERS</span>
                      <p>{finding.summary}</p>
                    </div>
                    <div>
                      <span>RECOMMENDED ACTION</span>
                      <p>{finding.recommendedAction}</p>
                    </div>
                    {finding.evidence.length > 0 ? (
                      <div className="evidence-tags">
                        {finding.evidence.map((item) => (
                          <span key={item}>{item}</span>
                        ))}
                      </div>
                    ) : null}
                    {finding.citations?.length ? (
                      <div className="citation-list">
                        <span>SOURCE EXCERPTS</span>
                        {finding.citations.map((citation) => (
                          <blockquote
                            key={`${finding.id}-${citation.pageNumber}-${citation.excerpt}`}
                          >
                            <strong>PDF page {citation.pageNumber}</strong>
                            <p>“{citation.excerpt}”</p>
                          </blockquote>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section id="documentation" className="report-section">
            <SectionHeading
              number={sectionNumber("documentation")}
              title="Documentation benchmark"
              aside={
                modules.evidenceMatrix.length > 0
                  ? `${modules.evidenceMatrix.length} evidence domains`
                  : "Section coverage"
              }
            />
            {modules.evidenceMatrix.length === 0 ? (
              <DataTable
                headers={["Requirement", "Status", "Assessment"]}
                rows={modules.documentationBenchmark.map((item) => [
                  item.label,
                  <StatusPill key={`${item.id}-status`} value={item.status} />,
                  item.summary,
                ])}
              />
            ) : null}
            {(modules.evidenceMatrix ?? []).length > 0 ? (
              <>
                <p className="section-intro">
                  Each domain is graded against the filing evidence. Expand a row to review the
                  assessment, exact source excerpts, and unresolved questions.
                </p>
                <div className="evidence-matrix">
                  {(modules.evidenceMatrix ?? []).map((item) => (
                    <details key={item.id}>
                      <summary>
                        <StatusPill value={item.status} />
                        <strong>{item.requirement}</strong>
                        <span>{item.domain.replaceAll("_", " ")}</span>
                        <Plus />
                      </summary>
                      <div>
                        <p>{item.assessment}</p>
                        <small>{item.evidenceSummary}</small>
                        {item.citations.map((citation) => (
                          <blockquote key={`${item.id}-${citation.pageNumber}-${citation.excerpt}`}>
                            <strong>PDF page {citation.pageNumber}</strong>
                            <p>“{citation.excerpt}”</p>
                          </blockquote>
                        ))}
                        {item.unresolvedQuestions.length > 0 ? (
                          <>
                            <h3>Unresolved questions</h3>
                            <ul>
                              {item.unresolvedQuestions.map((question) => (
                                <li key={question}>{question}</li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                      </div>
                    </details>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <section id="safety-evidence" className="report-section">
            <SectionHeading
              number={sectionNumber("safety-evidence")}
              title="Safety evidence"
              aside="Risk signals"
            />
            <div className="safety-grid">
              {modules.safetySignals.map((signal) => (
                <div key={signal.id}>
                  <StatusPill value={signal.level} />
                  <strong>{signal.label}</strong>
                  <p>{signal.summary}</p>
                  <small>{signal.evidence.join(" · ")}</small>
                  {signal.citations?.map((citation) => (
                    <blockquote key={`${signal.id}-${citation.pageNumber}-${citation.excerpt}`}>
                      <strong>PDF page {citation.pageNumber}</strong>
                      <p>“{citation.excerpt}”</p>
                    </blockquote>
                  ))}
                </div>
              ))}
              {modules.safetySignals.length === 0 ? (
                <p className="muted-empty">No safety signals were generated for this analysis.</p>
              ) : null}
            </div>
          </section>

          <section id="comparable-filings" className="report-section">
            <SectionHeading
              number={sectionNumber("comparable-filings")}
              title="Comparable filings"
              aside="Regulatory context"
            />
            <p className="section-intro">
              External regulatory analogs ranked by similarity and permitted research use. They
              identify useful evidence and document structures; they do not establish equivalence or
              change the subject filing's grade.
            </p>
            <div className="comparable-list">
              {modules.comparableFilings.map((filing) => (
                <div key={filing.id}>
                  <div className="comparable-head">
                    <span>{filing.status}</span>
                    {filing.sourceUrl ? (
                      <a href={filing.sourceUrl} target="_blank" rel="noreferrer">
                        {filing.name}
                      </a>
                    ) : (
                      <strong>{filing.name}</strong>
                    )}
                    <small>
                      {filing.similarityScore === undefined
                        ? "unscored"
                        : `${Math.round(filing.similarityScore * 100)}% match`}
                      {filing.comparisonStrength ? ` · ${filing.comparisonStrength}` : ""}
                    </small>
                    <MoreHorizontal />
                  </div>
                  <p>{filing.rationale}</p>
                  {filing.eligibilityRationale ? (
                    <p>
                      <strong>{filing.researchUse?.replaceAll("_", " ")}:</strong>{" "}
                      {filing.eligibilityRationale}
                    </p>
                  ) : null}
                  <div>
                    {filing.sharedSignals.map((signal) => (
                      <span key={signal}>{signal}</span>
                    ))}
                  </div>
                  {filing.differences.length > 0 ? (
                    <ul>
                      {filing.differences.map((difference) => (
                        <li key={difference}>{difference}</li>
                      ))}
                    </ul>
                  ) : null}
                  {filing.evidenceMatches?.length ? (
                    <div className="comparable-evidence">
                      {filing.evidenceMatches.map((match) => (
                        <details key={`${filing.id}-${match.requirementId}`}>
                          <summary>
                            <strong>{match.requirement}</strong>
                            <span>{Math.round(match.relevanceScore * 100)}% passage match</span>
                            <Plus />
                          </summary>
                          <p>{match.rationale}</p>
                          {match.assessments?.map((assessment) => (
                            <div
                              className="comparable-assessment"
                              key={`${filing.id}-${match.requirementId}-${assessment.question}`}
                            >
                              <span className={`assessment-${assessment.conclusion}`}>
                                {assessment.conclusion.replaceAll("_", " ")}
                              </span>
                              <h4>{assessment.question}</h4>
                              <p>{assessment.rationale}</p>
                              {assessment.transferableElements.length > 0 ? (
                                <p>
                                  <strong>Potentially transferable:</strong>{" "}
                                  {assessment.transferableElements.join("; ")}
                                </p>
                              ) : null}
                              {assessment.limitations.length > 0 ? (
                                <p>
                                  <strong>Limits:</strong> {assessment.limitations.join("; ")}
                                </p>
                              ) : null}
                            </div>
                          ))}
                          {match.citations.map((citation) => (
                            <blockquote
                              key={`${filing.id}-${match.requirementId}-${citation.pageNumber}-${citation.excerpt}`}
                            >
                              <strong>Comparator PDF page {citation.pageNumber}</strong>
                              <p>“{citation.excerpt}”</p>
                            </blockquote>
                          ))}
                        </details>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {modules.comparableActions.length > 0 ? (
            <section className="report-section">
              <SectionHeading
                number="05A"
                title="Comparator-informed actions"
                aside="Amendment and research plan"
              />
              <p className="section-intro">
                These actions combine unresolved questions in the subject filing with bounded,
                transferable lessons from the comparators above.
              </p>
              <div className="comparable-actions">
                {modules.comparableActions.map((action) => (
                  <article key={action.id} className={`priority-${action.priority}`}>
                    <header>
                      <StatusPill value={action.priority} />
                      <span>{action.requirementId.replaceAll("-", " ")}</span>
                    </header>
                    <h3>{action.question}</h3>
                    <p>{action.synthesis}</p>
                    <div>
                      <section>
                        <h4>Amendment action</h4>
                        <p>{action.amendmentAction}</p>
                      </section>
                      <section>
                        <h4>Research action</h4>
                        <p>{action.researchAction}</p>
                      </section>
                    </div>
                    {action.evidenceNeeded.length > 0 ? (
                      <ul>
                        {action.evidenceNeeded.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                    <small>
                      Subject PDF: {action.subjectCitationPages.join(", ")}. Comparator support:{" "}
                      {action.comparatorSupport
                        .map(
                          (support) =>
                            `${support.filingName}, PDF ${support.pageNumbers.join(", ")} (${support.conclusion.replaceAll("_", " ")})`
                        )
                        .join("; ")}
                    </small>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {canCompareRevisions ? (
            <section id="revision-comparison" className="report-section">
              <SectionHeading
                number={sectionNumber("revision-comparison")}
                title="Revision comparison"
                aside="Earlier versus current filing"
              />
              <p className="section-intro">
                Compare the current evidence matrix with an earlier completed filing to see what was
                added, removed, strengthened, weakened, or otherwise changed.
              </p>
              <label className="revision-selector">
                <span>Compare against an earlier analyzed filing</span>
                <select
                  value={baselineId}
                  onChange={(event) => void loadRevisionComparison(event.currentTarget.value)}
                >
                  <option value="">Select an earlier filing</option>
                  {comparableHistory.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.filingName} · {formatDate(candidate.updatedAt)}
                    </option>
                  ))}
                </select>
              </label>
              {comparisonError ? <p className="form-error">{comparisonError}</p> : null}
              <DataTable
                headers={["Requirement", "Status", "Recommended action"]}
                rows={displayedDiff.map((item) => [
                  item.label,
                  <StatusPill key={`${item.id}-status`} value={item.status} />,
                  item.recommendedAction,
                ])}
              />
              {displayedDiff.some((item) => item.change) ? (
                <div className="filing-diff-details">
                  {displayedDiff.map((item) => (
                    <details key={`${item.id}-evidence`}>
                      <summary>
                        <span>{(item.changeType ?? item.change)?.replaceAll("_", " ")}</span>
                        <strong>{item.label}</strong>
                        <small>
                          {item.baselineStatus ?? "unknown"} → {item.draftStatus ?? "unknown"}
                          {item.materiality ? ` · ${item.materiality.replaceAll("_", " ")}` : ""}
                        </small>
                        <Plus />
                      </summary>
                      <div>
                        {item.changeSummary ? <p>{item.changeSummary}</p> : null}
                        <section>
                          <h3>Baseline filing</h3>
                          <p>{item.baselineExpectation}</p>
                          {item.baselineCitations?.map((citation) => (
                            <blockquote
                              key={`${item.id}-baseline-${citation.pageNumber}-${citation.excerpt}`}
                            >
                              <strong>PDF page {citation.pageNumber}</strong>
                              <p>“{citation.excerpt}”</p>
                            </blockquote>
                          ))}
                        </section>
                        <section>
                          <h3>Revised filing</h3>
                          <p>{item.draftSignal}</p>
                          {item.draftCitations?.map((citation) => (
                            <blockquote
                              key={`${item.id}-draft-${citation.pageNumber}-${citation.excerpt}`}
                            >
                              <strong>PDF page {citation.pageNumber}</strong>
                              <p>“{citation.excerpt}”</p>
                            </blockquote>
                          ))}
                        </section>
                      </div>
                    </details>
                  ))}
                </div>
              ) : null}
              {baselineId && displayedDiff.length === 0 ? (
                <p className="muted-empty">No revision changes were generated.</p>
              ) : null}
              {!baselineId ? (
                <p className="muted-empty">Select an earlier filing to generate the comparison.</p>
              ) : null}
            </section>
          ) : null}

          <section id="research-references" className="report-section">
            <SectionHeading
              number={sectionNumber("research-references")}
              title="Research references"
              aside={`${modules.researchReferences.length} notifier-cited sources`}
            />
            <div className="reference-list">
              {modules.researchReferences.map((reference) => (
                <article key={reference.id}>
                  <header>
                    <StatusPill value={reference.verificationStatus ?? "unverified"} />
                    <span>{reference.origin?.replaceAll("_", " ") ?? "source unspecified"}</span>
                  </header>
                  <h3>
                    {reference.url ? (
                      <a href={reference.url} target="_blank" rel="noreferrer">
                        {reference.title}
                      </a>
                    ) : (
                      reference.title
                    )}
                  </h3>
                  <p>
                    {[reference.authors?.join(", "), reference.source, reference.year]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p>{reference.relevance}</p>
                  <small>
                    {reference.citedPages?.length
                      ? `Cited on filing PDF pages ${reference.citedPages.join(", ")}`
                      : "No filing page recorded"}
                    {reference.duplicateCount
                      ? ` · ${reference.duplicateCount} duplicate entries consolidated`
                      : ""}
                  </small>
                  {reference.sourceVerification ? (
                    <div className="reference-verification">
                      <strong>
                        {reference.sourceVerification.accessLevel.replaceAll("_", " ")} verified
                      </strong>
                      <a
                        href={reference.sourceVerification.resolvedUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {reference.sourceVerification.source.replaceAll("_", " ")}
                      </a>
                    </div>
                  ) : null}
                  {reference.verification?.conflicts.length ? (
                    <div className="reference-verification">
                      <strong>Metadata conflicts</strong>
                      <ul>
                        {reference.verification.conflicts.map((conflict) => (
                          <li key={conflict}>{conflict}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </article>
              ))}
              {modules.researchReferences.length === 0 ? (
                <p className="muted-empty">
                  No research references were identified by the grounded extractor.
                </p>
              ) : null}
            </div>
          </section>

          <section id="amendment-plan" className="report-section">
            <SectionHeading
              number={sectionNumber("amendment-plan")}
              title="Amendment plan"
              aside="Recommended sequence"
            />
            <div className="amendment-list">
              {modules.amendmentOutline.map((section, index) => (
                <div key={section.id}>
                  <span>{(index + 1).toString().padStart(2, "0")}</span>
                  <div>
                    <div className="amendment-head">
                      <strong>{section.title}</strong>
                      {section.priority ? <StatusPill value={section.priority} /> : null}
                    </div>
                    <small>
                      {[
                        section.ownerRole ? `Owner: ${section.ownerRole}` : "",
                        section.domains?.length ? section.domains.join(" · ") : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                    <ul>
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    {section.deliverables?.length ? (
                      <div className="amendment-deliverables">
                        <strong>Deliverables</strong>
                        <ul>
                          {section.deliverables.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {section.dependencies?.length ? (
                      <p className="amendment-dependencies">
                        Depends on: {section.dependencies.join(", ")}
                      </p>
                    ) : null}
                    {section.citations?.length ? (
                      <div className="amendment-sources">
                        {section.citations.map((citation) => (
                          <span
                            key={`${section.id}-${citation.pageNumber}-${citation.excerpt}`}
                            title={citation.excerpt}
                          >
                            PDF page {citation.pageNumber}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {section.comparatorSources?.length ? (
                      <div className="amendment-sources">
                        {section.comparatorSources.map((source) => (
                          <span
                            key={`${section.id}-${source.filingName}-${source.pageNumbers.join("-")}`}
                          >
                            {source.filingName}: PDF {source.pageNumbers.join(", ")}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <footer className="report-disclaimer">
            <CircleAlert />
            <p>
              This analysis is a readiness signal, not a legal or FDA determination. Validate
              findings with qualified regulatory counsel before submission.
            </p>
          </footer>
        </article>
      </div>
    </main>
  )
}

function ScoreGauge({ score }: { score: number }) {
  return (
    <div className="score-gauge" style={{ "--score": `${score * 3.6}deg` } as CSSProperties}>
      <div>
        <strong>{score}</strong>
        <span>/ 100</span>
      </div>
      <p>
        {score >= 80 ? "Submission ready" : score >= 60 ? "Needs targeted work" : "Material gaps"}
      </p>
    </div>
  )
}

function SectionHeading({
  number,
  title,
  aside,
}: {
  number: string
  title: string
  aside: string
}) {
  return (
    <div className="report-section-heading">
      <span>{number}</span>
      <h2>{title}</h2>
      <small>{aside}</small>
    </div>
  )
}

function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="data-table">
      <div className="data-row data-head">
        {headers.map((header) => (
          <span key={header}>{header}</span>
        ))}
      </div>
      {rows.map((row) => (
        <div className="data-row" key={String(row[0])}>
          {row.map((cell, cellIndex) => (
            <div key={headers[cellIndex]}>{cell}</div>
          ))}
        </div>
      ))}
    </div>
  )
}

function StatusPill({ value }: { value: string }) {
  return <span className={`status-pill status-${value}`}>{value.replaceAll("_", " ")}</span>
}

function WorkspacePage({
  history,
  loadState,
  onOpenAnalysis,
  onUpload,
}: {
  history: AnalysisRecord[]
  loadState: LoadState
  onOpenAnalysis: (analysis: AnalysisRecord) => void
  onUpload: () => void
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const completed = useMemo(
    () => history.filter((analysis) => analysis.status === "complete"),
    [history]
  )
  const visibleHistory = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return query
      ? history.filter((analysis) => analysis.filingName.toLowerCase().includes(query))
      : history
  }, [history, searchQuery])

  return (
    <main className="workspace-page">
      <section className="workspace-heading">
        <div>
          <p className="section-label">PERSONAL WORKSPACE</p>
          <h1>Filings & notes</h1>
          <p>Your private regulatory review desk.</p>
        </div>
        <button type="button" className="primary-action" onClick={onUpload}>
          <Plus /> New analysis
        </button>
      </section>

      <section className="workspace-metrics">
        <div>
          <span>TOTAL FILINGS</span>
          <strong>{history.length.toString().padStart(2, "0")}</strong>
        </div>
        <div>
          <span>COMPLETED</span>
          <strong>{completed.length.toString().padStart(2, "0")}</strong>
        </div>
        <div>
          <span>AVG. READINESS</span>
          <strong>
            {completed.length
              ? Math.round(
                  completed.reduce((total, item) => total + (item.report?.readinessScore ?? 0), 0) /
                    completed.length
                )
              : "—"}
          </strong>
        </div>
        <div className="notes-preview">
          <NotebookPen />
          <span>
            <strong>Research notebook</strong>
            <small>Shared notes and tasks are coming next.</small>
          </span>
        </div>
      </section>

      <section className="workspace-library">
        <div className="library-toolbar">
          <div>
            <h2>Analysis library</h2>
            <span>{history.length} records</span>
          </div>
          <label>
            <Search />
            <input
              type="search"
              placeholder="Search filings"
              aria-label="Search filings"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
            />
          </label>
        </div>

        {loadState === "loading" ? (
          <div className="workspace-loading">
            <LoaderCircle className="spin" /> Loading workspace
          </div>
        ) : history.length > 0 ? (
          <div className="library-table">
            <div className="library-row library-head">
              <span>Filing</span>
              <span>Status</span>
              <span>Readiness</span>
              <span>Updated</span>
              <span />
            </div>
            {visibleHistory.map((analysis) => (
              <button
                className="library-row"
                type="button"
                key={analysis.id}
                onClick={() => onOpenAnalysis(analysis)}
              >
                <span className="library-file">
                  <FileText />
                  <strong>{analysis.filingName}</strong>
                </span>
                <span>
                  <StatusPill value={analysis.status} />
                </span>
                <strong>{analysis.report?.readinessScore ?? "—"}</strong>
                <span>{formatDate(analysis.updatedAt)}</span>
                <ChevronRight />
              </button>
            ))}
            {visibleHistory.length === 0 ? (
              <p className="muted-empty">No filings match “{searchQuery}”.</p>
            ) : null}
          </div>
        ) : (
          <div className="workspace-empty">
            <FileSearch />
            <h3>Your library is empty</h3>
            <p>Upload a draft filing to create your first analysis.</p>
            <button type="button" onClick={onUpload}>
              Upload a filing <ArrowRight />
            </button>
          </div>
        )}
      </section>
    </main>
  )
}

function readRoute(): Route {
  const path = window.location.pathname
  if (path.startsWith("/analysis")) {
    return { name: "analysis", id: path.split("/")[2] }
  }
  if (path.startsWith("/workspace")) {
    return { name: "workspace" }
  }
  return { name: "home" }
}

function routePath(route: Route) {
  if (route.name === "analysis") return `/analysis/${route.id ?? ""}`
  if (route.name === "workspace") return "/workspace"
  return "/"
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))
}

function formatScore(value: number) {
  return value
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1")
}

function formatEvidenceGrade(status: string) {
  if (status === "present") return "Present"
  if (status === "strong_with_minor_gaps") return "Strong with gaps"
  if (status === "substantial_gaps" || status === "weak") return "Significant gaps"
  if (status === "missing") return "Missing"
  return status.replaceAll("_", " ")
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong."
}
