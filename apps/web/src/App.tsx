import type { AnalysisRecord, ReadinessReport } from "@greenlit/core"
import { demoReport } from "@greenlit/core"
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
import { createAnalysis, downloadAnalysisFile, listAnalyses, waitForAnalysis } from "./api"

type LoadState = "idle" | "loading" | "uploading" | "polling"
type Route = { name: "home" } | { name: "analysis"; id?: string } | { name: "workspace" }

const analysisSections = [
  "Executive summary",
  "Readiness signals",
  "Critical findings",
  "Documentation",
  "Safety evidence",
  "Comparable filings",
  "Amendment plan",
]

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
          report={report}
          analysis={activeAnalysis}
          error={error}
          onBack={() => navigate({ name: "home" })}
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
        <span>PDF · MAX 40 MB</span>
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
  error,
  onBack,
  onDownload,
}: {
  report: ReadinessReport | undefined
  analysis: AnalysisRecord | null
  error: string | null
  onBack: () => void
  onDownload: (kind: "outline" | "export") => void
}) {
  const modules = report?.modules ?? demoReport.modules
  const [activeSection, setActiveSection] = useState(analysisSections[0])

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
            {analysisSections.map((section, index) => (
              <button
                type="button"
                key={section}
                className={activeSection === section ? "is-active" : ""}
                onClick={() => {
                  setActiveSection(section)
                  document
                    .getElementById(section.toLowerCase().replaceAll(" ", "-"))
                    ?.scrollIntoView({ behavior: "smooth" })
                }}
              >
                <span>{(index + 1).toString().padStart(2, "0")}</span>
                {section}
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
          </div>
        </aside>

        <article className="report-content">
          <section id="executive-summary" className="report-hero">
            <div>
              <p className="section-label">EXECUTIVE SUMMARY</p>
              <h1>Submission readiness</h1>
              <p>{report.summary}</p>
            </div>
            <ScoreGauge score={report.readinessScore} />
          </section>

          <section id="readiness-signals" className="report-section">
            <SectionHeading number="01" title="Readiness signals" aside="Weighted assessment" />
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
          </section>

          <section id="critical-findings" className="report-section">
            <SectionHeading
              number="02"
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
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section id="documentation" className="report-section">
            <SectionHeading number="03" title="Documentation benchmark" aside="Section coverage" />
            <DataTable
              headers={["Requirement", "Status", "Assessment"]}
              rows={modules.documentationBenchmark.map((item) => [
                item.label,
                <StatusPill key={`${item.id}-status`} value={item.status} />,
                item.summary,
              ])}
            />
          </section>

          <section id="safety-evidence" className="report-section">
            <SectionHeading number="04" title="Safety evidence" aside="Risk signals" />
            <div className="safety-grid">
              {modules.safetySignals.map((signal) => (
                <div key={signal.id}>
                  <StatusPill value={signal.level} />
                  <strong>{signal.label}</strong>
                  <p>{signal.summary}</p>
                  <small>{signal.evidence.join(" · ")}</small>
                </div>
              ))}
              {modules.safetySignals.length === 0 ? (
                <p className="muted-empty">No safety signals were generated for this analysis.</p>
              ) : null}
            </div>
          </section>

          <section id="comparable-filings" className="report-section">
            <SectionHeading number="05" title="Comparable filings" aside="Regulatory context" />
            <div className="comparable-list">
              {modules.comparableFilings.map((filing) => (
                <div key={filing.id}>
                  <div className="comparable-head">
                    <span>{filing.status}</span>
                    <strong>{filing.name}</strong>
                    <MoreHorizontal />
                  </div>
                  <p>{filing.rationale}</p>
                  <div>
                    {filing.sharedSignals.map((signal) => (
                      <span key={signal}>{signal}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="amendment-plan" className="report-section">
            <SectionHeading number="06" title="Amendment plan" aside="Recommended sequence" />
            <div className="amendment-list">
              {modules.amendmentOutline.map((section, index) => (
                <div key={section.id}>
                  <span>{(index + 1).toString().padStart(2, "0")}</span>
                  <div>
                    <strong>{section.title}</strong>
                    <ul>
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
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
  const completed = useMemo(
    () => history.filter((analysis) => analysis.status === "complete"),
    [history]
  )

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
            <input type="search" placeholder="Search filings" aria-label="Search filings" />
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
            {history.map((analysis) => (
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong."
}
