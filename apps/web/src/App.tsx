import type {
  AgencyQuestion,
  AnalysisRecord,
  ConsultantReviewIssue,
  DossierEvidence,
  DossierEvidencePassage,
  DossierIntake,
  DossierQualityCheck,
  DossierRecord,
  DossierSectionVersion,
  FactBookEntry,
  FactExtractionRecord,
  FilingDiffItem,
  ReadinessReport,
  ReleaseAttestation,
  SubmissionRecord,
} from "@greenlit/core"
import {
  demoReport,
  getEvidenceMatrixScoreBreakdown,
  renderFactReferences,
  suggestClaimsFromPassage,
} from "@greenlit/core"
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
  TableProperties,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  assistDossierSection,
  compareAnalyses,
  createAgencyQuestion,
  createAnalysis,
  createConsultantHandoff,
  createConsultantReviewLink,
  createDossier,
  createDossierClaim,
  createEvidenceRequest,
  createEvidenceRequestLink,
  createFactBookEntry,
  createReviewIssue,
  createSectionStarter,
  createSubmission,
  type DossierWorkspace,
  deleteDossierEvidence,
  deleteFactBookEntry,
  deleteAnalysis as deleteSavedAnalysis,
  downloadAnalysisFile,
  downloadDossierExport,
  downloadFactBook,
  downloadSubmissionPackage,
  type ExternalConsultantReview,
  type ExternalEvidenceRequest,
  type FactImpact,
  getDossier,
  getDossierQuality,
  getEvidencePassages,
  getExternalConsultantReview,
  getExternalEvidenceRequest,
  getSectionVersions,
  listAnalyses,
  listDossiers,
  lockDossierRelease,
  previewFactImpact,
  restoreSectionVersion,
  reviewDossierClaim,
  reviewExtractionCandidate,
  reviewFactBookEntry,
  saveDossierSection,
  signReleaseAttestation,
  submitExternalEvidenceFile,
  submitExternalEvidenceResponse,
  submitExternalReviewIssue,
  suggestEvidenceFacts,
  unlockDossierRelease,
  updateAgencyQuestion,
  updateConsultantHandoff,
  updateEvidenceRequest,
  updateFactBookEntry,
  updateReviewIssue,
  updateSubmission,
  uploadDossierEvidence,
  verifyDossierEvidence,
  waitForAnalysis,
} from "./api"

type LoadState = "idle" | "loading" | "uploading" | "polling"
type Route =
  | { name: "home" }
  | { name: "analysis"; id?: string }
  | { name: "workspace" }
  | { name: "dossiers"; id?: string }
  | { name: "respond"; token: string }
  | { name: "review"; token: string }

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
  const [dossiers, setDossiers] = useState<DossierRecord[]>([])
  const [activeDossier, setActiveDossier] = useState<DossierWorkspace | null>(null)
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
    if (route.name === "respond" || route.name === "review") return
    void refreshHistory()
    void listDossiers()
      .then(setDossiers)
      .catch(() => undefined)
    const onPopState = () => setRoute(readRoute())
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [refreshHistory, route.name])

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

  if (route.name === "respond") return <ExternalResponsePage token={route.token} />
  if (route.name === "review") return <ExternalReviewPage token={route.token} />

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

      {route.name === "dossiers" ? (
        <DossierPage
          dossierId={route.id}
          dossiers={dossiers}
          activeDossier={activeDossier}
          onLoad={setActiveDossier}
          onCreated={(result) => {
            setActiveDossier(result)
            setDossiers((current) => [
              result.dossier,
              ...current.filter((item) => item.id !== result.dossier.id),
            ])
            navigate({ name: "dossiers", id: result.dossier.id })
          }}
          onOpen={(id) => navigate({ name: "dossiers", id })}
        />
      ) : null}
    </div>
  )
}

function ExternalResponsePage({ token }: { token: string }) {
  const [request, setRequest] = useState<ExternalEvidenceRequest | null>(null)
  const [note, setNote] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState<DossierEvidence["category"]>("other")
  const [status, setStatus] = useState<"loading" | "ready" | "sending" | "sent" | "error">(
    "loading"
  )
  const [message, setMessage] = useState("")

  useEffect(() => {
    void getExternalEvidenceRequest(token)
      .then((result) => {
        setRequest(result)
        setStatus("ready")
      })
      .catch((error) => {
        setMessage(publicCapabilityError(error, "evidence request"))
        setStatus("error")
      })
  }, [token])

  async function submitResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("sending")
    try {
      if (file) await submitExternalEvidenceFile(token, file, note, category)
      else await submitExternalEvidenceResponse(token, note)
      setStatus("sent")
    } catch (error) {
      setMessage(errorMessage(error))
      setStatus("error")
    }
  }

  return (
    <main className="dossier-shell">
      <section className="requirements-panel">
        <div className="requirements-heading">
          <div>
            <p className="section-label">SECURE EVIDENCE RESPONSE</p>
            <h1>{request?.request.title ?? "Evidence request"}</h1>
          </div>
          <ShieldCheck />
        </div>
        {status === "loading" ? <p>Opening secure request…</p> : null}
        {status === "error" ? <p className="form-error">{message}</p> : null}
        {status === "sent" ? (
          <div className="evidence-empty">
            <Check />
            <h2>Response received</h2>
            <p>The Greenlit workspace owner has been notified. This link can no longer be used.</p>
          </div>
        ) : null}
        {request && (status === "ready" || status === "sending") ? (
          <form className="claim-composer" onSubmit={submitResponse}>
            <p>
              <strong>{request.dossier.substanceName}</strong> · {request.dossier.name}
            </p>
            <p>{request.request.detail}</p>
            <small>
              {request.request.priority} priority · secure link expires{" "}
              {formatDate(request.link.expiresAt)}
            </small>
            <label>
              Your response
              <textarea
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
                placeholder="Describe the materials supplied, relevant dates, limitations, and anything the regulatory team should know."
                required
                minLength={3}
                maxLength={10000}
              />
            </label>
            <label>
              Evidence category
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.currentTarget.value as DossierEvidence["category"])
                }
              >
                <option value="identity">Identity</option>
                <option value="manufacturing">Manufacturing</option>
                <option value="specification">Specification</option>
                <option value="exposure">Exposure</option>
                <option value="safety_study">Safety study</option>
                <option value="regulatory">Regulatory</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Supporting PDF (recommended)
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
              />
              <small>The file enters Greenlit as unverified evidence for regulatory review.</small>
            </label>
            <button className="primary-action" type="submit" disabled={status === "sending"}>
              {status === "sending" ? <LoaderCircle className="spin" /> : <Check />} Submit response
            </button>
          </form>
        ) : null}
      </section>
    </main>
  )
}

function ExternalReviewPage({ token }: { token: string }) {
  const [review, setReview] = useState<ExternalConsultantReview | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "sending" | "error">("loading")
  const [message, setMessage] = useState("")
  const [target, setTarget] = useState("")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [priority, setPriority] = useState<ConsultantReviewIssue["priority"]>("normal")

  useEffect(() => {
    void getExternalConsultantReview(token)
      .then((result) => {
        setReview(result)
        setTarget(`dossier:${result.dossier.id}`)
        setStatus("ready")
      })
      .catch((error) => {
        setMessage(publicCapabilityError(error, "consultant review"))
        setStatus("error")
      })
  }, [token])

  async function submitFinding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const [targetType, targetId] = target.split(":", 2) as [
      ConsultantReviewIssue["targetType"],
      string,
    ]
    if (!targetId) return
    setStatus("sending")
    try {
      setReview(
        await submitExternalReviewIssue(token, { targetType, targetId, title, body, priority })
      )
      setTitle("")
      setBody("")
      setStatus("ready")
    } catch (error) {
      setMessage(errorMessage(error))
      setStatus("error")
    }
  }

  if (status === "loading")
    return (
      <main className="dossier-shell">
        <p>Opening secure review…</p>
      </main>
    )
  if (!review)
    return (
      <main className="dossier-shell">
        <p className="form-error">{message}</p>
      </main>
    )
  const targets = [
    { type: "dossier", id: review.dossier.id, label: "Whole dossier" },
    ...review.sections.map((item) => ({
      type: "section",
      id: item.id,
      label: `${item.part} — ${item.title}`,
    })),
    ...review.facts.map((item) => ({ type: "fact", id: item.id, label: `Fact — ${item.title}` })),
    ...review.claims.map((item) => ({
      type: "claim",
      id: item.id,
      label: `Claim — ${item.statement.slice(0, 80)}`,
    })),
    ...review.evidence.map((item) => ({
      type: "evidence",
      id: item.id,
      label: `Evidence — ${item.title}`,
    })),
  ]
  return (
    <main className="dossier-page">
      <section className="dossier-header">
        <p className="section-label">SECURE CONSULTANT REVIEW</p>
        <h1>{review.dossier.substanceName}</h1>
        <p>{review.handoff.scope}</p>
        <small>Review access expires {formatDate(review.link.expiresAt)}</small>
      </section>
      <section className="dossier-workbench">
        <div className="requirements-panel">
          <div className="requirements-heading">
            <div>
              <p className="section-label">DOSSIER CONTENT</p>
              <h2>Review package</h2>
            </div>
          </div>
          <div className="evidence-cards">
            {review.sections.map((section) => (
              <article key={section.id}>
                <div className="evidence-card-head">
                  <span>
                    {section.part} · {section.title}
                  </span>
                  <StatusPill value={section.status} />
                </div>
                <p>{section.content || "No draft content."}</p>
              </article>
            ))}
            {review.facts.map((fact) => (
              <article key={fact.id}>
                <div className="evidence-card-head">
                  <span>
                    <TableProperties /> {fact.title}
                  </span>
                  <StatusPill value={fact.status} />
                </div>
                <p>
                  {Object.entries(fact.fields)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(" · ")}
                </p>
              </article>
            ))}
            {review.evidence.map((item) => (
              <article key={item.id}>
                <div className="evidence-card-head">
                  <span>
                    <FileText /> {item.title}
                  </span>
                  <StatusPill value={item.verificationStatus} />
                </div>
                <p>{item.excerpt}</p>
                <small>
                  {item.pageCount} pages · {item.category}
                </small>
              </article>
            ))}
          </div>
          <form className="claim-composer" onSubmit={submitFinding}>
            <div className="requirements-heading">
              <div>
                <p className="section-label">NEW FINDING</p>
                <h2>Leave a targeted review issue</h2>
              </div>
            </div>
            {status === "error" ? <p className="form-error">{message}</p> : null}
            <div className="claim-fields">
              <label>
                Target
                <select value={target} onChange={(event) => setTarget(event.currentTarget.value)}>
                  {targets.map((item) => (
                    <option key={`${item.type}:${item.id}`} value={`${item.type}:${item.id}`}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.currentTarget.value as ConsultantReviewIssue["priority"])
                  }
                >
                  <option value="blocking">Blocking</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                </select>
              </label>
              <label>
                Finding
                <input
                  value={title}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                  required
                />
              </label>
            </div>
            <label>
              Review note
              <textarea
                value={body}
                onChange={(event) => setBody(event.currentTarget.value)}
                required
              />
            </label>
            <button
              className="primary-action"
              type="submit"
              disabled={status === "sending" || !title.trim() || !body.trim()}
            >
              <Plus /> Add finding
            </button>
          </form>
          <section className="section-claims">
            <div>
              <strong>Review findings</strong>
              <small>{review.issues.length} issues</small>
            </div>
            {review.issues.map((issue) => (
              <article key={issue.id}>
                <div className="evidence-card-head">
                  <span>{issue.title}</span>
                  <StatusPill value={issue.status} />
                </div>
                <p>{issue.body}</p>
                <small>
                  {issue.priority} · {issue.targetType}
                </small>
              </article>
            ))}
          </section>
        </div>
      </section>
    </main>
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
        <button
          type="button"
          className={route.name === "dossiers" ? "is-active" : ""}
          onClick={() => navigate({ name: "dossiers" })}
        >
          Draft
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
              <ShieldCheck />
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

const factTemplates: Record<
  FactBookEntry["kind"],
  Array<{ key: string; label: string; placeholder: string }>
> = {
  identity: [
    {
      key: "substanceName",
      label: "Substance name",
      placeholder: "Canonical notified substance name",
    },
    { key: "composition", label: "Composition", placeholder: "Defining constituents and ranges" },
    { key: "casNumber", label: "CAS number", placeholder: "If applicable" },
  ],
  manufacturing: [
    { key: "step", label: "Process step", placeholder: "Fermentation, purification, drying…" },
    { key: "control", label: "Control", placeholder: "Critical process control" },
    { key: "location", label: "Manufacturing location", placeholder: "Facility or country" },
  ],
  intended_use: [
    { key: "foodCategory", label: "Food category", placeholder: "e.g. nutrition bars" },
    { key: "useLevel", label: "Maximum use level", placeholder: "Numeric value" },
    { key: "unit", label: "Unit", placeholder: "%, mg/serving, g/kg" },
    { key: "population", label: "Population", placeholder: "General population or subgroup" },
  ],
  exposure: [
    { key: "population", label: "Population", placeholder: "Population analyzed" },
    { key: "mean", label: "Mean exposure", placeholder: "Numeric value" },
    { key: "p90", label: "90th percentile", placeholder: "Numeric value" },
    { key: "unit", label: "Unit", placeholder: "mg/kg bw/day" },
    { key: "method", label: "Method", placeholder: "Dataset and calculation method" },
  ],
  specification: [
    { key: "parameter", label: "Parameter", placeholder: "Assay, moisture, lead…" },
    { key: "limit", label: "Acceptance limit", placeholder: "e.g. ≥95 or ≤0.5" },
    { key: "unit", label: "Unit", placeholder: "%, ppm, CFU/g" },
    { key: "method", label: "Analytical method", placeholder: "Method identifier" },
  ],
  batch_result: [
    { key: "lot", label: "Lot", placeholder: "Batch or lot identifier" },
    { key: "parameter", label: "Parameter", placeholder: "Tested specification" },
    { key: "result", label: "Result", placeholder: "Observed result" },
    { key: "unit", label: "Unit", placeholder: "%, ppm…" },
  ],
  safety_study: [
    { key: "studyType", label: "Study type", placeholder: "90-day oral toxicity, genotoxicity…" },
    { key: "testArticle", label: "Test article", placeholder: "Material tested" },
    { key: "species", label: "Species/system", placeholder: "Rat, mouse, in vitro…" },
    { key: "noael", label: "NOAEL", placeholder: "If established" },
    { key: "outcome", label: "Outcome", placeholder: "Key finding and conclusion" },
  ],
}

const sampleWorkflowTabs = [
  { id: "evidence", label: "Evidence room", icon: FolderOpen },
  { id: "facts", label: "Fact Book", icon: TableProperties },
  { id: "draft", label: "Live draft", icon: FileText },
  { id: "quality", label: "Quality gate", icon: ShieldCheck },
  { id: "consultant", label: "Consultant review", icon: FileSearch },
  { id: "submission", label: "Submission lifecycle", icon: LockKeyhole },
] as const

type SampleWorkflowTab = (typeof sampleWorkflowTabs)[number]["id"]

function SampleDossierPreview({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<SampleWorkflowTab>("evidence")

  return (
    <main className="dossier-page sample-dossier">
      <section className="sample-dossier-banner">
        <div>
          <p className="section-label">READ-ONLY SAMPLE · NOTHING IS SAVED</p>
          <h1>Fermented pea protein isolate</h1>
          <p>Northstar Nutrition · GRAS notice working dossier</p>
        </div>
        <button type="button" className="secondary-action" onClick={onClose}>
          <ArrowLeft /> Back to your workspace
        </button>
      </section>
      <section className="dossier-progress">
        <div>
          <span>REQUIREMENTS</span>
          <strong>18</strong>
        </div>
        <div>
          <span>READY</span>
          <strong>14</strong>
        </div>
        <div>
          <span>EVIDENCE ITEMS</span>
          <strong>27</strong>
        </div>
        <div>
          <span>NEXT GATE</span>
          <strong>Resolve 2 blockers</strong>
        </div>
      </section>
      <section className="dossier-completion" aria-label="78% sample dossier workflow complete">
        <div>
          <span>WORKFLOW COMPLETION</span>
          <strong>78%</strong>
        </div>
        <div className="completion-track">
          <i style={{ width: "78%" }} />
        </div>
        <p>Two evidence gaps and one consultant finding remain before the release can be locked.</p>
      </section>
      <section className="dossier-workbench sample-workbench">
        <aside>
          <p>CONNECTED WORKFLOW</p>
          {sampleWorkflowTabs.map((item) => {
            const Icon = item.icon
            return (
              <button
                type="button"
                className={tab === item.id ? "is-current" : ""}
                onClick={() => setTab(item.id)}
                key={item.id}
              >
                <Icon /> {item.label}
              </button>
            )
          })}
        </aside>
        <div className="sample-workspace-panel">
          <SampleWorkflowPanel tab={tab} />
        </div>
      </section>
    </main>
  )
}

function SampleWorkflowPanel({ tab }: { tab: SampleWorkflowTab }) {
  if (tab === "evidence")
    return (
      <>
        <div className="studio-heading">
          <div>
            <p className="section-label">EVIDENCE ROOM</p>
            <h2>Source-to-claim traceability</h2>
          </div>
          <span className="status-badge">27 sources</span>
        </div>
        <div className="sample-grid">
          <article>
            <small>VERIFIED · IDENTITY</small>
            <h3>Compositional characterization</h3>
            <p>Certificate of analysis · pp. 3–5</p>
            <strong>4 facts extracted</strong>
          </article>
          <article>
            <small>NEEDS REVIEW · SAFETY</small>
            <h3>90-day oral toxicity study</h3>
            <p>Study report · NOAEL on p. 84</p>
            <strong>2 proposed facts</strong>
          </article>
          <article className="sample-warning">
            <small>MISSING · EXPOSURE</small>
            <h3>Children’s intake scenario</h3>
            <p>Requested from exposure consultant</p>
            <strong>High priority</strong>
          </article>
        </div>
        <div className="sample-callout">
          <TableProperties />
          <p>
            Greenlit found a NOAEL of 1,000 mg/kg bw/day and proposed it for governed Fact Book
            review.
          </p>
        </div>
      </>
    )
  if (tab === "facts")
    return (
      <>
        <div className="studio-heading">
          <div>
            <p className="section-label">FACT BOOK</p>
            <h2>One governed source of truth</h2>
          </div>
          <span className="status-badge">12 approved</span>
        </div>
        <div className="sample-table">
          <div>
            <span>Identity</span>
            <strong>Protein content</strong>
            <p>≥ 82% dry basis</p>
            <small>Used in Parts 2, 3, and 6</small>
          </div>
          <div>
            <span>Specification</span>
            <strong>Lead limit</strong>
            <p>≤ 0.5 mg/kg</p>
            <small>Used in Parts 2 and 3</small>
          </div>
          <div>
            <span>Safety</span>
            <strong>90-day NOAEL</strong>
            <p>1,000 mg/kg bw/day</p>
            <small>Draft · awaiting reviewer acceptance</small>
          </div>
        </div>
        <div className="sample-callout">
          <CircleAlert />
          <p>
            Changing the protein specification would update three sections and return two approved
            sections to review.
          </p>
        </div>
      </>
    )
  if (tab === "draft")
    return (
      <>
        <div className="studio-heading">
          <div>
            <p className="section-label">LIVE DRAFT</p>
            <h2>Part 6 · Narrative</h2>
          </div>
          <span className="status-badge">In review</span>
        </div>
        <article className="sample-document">
          <h3>Safety narrative</h3>
          <p>
            The pivotal 90-day study established a NOAEL of <mark>1,000 mg/kg bw/day</mark>.
            Compared with the estimated 90th-percentile intake of <mark>8.4 mg/kg bw/day</mark>, the
            resulting margin of safety is 119-fold.
          </p>
          <p>
            Each highlighted value is rendered from a governed Fact Book reference and updates
            across every linked section only after impact confirmation.
          </p>
        </article>
        <div className="sample-source">
          <FileText />
          <span>
            <strong>Linked support</strong> · Study report p. 84 · Exposure assessment p. 19
          </span>
        </div>
      </>
    )
  if (tab === "quality")
    return (
      <>
        <div className="studio-heading">
          <div>
            <p className="section-label">QUALITY GATE</p>
            <h2>Release readiness</h2>
          </div>
          <span className="status-badge status-warn">2 blockers</span>
        </div>
        <div className="sample-checks">
          <div className="is-passed">
            <Check />
            <span>
              <strong>Traceability complete</strong>
              <small>31 claims linked to source pages</small>
            </span>
          </div>
          <div className="is-passed">
            <Check />
            <span>
              <strong>Fact references resolved</strong>
              <small>No broken or stale references</small>
            </span>
          </div>
          <div className="is-blocked">
            <CircleAlert />
            <span>
              <strong>Exposure evidence incomplete</strong>
              <small>Children’s intake scenario is outstanding</small>
            </span>
          </div>
          <div className="is-blocked">
            <CircleAlert />
            <span>
              <strong>Consultant issue open</strong>
              <small>Clarify test-article comparability</small>
            </span>
          </div>
        </div>
      </>
    )
  if (tab === "consultant")
    return (
      <>
        <div className="studio-heading">
          <div>
            <p className="section-label">CONSULTANT REVIEW</p>
            <h2>Independent scientific review</h2>
          </div>
          <span className="status-badge">Due Aug 8</span>
        </div>
        <article className="sample-review-card">
          <div>
            <strong>Dr. Maya Chen</strong>
            <small>Secure scoped review link · In review</small>
          </div>
          <span>1 open issue</span>
        </article>
        <article className="sample-issue">
          <small>BLOCKING · PART 6 · SAFETY</small>
          <h3>Clarify test-article comparability</h3>
          <p>
            The study batch should be explicitly bridged to the commercial specification before
            relying on the NOAEL.
          </p>
          <strong>Open</strong>
        </article>
      </>
    )
  return (
    <>
      <div className="studio-heading">
        <div>
          <p className="section-label">SUBMISSION LIFECYCLE</p>
          <h2>FDA GRAS notice</h2>
        </div>
        <span className="status-badge">Agency questions</span>
      </div>
      <div className="sample-timeline">
        <div className="is-done">
          <Check />
          <span>
            <strong>Release locked</strong>
            <small>Version 1.0 · immutable package</small>
          </span>
        </div>
        <div className="is-done">
          <Check />
          <span>
            <strong>Submitted</strong>
            <small>GRN 001234 · July 18, 2026</small>
          </span>
        </div>
        <div className="is-current">
          <Clock3 />
          <span>
            <strong>Agency questions</strong>
            <small>Response due August 21</small>
          </span>
        </div>
        <div>
          <span />
          <span>
            <strong>Closed</strong>
            <small>Pending FDA review</small>
          </span>
        </div>
      </div>
      <article className="sample-issue">
        <small>HIGH PRIORITY · OPEN</small>
        <h3>Provide updated manufacturing flow diagram</h3>
        <p>
          Response draft is linked to the locked submission release and its supporting evidence.
        </p>
      </article>
    </>
  )
}

function DossierPage({
  dossierId,
  dossiers,
  activeDossier,
  onLoad,
  onCreated,
  onOpen,
}: {
  dossierId?: string
  dossiers: DossierRecord[]
  activeDossier: DossierWorkspace | null
  onLoad: (result: DossierWorkspace) => void
  onCreated: (result: DossierWorkspace) => void
  onOpen: (id: string) => void
}) {
  const [creating, setCreating] = useState(dossiers.length === 0 && !dossierId)
  const [previewingSample, setPreviewingSample] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [studioTab, setStudioTab] = useState<
    "evidence" | "facts" | "requests" | "draft" | "quality" | "release" | "submission" | "activity"
  >("evidence")
  const [requirementId, setRequirementId] = useState("auto")
  const [evidenceCategory, setEvidenceCategory] = useState<DossierEvidence["category"]>("other")
  const [selectedSectionId, setSelectedSectionId] = useState("")
  const [draftContent, setDraftContent] = useState("")
  const [qualityChecks, setQualityChecks] = useState<DossierQualityCheck[]>([])
  const [claimEvidenceId, setClaimEvidenceId] = useState("")
  const [claimSectionId, setClaimSectionId] = useState("")
  const [claimStatement, setClaimStatement] = useState("")
  const [claimExcerpt, setClaimExcerpt] = useState("")
  const [claimPage, setClaimPage] = useState(1)
  const [claimSuggestions, setClaimSuggestions] = useState<string[]>([])
  const [claimEdits, setClaimEdits] = useState<Record<string, string>>({})
  const [assistMeta, setAssistMeta] = useState<{
    provider: string
    model: string
    claimCount: number
  } | null>(null)
  const [readerEvidence, setReaderEvidence] = useState<DossierEvidence | null>(null)
  const [readerPassages, setReaderPassages] = useState<DossierEvidencePassage[]>([])
  const [readerPage, setReaderPage] = useState(1)
  const [readerSearch, setReaderSearch] = useState("")
  const [factCandidates, setFactCandidates] = useState<FactExtractionRecord[]>([])
  const [sectionVersions, setSectionVersions] = useState<DossierSectionVersion[]>([])
  const [signerName, setSignerName] = useState("")
  const [signerRole, setSignerRole] = useState("")
  const [consultantName, setConsultantName] = useState("")
  const [consultantEmail, setConsultantEmail] = useState("")
  const [handoffScope, setHandoffScope] = useState(
    "Independent scientific and regulatory review of the complete working dossier, evidence traceability, and unresolved quality controls."
  )
  const [handoffDueDate, setHandoffDueDate] = useState("")
  const [issueTargetType, setIssueTargetType] =
    useState<ConsultantReviewIssue["targetType"]>("dossier")
  const [issueTargetId, setIssueTargetId] = useState("")
  const [issueTitle, setIssueTitle] = useState("")
  const [issueBody, setIssueBody] = useState("")
  const [issuePriority, setIssuePriority] = useState<ConsultantReviewIssue["priority"]>("normal")
  const [issueResolutionNotes, setIssueResolutionNotes] = useState<Record<string, string>>({})
  const [submissionAgency, setSubmissionAgency] = useState("FDA")
  const [submissionReleaseId, setSubmissionReleaseId] = useState("")
  const [submissionTracking, setSubmissionTracking] = useState("")
  const [questionSubmissionId, setQuestionSubmissionId] = useState("")
  const [questionTitle, setQuestionTitle] = useState("")
  const [questionBody, setQuestionBody] = useState("")
  const [questionPriority, setQuestionPriority] = useState<AgencyQuestion["priority"]>("normal")
  const [questionDueDate, setQuestionDueDate] = useState("")
  const [questionResponses, setQuestionResponses] = useState<Record<string, string>>({})
  const [dossierSearch, setDossierSearch] = useState("")
  const [dossierStatusFilter, setDossierStatusFilter] = useState("all")
  const [factKind, setFactKind] = useState<FactBookEntry["kind"]>("identity")
  const [factTitle, setFactTitle] = useState("")
  const [factFields, setFactFields] = useState<Record<string, string>>({})
  const [factEvidenceId, setFactEvidenceId] = useState("")
  const [newRequestLinks, setNewRequestLinks] = useState<Record<string, string>>({})
  const [newHandoffLinks, setNewHandoffLinks] = useState<Record<string, string>>({})
  const [editingFactId, setEditingFactId] = useState("")
  const [editingFactTitle, setEditingFactTitle] = useState("")
  const [editingFactFields, setEditingFactFields] = useState<Record<string, string>>({})
  const [factImpact, setFactImpact] = useState<FactImpact | null>(null)

  useEffect(() => {
    if (!dossierId || activeDossier?.dossier.id === dossierId) return
    void getDossier(dossierId)
      .then(onLoad)
      .catch((error) => setFormError(errorMessage(error)))
  }, [activeDossier?.dossier.id, dossierId, onLoad])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const intake: DossierIntake = {
      substanceName: String(data.get("substanceName") ?? "").trim(),
      companyName: String(data.get("companyName") ?? "").trim(),
      substanceType: String(data.get("substanceType") ?? "other") as DossierIntake["substanceType"],
      intendedEffect: String(data.get("intendedEffect") ?? "").trim(),
      intendedUses: String(data.get("intendedUses") ?? "").trim(),
      manufacturingSummary: String(data.get("manufacturingSummary") ?? "").trim(),
      targetPopulation: String(data.get("targetPopulation") ?? "").trim(),
      grasBasis: "scientific_procedures",
    }
    if (!intake.substanceName) {
      setFormError("Substance name is required.")
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      onCreated(await createDossier(intake))
      setCreating(false)
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const selected =
    activeDossier?.dossier.id === dossierId
      ? activeDossier
      : !dossierId && activeDossier
        ? activeDossier
        : null

  const selectedSection =
    selected?.sections.find((section) => section.id === selectedSectionId) ?? selected?.sections[0]
  const draftDirty = Boolean(selectedSection && draftContent !== selectedSection.content)

  useEffect(() => {
    if (!selectedSection) return
    setSelectedSectionId(selectedSection.id)
    setDraftContent(selectedSection.content)
  }, [selectedSection])

  useEffect(() => {
    if (!draftDirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [draftDirty])

  useEffect(() => {
    if (studioTab !== "quality" || !dossierId) return
    void getDossierQuality(dossierId)
      .then(setQualityChecks)
      .catch((error) => setFormError(errorMessage(error)))
  }, [dossierId, studioTab])

  useEffect(() => {
    if (studioTab !== "draft" || !dossierId || !selectedSection) return
    void getSectionVersions(dossierId, selectedSection.id)
      .then(setSectionVersions)
      .catch((error) => setFormError(errorMessage(error)))
  }, [dossierId, selectedSection, studioTab])

  async function restoreVersion(versionId: string) {
    if (
      !selected ||
      !selectedSection ||
      !window.confirm("Restore this version as a new draft? Current history will be preserved.")
    )
      return
    setSaving(true)
    try {
      onLoad(await restoreSectionVersion(selected.dossier.id, selectedSection.id, versionId))
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function addFact() {
    if (!selected || !factTitle.trim()) return
    setSaving(true)
    setFormError(null)
    try {
      onLoad(
        await createFactBookEntry(selected.dossier.id, {
          kind: factKind,
          title: factTitle.trim(),
          fields: factFields,
          evidenceId: factEvidenceId || undefined,
        })
      )
      setFactTitle("")
      setFactFields({})
      setFactEvidenceId("")
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function extractFacts() {
    if (!selected || !readerEvidence) return
    setSaving(true)
    setFormError(null)
    try {
      const result = await suggestEvidenceFacts(selected.dossier.id, readerEvidence.id)
      setFactCandidates(result.candidates)
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function acceptFactCandidate(candidate: FactExtractionRecord) {
    if (!selected || !readerEvidence) return
    setSaving(true)
    try {
      onLoad(await reviewExtractionCandidate(selected.dossier.id, candidate.id, "accept"))
      setFactCandidates((current) => current.filter((item) => item.id !== candidate.id))
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function dismissFactCandidate(candidateId: string) {
    if (!selected) return
    setSaving(true)
    try {
      onLoad(await reviewExtractionCandidate(selected.dossier.id, candidateId, "dismiss"))
      setFactCandidates((current) => current.filter((item) => item.id !== candidateId))
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function setFactStatus(factId: string, status: FactBookEntry["status"]) {
    if (!selected) return
    setSaving(true)
    try {
      onLoad(await reviewFactBookEntry(selected.dossier.id, factId, status))
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function beginFactEdit(fact: FactBookEntry) {
    setEditingFactId(fact.id)
    setEditingFactTitle(fact.title)
    setEditingFactFields(fact.fields)
    setFactImpact(null)
  }

  async function inspectFactImpact() {
    if (!selected || !editingFactId || !editingFactTitle.trim()) return
    setSaving(true)
    setFormError(null)
    try {
      const preview = await previewFactImpact(
        selected.dossier.id,
        editingFactId,
        editingFactTitle.trim(),
        editingFactFields
      )
      setFactImpact(preview.impact)
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function applyFactUpdate() {
    if (!selected || !editingFactId || !editingFactTitle.trim()) return
    setSaving(true)
    setFormError(null)
    try {
      onLoad(
        await updateFactBookEntry(
          selected.dossier.id,
          editingFactId,
          editingFactTitle.trim(),
          editingFactFields,
          true
        )
      )
      setEditingFactId("")
      setFactImpact(null)
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function insertFactReference(factId: string, field: string) {
    const marker = `{{fact:${factId}.${field}}}`
    setDraftContent(
      (current) => `${current}${current.endsWith(" ") || !current ? "" : " "}${marker}`
    )
    setStudioTab("draft")
  }

  async function removeFact(factId: string) {
    if (!selected || !window.confirm("Remove this structured fact? The audit event remains."))
      return
    setSaving(true)
    try {
      onLoad(await deleteFactBookEntry(selected.dossier.id, factId))
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function signAttestation(kind: ReleaseAttestation["kind"]) {
    if (!selected || !signerName.trim() || !signerRole.trim()) return
    setSaving(true)
    setFormError(null)
    try {
      onLoad(
        await signReleaseAttestation(selected.dossier.id, {
          kind,
          signerName: signerName.trim(),
          signerRole: signerRole.trim(),
        })
      )
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function lockRelease() {
    if (!selected) return
    setSaving(true)
    setFormError(null)
    try {
      onLoad(await lockDossierRelease(selected.dossier.id))
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function unlockRelease(releaseId: string) {
    if (
      !selected ||
      !window.confirm("Unlock this release for revision? The locked snapshot remains in history.")
    )
      return
    setSaving(true)
    try {
      onLoad(await unlockDossierRelease(selected.dossier.id, releaseId))
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function prepareHandoff() {
    if (!selected || !consultantName.trim() || !handoffScope.trim()) return
    setSaving(true)
    setFormError(null)
    try {
      onLoad(
        await createConsultantHandoff(selected.dossier.id, {
          consultantName: consultantName.trim(),
          consultantEmail: consultantEmail.trim() || undefined,
          scope: handoffScope.trim(),
          dueDate: handoffDueDate || undefined,
        })
      )
      setConsultantName("")
      setConsultantEmail("")
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function setHandoffStatus(
    handoffId: string,
    status: "in_review" | "completed" | "cancelled"
  ) {
    if (!selected) return
    setSaving(true)
    try {
      onLoad(await updateConsultantHandoff(selected.dossier.id, handoffId, status))
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function shareConsultantReview(handoffId: string) {
    if (!selected) return
    setSaving(true)
    try {
      const result = await createConsultantReviewLink(selected.dossier.id, handoffId)
      setNewHandoffLinks((current) => ({ ...current, [handoffId]: result.url }))
      await navigator.clipboard?.writeText(result.url).catch(() => undefined)
      onLoad(await getDossier(selected.dossier.id))
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function addReviewIssue() {
    if (!selected || !issueTitle.trim() || !issueBody.trim()) return
    const targetId = issueTargetType === "dossier" ? selected.dossier.id : issueTargetId
    if (!targetId) return
    setSaving(true)
    setFormError(null)
    try {
      onLoad(
        await createReviewIssue(selected.dossier.id, {
          handoffId: selected.handoffs.find((item) => item.status === "in_review")?.id,
          targetType: issueTargetType,
          targetId,
          title: issueTitle.trim(),
          body: issueBody.trim(),
          priority: issuePriority,
        })
      )
      setIssueTitle("")
      setIssueBody("")
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function setReviewIssueStatus(issueId: string, status: ConsultantReviewIssue["status"]) {
    if (!selected) return
    setSaving(true)
    try {
      onLoad(
        await updateReviewIssue(
          selected.dossier.id,
          issueId,
          status,
          issueResolutionNotes[issueId]?.trim()
        )
      )
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function addSubmission() {
    if (!selected || !submissionReleaseId || !submissionAgency.trim()) return
    setSaving(true)
    try {
      onLoad(
        await createSubmission(selected.dossier.id, {
          releaseId: submissionReleaseId,
          agency: submissionAgency.trim(),
          trackingNumber: submissionTracking.trim() || undefined,
          status: submissionTracking.trim() ? "submitted" : "ready",
          targetDate: undefined,
        })
      )
      setSubmissionTracking("")
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function setSubmissionStatus(
    submission: SubmissionRecord,
    status: SubmissionRecord["status"]
  ) {
    if (!selected) return
    setSaving(true)
    try {
      onLoad(
        await updateSubmission(selected.dossier.id, submission.id, {
          status,
          trackingNumber: submission.trackingNumber,
          targetDate: submission.targetDate,
        })
      )
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function addAgencyQuestion() {
    if (!selected || !questionSubmissionId || !questionTitle.trim() || !questionBody.trim()) return
    setSaving(true)
    try {
      onLoad(
        await createAgencyQuestion(selected.dossier.id, questionSubmissionId, {
          title: questionTitle.trim(),
          body: questionBody.trim(),
          priority: questionPriority,
          dueDate: questionDueDate || undefined,
        })
      )
      setQuestionTitle("")
      setQuestionBody("")
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function answerAgencyQuestion(question: AgencyQuestion, status: AgencyQuestion["status"]) {
    if (!selected) return
    setSaving(true)
    try {
      onLoad(
        await updateAgencyQuestion(selected.dossier.id, question.id, {
          status,
          response: questionResponses[question.id]?.trim() || question.response,
          dueDate: question.dueDate,
        })
      )
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function requestEvidence(requirementId: string) {
    if (!selected) return
    setSaving(true)
    setFormError(null)
    try {
      onLoad(await createEvidenceRequest(selected.dossier.id, requirementId))
      setStudioTab("requests")
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function shareEvidenceRequest(requestId: string) {
    if (!selected) return
    setSaving(true)
    setFormError(null)
    try {
      const result = await createEvidenceRequestLink(selected.dossier.id, requestId)
      setNewRequestLinks((current) => ({ ...current, [requestId]: result.url }))
      await navigator.clipboard?.writeText(result.url).catch(() => undefined)
      onLoad(await getDossier(selected.dossier.id))
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function setRequestStatus(requestId: string, status: "received" | "resolved" | "rejected") {
    if (!selected) return
    setSaving(true)
    try {
      onLoad(await updateEvidenceRequest(selected.dossier.id, requestId, status))
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function uploadEvidence(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ""
    if (!file || !selected) return
    const mappedRequirement = requirementId
    if (!mappedRequirement) return
    setSaving(true)
    setFormError(null)
    try {
      onLoad(
        await uploadDossierEvidence(selected.dossier.id, file, mappedRequirement, evidenceCategory)
      )
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function verifyEvidenceItem(evidenceId: string, status: "verified" | "rejected") {
    if (!selected) return
    setSaving(true)
    try {
      onLoad(await verifyDossierEvidence(selected.dossier.id, evidenceId, status))
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function removeEvidenceItem(evidence: DossierEvidence) {
    if (!selected) return
    const claimCount = selected.claims.filter((claim) => claim.evidenceId === evidence.id).length
    const confirmed = window.confirm(
      `Remove ${evidence.title}? This also removes its ${evidence.pageCount} extracted page records${claimCount > 0 ? ` and ${claimCount} linked claims` : ""}. This cannot be undone.`
    )
    if (!confirmed) return
    setSaving(true)
    try {
      onLoad(await deleteDossierEvidence(selected.dossier.id, evidence.id))
      if (readerEvidence?.id === evidence.id) setReaderEvidence(null)
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function saveSection(status: "draft" | "in_review" | "approved") {
    if (!selected || !selectedSection) return
    setSaving(true)
    try {
      onLoad(
        await saveDossierSection(selected.dossier.id, selectedSection.id, draftContent, status)
      )
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function generateStarter() {
    if (!selected || !selectedSection) return
    setSaving(true)
    try {
      onLoad(await createSectionStarter(selected.dossier.id, selectedSection.id))
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function assistSection() {
    if (!selected || !selectedSection) return
    setSaving(true)
    setFormError(null)
    try {
      const { result } = await assistDossierSection(selected.dossier.id, selectedSection.id)
      setDraftContent(result.draft)
      setAssistMeta({
        provider: result.provider,
        model: result.model,
        claimCount: result.claimIds.length,
      })
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function chooseSection(sectionId: string) {
    if (draftDirty && !window.confirm("Discard unsaved changes to this section?")) return
    const section = selected?.sections.find((item) => item.id === sectionId)
    if (!section) return
    setSelectedSectionId(section.id)
    setDraftContent(section.content)
    setAssistMeta(null)
  }

  function beginClaim(evidence: DossierEvidence, passage?: DossierEvidencePassage) {
    const requirement = selected?.requirements.find((item) => item.id === evidence.requirementId)
    const section = selected?.sections.find((item) => item.part === requirement?.section)
    setClaimEvidenceId(evidence.id)
    setClaimSectionId(section?.id ?? selected?.sections[0]?.id ?? "")
    const sourceText = passage?.text || evidence.excerpt
    const suggestions = requirement ? suggestClaimsFromPassage(sourceText, requirement) : []
    setClaimSuggestions(suggestions)
    setClaimStatement(suggestions[0] ?? sourceText.split(/(?<=[.!?])\s/)[0]?.slice(0, 500) ?? "")
    setClaimExcerpt(sourceText.slice(0, 900))
    setClaimPage(passage?.pageNumber ?? 1)
  }

  async function openEvidenceReader(evidence: DossierEvidence) {
    if (!selected) return
    setSaving(true)
    try {
      const result = await getEvidencePassages(selected.dossier.id, evidence.id)
      setReaderEvidence(result.evidence)
      setFactCandidates(
        selected?.extractionCandidates.filter(
          (candidate) => candidate.evidenceId === evidence.id && candidate.status === "proposed"
        ) ?? []
      )
      setReaderPassages(result.passages)
      setReaderPage(result.passages[0]?.pageNumber ?? 1)
      setReaderSearch("")
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function submitClaim() {
    if (!selected || !claimEvidenceId || !claimSectionId) return
    setSaving(true)
    try {
      onLoad(
        await createDossierClaim(selected.dossier.id, {
          evidenceId: claimEvidenceId,
          sectionId: claimSectionId,
          statement: claimStatement,
          sourceExcerpt: claimExcerpt,
          sourcePage: claimPage,
        })
      )
      setClaimEvidenceId("")
      setClaimStatement("")
      setClaimExcerpt("")
      setClaimSuggestions([])
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function reviewClaim(claimId: string, status: "verified" | "rejected") {
    if (!selected) return
    const claim = selected.claims.find((item) => item.id === claimId)
    if (!claim) return
    setSaving(true)
    try {
      onLoad(
        await reviewDossierClaim(
          selected.dossier.id,
          claimId,
          claimEdits[claimId] ?? claim.statement,
          status
        )
      )
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  if (previewingSample) {
    return <SampleDossierPreview onClose={() => setPreviewingSample(false)} />
  }

  if (creating || (!dossierId && dossiers.length === 0)) {
    return (
      <main className="dossier-page dossier-intake-page">
        <section className="dossier-intro">
          <p className="section-label">NEW DOSSIER</p>
          <h1>Build the evidence plan before drafting.</h1>
          <p>
            Greenlit will turn this regulatory scope into a tailored GRAS notice structure and
            evidence requirements matrix.
          </p>
        </section>
        <form className="dossier-intake" onSubmit={submit}>
          <div className="intake-section">
            <span>01 / IDENTITY</span>
            <label>
              Substance name *
              <input name="substanceName" placeholder="e.g. Fermented pea protein" />
            </label>
            <label>
              Company
              <input name="companyName" placeholder="Sponsor or notifier" />
            </label>
            <label>
              Substance type
              <select name="substanceType" defaultValue="fermentation">
                <option value="fermentation">Fermentation-derived substance</option>
                <option value="enzyme">Enzyme preparation</option>
                <option value="protein">Protein ingredient</option>
                <option value="botanical">Botanical or extract</option>
                <option value="chemical">Chemical substance</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <div className="intake-section">
            <span>02 / CONDITIONS OF USE</span>
            <label>
              Intended technical effect
              <textarea
                name="intendedEffect"
                placeholder="What function will the substance perform?"
              />
            </label>
            <label>
              Intended uses and use levels
              <textarea
                name="intendedUses"
                placeholder="Food categories, maximum use levels, and exclusions"
              />
            </label>
            <label>
              Target population
              <input name="targetPopulation" defaultValue="General U.S. population" />
            </label>
          </div>
          <div className="intake-section">
            <span>03 / MANUFACTURING</span>
            <label>
              Process summary
              <textarea
                name="manufacturingSummary"
                placeholder="Briefly describe source materials, production, purification, and finishing."
              />
            </label>
            <div className="intake-note">
              <ShieldCheck />
              <p>
                This creates a planning workspace. Greenlit will not infer a GRAS conclusion from
                intake answers.
              </p>
            </div>
          </div>
          {formError ? <p className="form-error">{formError}</p> : null}
          <button
            type="button"
            className="sample-dossier-launch"
            onClick={() => setPreviewingSample(true)}
          >
            <FileSearch />
            <span>
              <strong>Explore a complete sample dossier</strong>
              Preview every workflow with realistic data. Nothing will be saved.
            </span>
            <ArrowRight />
          </button>
          <div className="intake-actions">
            {dossiers.length > 0 ? (
              <button type="button" className="secondary-action" onClick={() => setCreating(false)}>
                Cancel
              </button>
            ) : null}
            <button type="submit" className="primary-action" disabled={saving}>
              {saving ? <LoaderCircle className="spin" /> : <Plus />}
              Create evidence plan
            </button>
          </div>
        </form>
      </main>
    )
  }

  if (!dossierId || !selected) {
    const visibleDossiers = dossiers.filter(
      (dossier) =>
        (dossierStatusFilter === "all" || dossier.status === dossierStatusFilter) &&
        `${dossier.name} ${dossier.intake.substanceName} ${dossier.intake.companyName} ${dossier.intake.substanceType}`
          .toLowerCase()
          .includes(dossierSearch.trim().toLowerCase())
    )
    return (
      <main className="dossier-page">
        <section className="workspace-heading">
          <div>
            <p className="section-label">DOSSIER WORKSPACES</p>
            <h1>Drafting studio</h1>
            <p>Evidence-led GRAS notice planning and drafting.</p>
          </div>
          <button type="button" className="primary-action" onClick={() => setCreating(true)}>
            <Plus /> New dossier
          </button>
        </section>
        <div className="dossier-library-tools">
          <label className="dossier-library-search">
            <Search />
            <input
              type="search"
              value={dossierSearch}
              onChange={(event) => setDossierSearch(event.currentTarget.value)}
              placeholder="Search dossiers by substance, sponsor, or type"
            />
          </label>
          <select
            aria-label="Filter dossiers by status"
            value={dossierStatusFilter}
            onChange={(event) => setDossierStatusFilter(event.currentTarget.value)}
          >
            <option value="all">All workflow stages</option>
            <option value="planning">Planning</option>
            <option value="collecting_evidence">Collecting evidence</option>
            <option value="drafting">Drafting</option>
            <option value="review">Review</option>
          </select>
        </div>
        <div className="dossier-library">
          {visibleDossiers.map((dossier) => (
            <button key={dossier.id} type="button" onClick={() => onOpen(dossier.id)}>
              <span>
                <FileText />
                <strong>{dossier.name}</strong>
              </span>
              <StatusPill value={dossier.status} />
              <small>{dossier.intake.substanceType.replaceAll("_", " ")}</small>
              <ChevronRight />
            </button>
          ))}
          {visibleDossiers.length === 0 ? (
            <div className="evidence-empty">
              <Search />
              <h3>No matching dossiers</h3>
              <p>Try a substance, sponsor, or dossier type.</p>
            </div>
          ) : null}
        </div>
      </main>
    )
  }

  const ready = selected.requirements.filter((item) => item.status === "ready").length
  const currentPassage =
    readerPassages.find((passage) => passage.pageNumber === readerPage) ?? readerPassages[0]
  const verifiedClaimCount = selected.claims.filter((claim) => claim.status === "verified").length
  const approvedSectionCount = selected.sections.filter(
    (section) => section.status === "approved"
  ).length
  const activeRelease = selected.releases.find((release) => release.status === "locked")
  const nextGate = activeRelease
    ? `Release v${activeRelease.packageVersion} locked`
    : selected.evidence.length === 0
      ? "Evidence collection"
      : verifiedClaimCount === 0
        ? "Claim verification"
        : approvedSectionCount < selected.sections.length
          ? "Section approval"
          : "Final quality review"
  const draftedSectionCount = selected.sections.filter(
    (section) => section.content.trim().length >= 80
  ).length
  const verifiedEvidenceCount = selected.evidence.filter(
    (evidence) => evidence.verificationStatus === "verified"
  ).length
  const progress = Math.round(
    (ready / Math.max(selected.requirements.length, 1)) * 35 +
      (verifiedEvidenceCount / Math.max(selected.evidence.length, 1)) * 15 +
      (draftedSectionCount / Math.max(selected.sections.length, 1)) * 25 +
      (approvedSectionCount / Math.max(selected.sections.length, 1)) * 25
  )
  const visiblePassages = readerSearch.trim()
    ? readerPassages.filter((passage) =>
        passage.text.toLowerCase().includes(readerSearch.trim().toLowerCase())
      )
    : readerPassages
  return (
    <main className="dossier-page">
      <section className="dossier-header">
        <div className="dossier-header-toolbar">
          <button type="button" onClick={() => onOpen("")}>
            <ArrowLeft /> All dossiers
          </button>
          <div className="dossier-header-actions">
            <button
              type="button"
              onClick={() =>
                downloadDossierExport(
                  selected.dossier.id,
                  selected.dossier.intake.substanceName
                ).catch((error) => setFormError(errorMessage(error)))
              }
            >
              <Download /> Export draft
            </button>
            <button
              type="button"
              onClick={() =>
                downloadSubmissionPackage(
                  selected.dossier.id,
                  selected.dossier.intake.substanceName
                ).catch((error) => setFormError(errorMessage(error)))
              }
            >
              <LockKeyhole /> Submission package
            </button>
          </div>
        </div>
        <div className="dossier-title-block">
          <p className="section-label">GRAS DOSSIER</p>
          <h1>{selected.dossier.intake.substanceName}</h1>
          <p>
            {selected.dossier.intake.companyName || "No sponsor specified"} ·{" "}
            {selected.dossier.intake.substanceType.replaceAll("_", " ")}
          </p>
        </div>
      </section>
      {activeRelease ? (
        <section className="release-lock-banner">
          <LockKeyhole />
          <div>
            <strong>Controlled release v{activeRelease.packageVersion} is locked</strong>
            <p>
              Draft, evidence, claim, and request changes are blocked until the release is
              explicitly unlocked in the Release center.
            </p>
          </div>
          <button type="button" onClick={() => setStudioTab("release")}>
            Open release center
          </button>
        </section>
      ) : null}
      <section className="dossier-progress">
        <div>
          <span>REQUIREMENTS</span>
          <strong>{selected.requirements.length}</strong>
        </div>
        <div>
          <span>READY</span>
          <strong>{ready}</strong>
        </div>
        <div>
          <span>EVIDENCE ITEMS</span>
          <strong>{selected.evidence.length}</strong>
        </div>
        <div>
          <span>NEXT GATE</span>
          <strong>{nextGate}</strong>
        </div>
      </section>
      <section className="dossier-completion" aria-label={`${progress}% dossier workflow complete`}>
        <div>
          <span>WORKFLOW COMPLETION</span>
          <strong>{progress}%</strong>
        </div>
        <div className="completion-track">
          <i style={{ width: `${progress}%` }} />
        </div>
        <p>
          {nextGate} is the next meaningful gate. Progress reflects verified evidence, substantive
          drafting, and human approvals.
        </p>
      </section>
      <section className="dossier-workbench">
        <aside>
          <p>WORKFLOW</p>
          <button type="button" onClick={() => setStudioTab("evidence")}>
            <Check /> Scope
          </button>
          <button
            type="button"
            className={studioTab === "requests" ? "is-current" : ""}
            onClick={() => setStudioTab("requests")}
          >
            <CircleAlert /> Evidence requests
          </button>
          <button
            type="button"
            className={studioTab === "evidence" ? "is-current" : ""}
            onClick={() => setStudioTab("evidence")}
          >
            <FolderOpen /> Evidence room
          </button>
          <button
            type="button"
            className={studioTab === "facts" ? "is-current" : ""}
            onClick={() => setStudioTab("facts")}
          >
            <TableProperties /> Fact Book
          </button>
          <button
            type="button"
            className={studioTab === "draft" ? "is-current" : ""}
            onClick={() => setStudioTab("draft")}
          >
            <FileText /> Draft sections
          </button>
          <button
            type="button"
            className={studioTab === "quality" ? "is-current" : ""}
            onClick={() => setStudioTab("quality")}
          >
            <ShieldCheck /> Quality review
          </button>
          <button
            type="button"
            className={studioTab === "release" ? "is-current" : ""}
            onClick={() => setStudioTab("release")}
          >
            <LockKeyhole /> Release center
          </button>
          <button
            type="button"
            className={studioTab === "submission" ? "is-current" : ""}
            onClick={() => setStudioTab("submission")}
          >
            <ArrowRight /> Submission lifecycle
          </button>
          <button
            type="button"
            className={studioTab === "activity" ? "is-current" : ""}
            onClick={() => setStudioTab("activity")}
          >
            <Clock3 /> Activity
          </button>
        </aside>
        {studioTab === "evidence" ? (
          <div className="requirements-panel">
            <div className="requirements-heading">
              <div>
                <p className="section-label">EVIDENCE ROOM</p>
                <h2>Sources & requirements</h2>
              </div>
              <span>
                <TableProperties /> {selected.requirements.length} requirements
              </span>
            </div>
            <p className="requirements-lede">
              Upload source PDFs, map each one to a requirement, then verify the extracted record
              before it can support drafting.
            </p>
            <div className="evidence-upload-bar">
              <select
                aria-label="Evidence requirement"
                value={requirementId}
                onChange={(event) => setRequirementId(event.currentTarget.value)}
              >
                <option value="auto">Let Greenlit suggest the best requirement</option>
                {selected.requirements.map((requirement) => (
                  <option key={requirement.id} value={requirement.id}>
                    {requirement.section} · {requirement.title}
                  </option>
                ))}
              </select>
              <select
                aria-label="Evidence category"
                value={evidenceCategory}
                onChange={(event) =>
                  setEvidenceCategory(event.currentTarget.value as DossierEvidence["category"])
                }
              >
                <option value="identity">Identity</option>
                <option value="manufacturing">Manufacturing</option>
                <option value="specification">Specification</option>
                <option value="exposure">Exposure</option>
                <option value="safety_study">Safety study</option>
                <option value="regulatory">Regulatory</option>
                <option value="other">Other</option>
              </select>
              <label className="primary-action evidence-upload">
                {saving ? <LoaderCircle className="spin" /> : <Upload />} Upload source
                <input type="file" accept="application/pdf,.pdf" onChange={uploadEvidence} />
              </label>
            </div>
            {formError ? <p className="form-error">{formError}</p> : null}
            {readerEvidence && currentPassage ? (
              <section className="evidence-reader">
                <div className="evidence-reader-head">
                  <div>
                    <p className="section-label">SOURCE READER</p>
                    <h3>{readerEvidence.title}</h3>
                  </div>
                  <label>
                    <Search />
                    <input
                      type="search"
                      value={readerSearch}
                      onChange={(event) => setReaderSearch(event.currentTarget.value)}
                      placeholder="Find in source"
                      aria-label="Find in evidence source"
                    />
                  </label>
                  <button
                    type="button"
                    aria-label="Close evidence reader"
                    onClick={() => {
                      setReaderEvidence(null)
                      setFactCandidates([])
                    }}
                  >
                    <X />
                  </button>
                </div>
                <div className="evidence-reader-body">
                  <nav aria-label="Evidence pages">
                    {visiblePassages.map((passage) => (
                      <button
                        type="button"
                        key={passage.id}
                        className={
                          passage.pageNumber === currentPassage.pageNumber ? "is-active" : ""
                        }
                        onClick={() => setReaderPage(passage.pageNumber)}
                      >
                        Page {passage.pageNumber}
                        <small>{passage.text.slice(0, 70) || "No readable text"}</small>
                      </button>
                    ))}
                    {visiblePassages.length === 0 ? <p>No pages match this search.</p> : null}
                  </nav>
                  <article>
                    <span>PAGE {currentPassage.pageNumber}</span>
                    <p>{currentPassage.text || "No readable text was extracted from this page."}</p>
                    {readerEvidence.verificationStatus === "verified" ? (
                      <div className="evidence-actions">
                        <button
                          type="button"
                          className="primary-action"
                          onClick={() => beginClaim(readerEvidence, currentPassage)}
                        >
                          <Plus /> Create claim from this page
                        </button>
                        <button type="button" onClick={extractFacts} disabled={saving}>
                          <TableProperties /> Extract proposed facts
                        </button>
                      </div>
                    ) : (
                      <small>Verify this source before creating claims from its pages.</small>
                    )}
                    {factCandidates.length ? (
                      <section className="section-claims">
                        <div>
                          <strong>Extraction review inbox</strong>
                          <small>
                            {factCandidates.length} proposals · nothing added automatically
                          </small>
                        </div>
                        {factCandidates.map((candidate) => (
                          <article key={candidate.id}>
                            <p>{candidate.title}</p>
                            <small>
                              Page {candidate.sourcePage} · {candidate.confidence} confidence ·{" "}
                              {Object.entries(candidate.fields)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join(" · ")}
                            </small>
                            <blockquote>“{candidate.sourceExcerpt}”</blockquote>
                            <div className="evidence-actions">
                              <button
                                type="button"
                                onClick={() => dismissFactCandidate(candidate.id)}
                              >
                                Dismiss
                              </button>
                              <button
                                type="button"
                                className="primary-action"
                                disabled={saving}
                                onClick={() => acceptFactCandidate(candidate)}
                              >
                                <Check /> Accept as draft fact
                              </button>
                            </div>
                          </article>
                        ))}
                      </section>
                    ) : null}
                  </article>
                </div>
              </section>
            ) : null}
            {selected.evidence.length > 0 ? (
              <div className="evidence-cards">
                {selected.evidence.map((evidence) => (
                  <article key={evidence.id}>
                    <div className="evidence-card-head">
                      <span>
                        <FileText /> {evidence.title}
                      </span>
                      <StatusPill value={evidence.verificationStatus} />
                      <button
                        type="button"
                        className="evidence-remove"
                        aria-label={`Remove ${evidence.title}`}
                        onClick={() => removeEvidenceItem(evidence)}
                      >
                        <Trash2 />
                      </button>
                    </div>
                    <p>{evidence.excerpt || "No readable text was extracted from this source."}</p>
                    <small>
                      {evidence.pageCount} pages · {evidence.category.replaceAll("_", " ")} · mapped
                      to{" "}
                      {
                        selected.requirements.find((item) => item.id === evidence.requirementId)
                          ?.title
                      }
                    </small>
                    {evidence.verificationStatus === "needs_review" ? (
                      <div className="evidence-actions">
                        <button type="button" onClick={() => openEvidenceReader(evidence)}>
                          <Search /> Inspect pages
                        </button>
                        <button
                          type="button"
                          onClick={() => verifyEvidenceItem(evidence.id, "rejected")}
                        >
                          <X /> Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => verifyEvidenceItem(evidence.id, "verified")}
                        >
                          <Check /> Verify source
                        </button>
                      </div>
                    ) : evidence.verificationStatus === "verified" ? (
                      <div className="evidence-actions">
                        <button type="button" onClick={() => openEvidenceReader(evidence)}>
                          <Search /> Inspect pages
                        </button>
                        <button type="button" onClick={() => beginClaim(evidence)}>
                          <Plus /> Propose supported claim
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="evidence-empty">
                <FolderOpen />
                <h3>No evidence uploaded yet</h3>
                <p>
                  Start with specifications, batch analyses, process descriptions, or pivotal safety
                  studies.
                </p>
              </div>
            )}
            {claimEvidenceId ? (
              <section className="claim-composer">
                <div className="requirements-heading">
                  <div>
                    <p className="section-label">CLAIM LEDGER</p>
                    <h2>Propose a supported claim</h2>
                  </div>
                  <button type="button" onClick={() => setClaimEvidenceId("")}>
                    <X />
                  </button>
                </div>
                {claimSuggestions.length > 0 ? (
                  <div className="claim-suggestions">
                    <span>SUGGESTED FROM THIS PAGE</span>
                    {claimSuggestions.map((suggestion) => (
                      <button
                        type="button"
                        key={suggestion}
                        className={claimStatement === suggestion ? "is-selected" : ""}
                        onClick={() => setClaimStatement(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
                <label>
                  Regulatory statement
                  <textarea
                    value={claimStatement}
                    onChange={(event) => setClaimStatement(event.currentTarget.value)}
                  />
                </label>
                <label>
                  Exact supporting excerpt
                  <textarea
                    value={claimExcerpt}
                    onChange={(event) => setClaimExcerpt(event.currentTarget.value)}
                  />
                </label>
                <div className="claim-fields">
                  <label>
                    Destination section
                    <select
                      value={claimSectionId}
                      onChange={(event) => setClaimSectionId(event.currentTarget.value)}
                    >
                      {selected.sections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.part} · {section.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Source page
                    <input
                      type="number"
                      min="1"
                      value={claimPage}
                      onChange={(event) => setClaimPage(Number(event.currentTarget.value))}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="primary-action"
                  disabled={saving || !claimStatement.trim() || !claimExcerpt.trim()}
                  onClick={submitClaim}
                >
                  Add proposed claim
                </button>
              </section>
            ) : null}
            <div className="requirements-table compact-requirements">
              {selected.requirements.map((requirement) => (
                <article key={requirement.id}>
                  <span className="requirement-part">{requirement.section}</span>
                  <div>
                    <h3>{requirement.title}</h3>
                    <p>{requirement.guidance}</p>
                  </div>
                  <StatusPill value={requirement.status} />
                  <strong>{requirement.evidenceCount} sources</strong>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => requestEvidence(requirement.id)}
                  >
                    <Plus /> Request evidence
                  </button>
                </article>
              ))}
            </div>
          </div>
        ) : null}
        {studioTab === "facts" ? (
          <div className="requirements-panel fact-book">
            <div className="requirements-heading">
              <div>
                <p className="section-label">FACT BOOK</p>
                <h2>Governed regulatory facts</h2>
              </div>
              <button
                type="button"
                onClick={() =>
                  downloadFactBook(
                    selected.dossier.id,
                    selected.dossier.intake.substanceName
                  ).catch((error) => setFormError(errorMessage(error)))
                }
              >
                <Download /> Export CSV
              </button>
              <span>
                {selected.factBookEntries.filter((item) => item.status === "verified").length}{" "}
                verified
              </span>
            </div>
            <p className="requirements-lede">
              Capture facts once as structured data, link them to source evidence, and reuse them
              across drafting, quality review, and package exports.
            </p>
            {formError ? <p className="form-error">{formError}</p> : null}
            <section className="claim-composer">
              <div className="claim-fields">
                <label>
                  Record type
                  <select
                    value={factKind}
                    onChange={(event) => {
                      setFactKind(event.currentTarget.value as FactBookEntry["kind"])
                      setFactFields({})
                    }}
                  >
                    {Object.keys(factTemplates).map((kind) => (
                      <option key={kind} value={kind}>
                        {kind.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Record title
                  <input
                    value={factTitle}
                    onChange={(event) => setFactTitle(event.currentTarget.value)}
                    placeholder="Short, recognizable title"
                  />
                </label>
                <label>
                  Source evidence
                  <select
                    value={factEvidenceId}
                    onChange={(event) => setFactEvidenceId(event.currentTarget.value)}
                  >
                    <option value="">No source linked yet</option>
                    {selected.evidence.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="fact-fields">
                {factTemplates[factKind].map((field) => (
                  <label key={field.key}>
                    {field.label}
                    <input
                      value={factFields[field.key] ?? ""}
                      onChange={(event) =>
                        setFactFields((current) => ({
                          ...current,
                          [field.key]: event.currentTarget.value,
                        }))
                      }
                      placeholder={field.placeholder}
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="primary-action"
                disabled={
                  saving ||
                  !factTitle.trim() ||
                  Object.values(factFields).every((value) => !value.trim())
                }
                onClick={addFact}
              >
                <Plus /> Add structured record
              </button>
            </section>
            <div className="fact-groups">
              {Object.keys(factTemplates).map((kind) => {
                const entries = selected.factBookEntries.filter((item) => item.kind === kind)
                if (!entries.length) return null
                return (
                  <section key={kind}>
                    <div className="requirements-heading">
                      <div>
                        <p className="section-label">{kind.replaceAll("_", " ")}</p>
                        <h2>{entries.length} records</h2>
                      </div>
                    </div>
                    <div className="evidence-cards">
                      {entries.map((fact) => (
                        <article key={fact.id}>
                          <div className="evidence-card-head">
                            <span>
                              <TableProperties /> {fact.title}
                            </span>
                            <StatusPill value={fact.status} />
                          </div>
                          {editingFactId === fact.id ? (
                            <div className="fact-fields">
                              <label>
                                Record title
                                <input
                                  value={editingFactTitle}
                                  onChange={(event) =>
                                    setEditingFactTitle(event.currentTarget.value)
                                  }
                                />
                              </label>
                              {Object.entries(editingFactFields).map(([key, value]) => (
                                <label key={key}>
                                  {key.replaceAll("_", " ")}
                                  <input
                                    value={value}
                                    onChange={(event) =>
                                      setEditingFactFields((current) => ({
                                        ...current,
                                        [key]: event.currentTarget.value,
                                      }))
                                    }
                                  />
                                </label>
                              ))}
                            </div>
                          ) : (
                            <dl>
                              {Object.entries(fact.fields).map(([key, value]) => (
                                <div key={key}>
                                  <dt>{key.replaceAll("_", " ")}</dt>
                                  <dd>{value}</dd>
                                  <button
                                    type="button"
                                    onClick={() => insertFactReference(fact.id, key)}
                                  >
                                    Insert in draft
                                  </button>
                                </div>
                              ))}
                            </dl>
                          )}
                          {editingFactId === fact.id && factImpact ? (
                            <div className="draft-provenance">
                              <ShieldCheck />
                              <span>
                                {factImpact.changedFields.length
                                  ? `${factImpact.changedFields.length} changed field${factImpact.changedFields.length === 1 ? "" : "s"}. `
                                  : "No field changes. "}
                                {factImpact.affectedSectionIds.length
                                  ? `${factImpact.affectedSectionIds.length} linked section${factImpact.affectedSectionIds.length === 1 ? "" : "s"} will update and return to review: ${factImpact.affectedSectionIds
                                      .map(
                                        (id) =>
                                          selected.sections.find((section) => section.id === id)
                                            ?.title ?? id
                                      )
                                      .join(", ")}.`
                                  : "No dossier sections currently reference these changed fields."}
                              </span>
                            </div>
                          ) : null}
                          <small>
                            {fact.evidenceId
                              ? `Linked to ${selected.evidence.find((item) => item.id === fact.evidenceId)?.title ?? "evidence"}`
                              : "No evidence linked"}{" "}
                            · updated {formatDate(fact.updatedAt)}
                          </small>
                          <div className="evidence-actions">
                            {editingFactId === fact.id ? (
                              <>
                                <button type="button" onClick={() => setEditingFactId("")}>
                                  Cancel
                                </button>
                                <button type="button" onClick={inspectFactImpact} disabled={saving}>
                                  Preview impact
                                </button>
                                {factImpact ? (
                                  <button type="button" onClick={applyFactUpdate} disabled={saving}>
                                    <Check /> Apply governed update
                                  </button>
                                ) : null}
                              </>
                            ) : (
                              <button type="button" onClick={() => beginFactEdit(fact)}>
                                Edit
                              </button>
                            )}
                            {fact.status === "draft" ? (
                              <button
                                type="button"
                                onClick={() => setFactStatus(fact.id, "verified")}
                              >
                                <Check /> Verify fact
                              </button>
                            ) : (
                              <button type="button" onClick={() => setFactStatus(fact.id, "draft")}>
                                Reopen
                              </button>
                            )}
                            <button type="button" onClick={() => removeFact(fact.id)}>
                              <Trash2 /> Remove
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
            {selected.factBookEntries.length === 0 ? (
              <div className="evidence-empty">
                <TableProperties />
                <h3>No structured facts yet</h3>
                <p>
                  Start with canonical identity, intended uses, specifications, exposure, or a
                  pivotal safety study.
                </p>
              </div>
            ) : null}
            {selected.factBookRevisions.length ? (
              <section className="section-claims">
                <div>
                  <strong>Governed change history</strong>
                  <small>{selected.factBookRevisions.length} revisions</small>
                </div>
                {selected.factBookRevisions.slice(0, 10).map((revision) => (
                  <article key={revision.id}>
                    <p>
                      {revision.previousTitle}{" "}
                      {revision.previousTitle !== revision.nextTitle
                        ? `→ ${revision.nextTitle}`
                        : "updated"}
                    </p>
                    <small>
                      {formatDate(revision.createdAt)} · {revision.affectedSectionIds.length}{" "}
                      affected section
                      {revision.affectedSectionIds.length === 1 ? "" : "s"}
                    </small>
                  </article>
                ))}
              </section>
            ) : null}
          </div>
        ) : null}
        {studioTab === "requests" ? (
          <div className="requirements-panel">
            <div className="requirements-heading">
              <div>
                <p className="section-label">EVIDENCE REQUESTS</p>
                <h2>Close evidence gaps</h2>
              </div>
              <span>{selected.evidenceRequests.length} requests</span>
            </div>
            <p className="requirements-lede">
              Turn missing requirements into a concrete work queue, then track each response through
              resolution.
            </p>
            {formError ? <p className="form-error">{formError}</p> : null}
            <div className="evidence-cards">
              {selected.evidenceRequests.map((request) => (
                <article key={request.id}>
                  <div className="evidence-card-head">
                    <span>
                      <CircleAlert /> {request.title}
                    </span>
                    <StatusPill value={request.status} />
                  </div>
                  <p>{request.detail}</p>
                  <small>
                    {request.priority} priority · updated {formatDate(request.updatedAt)}
                  </small>
                  {request.responseNote ? <blockquote>“{request.responseNote}”</blockquote> : null}
                  {newRequestLinks[request.id] ? (
                    <label>
                      Secure one-time response link
                      <input
                        value={newRequestLinks[request.id]}
                        readOnly
                        onFocus={(event) => event.currentTarget.select()}
                      />
                      <small>Copied when created. Share only with the intended respondent.</small>
                    </label>
                  ) : null}
                  {request.status === "open" ? (
                    <div className="evidence-actions">
                      <button
                        type="button"
                        onClick={() => shareEvidenceRequest(request.id)}
                        disabled={saving}
                      >
                        <ShieldCheck /> Create secure response link
                      </button>
                      <button
                        type="button"
                        onClick={() => setRequestStatus(request.id, "received")}
                      >
                        Mark received
                      </button>
                      <button
                        type="button"
                        onClick={() => setRequestStatus(request.id, "rejected")}
                      >
                        Close unavailable
                      </button>
                    </div>
                  ) : null}
                  {request.status === "received" ? (
                    <div className="evidence-actions">
                      <button
                        type="button"
                        onClick={() => setRequestStatus(request.id, "resolved")}
                      >
                        <Check /> Resolve request
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
              {selected.evidenceRequests.length === 0 ? (
                <div className="evidence-empty">
                  <CircleAlert />
                  <h3>No evidence requests</h3>
                  <p>Create one from any requirement in the evidence room.</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {studioTab === "release" ? (
          <div className="requirements-panel release-center">
            <div className="requirements-heading">
              <div>
                <p className="section-label">RELEASE CENTER</p>
                <h2>Review, attest & hand off</h2>
              </div>
              <LockKeyhole />
            </div>
            <p className="requirements-lede">
              Capture named human accountability, freeze a quality snapshot, and prepare a
              controlled consultant review package.
            </p>
            {formError ? <p className="form-error">{formError}</p> : null}
            <section className="claim-composer">
              <div className="requirements-heading">
                <div>
                  <p className="section-label">SIGNER</p>
                  <h2>Release attestations</h2>
                </div>
                <span>
                  {
                    new Set(
                      selected.attestations
                        .filter((item) => item.status === "signed")
                        .map((item) => item.kind)
                    ).size
                  }{" "}
                  of 4 signed
                </span>
              </div>
              <div className="claim-fields">
                <label>
                  Signer name
                  <input
                    value={signerName}
                    onChange={(event) => setSignerName(event.currentTarget.value)}
                    placeholder="Full name"
                  />
                </label>
                <label>
                  Role
                  <input
                    value={signerRole}
                    onChange={(event) => setSignerRole(event.currentTarget.value)}
                    placeholder="Scientific or regulatory role"
                  />
                </label>
              </div>
              <div className="quality-checks">
                {(
                  [
                    "scientific_accuracy",
                    "source_traceability",
                    "regulatory_completeness",
                    "final_authorization",
                  ] as ReleaseAttestation["kind"][]
                ).map((kind) => {
                  const signed = selected.attestations.find(
                    (item) => item.kind === kind && item.status === "signed"
                  )
                  return (
                    <article key={kind} className={signed ? "quality-passed" : "quality-warning"}>
                      <span>{signed ? <Check /> : <CircleAlert />}</span>
                      <div>
                        <small>HUMAN ATTESTATION</small>
                        <h3>{kind.replaceAll("_", " ")}</h3>
                        <p>
                          {signed
                            ? `${signed.signerName}, ${signed.signerRole} · ${formatDate(signed.signedAt)}`
                            : "A named reviewer must sign this control."}
                        </p>
                      </div>
                      {!signed ? (
                        <button
                          type="button"
                          disabled={saving || !signerName.trim() || !signerRole.trim()}
                          onClick={() => signAttestation(kind)}
                        >
                          Sign
                        </button>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            </section>
            <section className="claim-composer">
              <div className="requirements-heading">
                <div>
                  <p className="section-label">CONTROLLED PACKAGE</p>
                  <h2>Release snapshots</h2>
                </div>
                <button
                  type="button"
                  className="primary-action"
                  disabled={saving}
                  onClick={lockRelease}
                >
                  <LockKeyhole /> Lock new release
                </button>
              </div>
              <p>
                Locking captures the current quality checks and package version. Blocking controls
                or missing attestations prevent release.
              </p>
              <div className="evidence-cards">
                {selected.releases.map((release) => (
                  <article key={release.id}>
                    <div className="evidence-card-head">
                      <span>Package v{release.packageVersion}</span>
                      <StatusPill value={release.status} />
                    </div>
                    <p>
                      {release.qualitySnapshot.filter((item) => item.severity === "passed").length}{" "}
                      controls passed ·{" "}
                      {release.qualitySnapshot.filter((item) => item.severity === "warning").length}{" "}
                      warnings
                    </p>
                    <small>Locked {formatDate(release.lockedAt)}</small>
                    {release.status === "locked" ? (
                      <div className="evidence-actions">
                        <button
                          type="button"
                          onClick={() =>
                            downloadSubmissionPackage(
                              selected.dossier.id,
                              selected.dossier.intake.substanceName
                            ).catch((error) => setFormError(errorMessage(error)))
                          }
                        >
                          <Download /> Download package
                        </button>
                        <button type="button" onClick={() => unlockRelease(release.id)}>
                          Unlock for revision
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
            <section className="claim-composer">
              <div className="requirements-heading">
                <div>
                  <p className="section-label">CONSULTANT HANDOFF</p>
                  <h2>Prepare independent review</h2>
                </div>
              </div>
              <div className="claim-fields">
                <label>
                  Consultant name
                  <input
                    value={consultantName}
                    onChange={(event) => setConsultantName(event.currentTarget.value)}
                  />
                </label>
                <label>
                  Email (optional)
                  <input
                    type="email"
                    value={consultantEmail}
                    onChange={(event) => setConsultantEmail(event.currentTarget.value)}
                  />
                </label>
                <label>
                  Due date
                  <input
                    type="date"
                    value={handoffDueDate}
                    onChange={(event) => setHandoffDueDate(event.currentTarget.value)}
                  />
                </label>
              </div>
              <label>
                Review scope
                <textarea
                  value={handoffScope}
                  onChange={(event) => setHandoffScope(event.currentTarget.value)}
                />
              </label>
              <button
                type="button"
                className="primary-action"
                disabled={saving || !consultantName.trim() || !handoffScope.trim()}
                onClick={prepareHandoff}
              >
                Prepare handoff
              </button>
              <div className="evidence-cards">
                {selected.handoffs.map((handoff) => (
                  <article key={handoff.id}>
                    <div className="evidence-card-head">
                      <span>{handoff.consultantName}</span>
                      <StatusPill value={handoff.status} />
                    </div>
                    <p>{handoff.scope}</p>
                    <small>
                      {handoff.consultantEmail || "No email recorded"}
                      {handoff.dueDate ? ` · due ${handoff.dueDate}` : ""}
                    </small>
                    {newHandoffLinks[handoff.id] ? (
                      <label>
                        Secure consultant review link
                        <input
                          value={newHandoffLinks[handoff.id]}
                          readOnly
                          onFocus={(event) => event.currentTarget.select()}
                        />
                        <small>
                          Copied when created. This link exposes the scoped review package.
                        </small>
                      </label>
                    ) : null}
                    <div className="evidence-actions">
                      {handoff.status === "prepared" || handoff.status === "in_review" ? (
                        <button
                          type="button"
                          onClick={() => shareConsultantReview(handoff.id)}
                          disabled={saving}
                        >
                          <ShieldCheck /> Create review link
                        </button>
                      ) : null}
                      {handoff.status === "prepared" ? (
                        <button
                          type="button"
                          onClick={() => setHandoffStatus(handoff.id, "in_review")}
                        >
                          Start review
                        </button>
                      ) : null}
                      {handoff.status === "in_review" ? (
                        <button
                          type="button"
                          onClick={() => setHandoffStatus(handoff.id, "completed")}
                        >
                          <Check /> Complete review
                        </button>
                      ) : null}
                      {!(["completed", "cancelled"] as string[]).includes(handoff.status) ? (
                        <button
                          type="button"
                          onClick={() => setHandoffStatus(handoff.id, "cancelled")}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="claim-composer">
              <div className="requirements-heading">
                <div>
                  <p className="section-label">REVIEW ISSUES</p>
                  <h2>Targeted findings & resolution</h2>
                </div>
                <span>
                  {selected.reviewIssues.filter((issue) => issue.status === "open").length} open
                </span>
              </div>
              <div className="claim-fields">
                <label>
                  Applies to
                  <select
                    value={issueTargetType}
                    onChange={(event) => {
                      setIssueTargetType(
                        event.currentTarget.value as ConsultantReviewIssue["targetType"]
                      )
                      setIssueTargetId("")
                    }}
                  >
                    <option value="dossier">Whole dossier</option>
                    <option value="section">Section</option>
                    <option value="fact">Fact Book record</option>
                    <option value="claim">Claim</option>
                    <option value="evidence">Evidence</option>
                  </select>
                </label>
                {issueTargetType !== "dossier" ? (
                  <label>
                    Target
                    <select
                      value={issueTargetId}
                      onChange={(event) => setIssueTargetId(event.currentTarget.value)}
                    >
                      <option value="">Choose target</option>
                      {(issueTargetType === "section"
                        ? selected.sections.map((item) => ({
                            id: item.id,
                            label: `${item.part} — ${item.title}`,
                          }))
                        : issueTargetType === "fact"
                          ? selected.factBookEntries.map((item) => ({
                              id: item.id,
                              label: item.title,
                            }))
                          : issueTargetType === "claim"
                            ? selected.claims.map((item) => ({
                                id: item.id,
                                label: item.statement.slice(0, 90),
                              }))
                            : selected.evidence.map((item) => ({ id: item.id, label: item.title }))
                      ).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label>
                  Priority
                  <select
                    value={issuePriority}
                    onChange={(event) =>
                      setIssuePriority(
                        event.currentTarget.value as ConsultantReviewIssue["priority"]
                      )
                    }
                  >
                    <option value="blocking">Blocking</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                  </select>
                </label>
                <label>
                  Finding
                  <input
                    value={issueTitle}
                    onChange={(event) => setIssueTitle(event.currentTarget.value)}
                    placeholder="Concise review finding"
                  />
                </label>
              </div>
              <label>
                Review note
                <textarea
                  value={issueBody}
                  onChange={(event) => setIssueBody(event.currentTarget.value)}
                  placeholder="Explain the concern, expected correction, and regulatory significance."
                />
              </label>
              <button
                type="button"
                className="primary-action"
                disabled={
                  saving ||
                  !issueTitle.trim() ||
                  !issueBody.trim() ||
                  (issueTargetType !== "dossier" && !issueTargetId)
                }
                onClick={addReviewIssue}
              >
                <Plus /> Add review issue
              </button>
              <div className="evidence-cards">
                {selected.reviewIssues.map((issue) => (
                  <article key={issue.id}>
                    <div className="evidence-card-head">
                      <span>
                        <CircleAlert /> {issue.title}
                      </span>
                      <StatusPill value={issue.status} />
                    </div>
                    <p>{issue.body}</p>
                    <small>
                      {issue.priority} · {issue.targetType} · updated {formatDate(issue.updatedAt)}
                    </small>
                    {issue.resolutionNote ? (
                      <blockquote>“{issue.resolutionNote}”</blockquote>
                    ) : null}
                    {issue.status === "open" ? (
                      <>
                        <label>
                          Resolution note
                          <textarea
                            value={issueResolutionNotes[issue.id] ?? ""}
                            onChange={(event) =>
                              setIssueResolutionNotes((current) => ({
                                ...current,
                                [issue.id]: event.currentTarget.value,
                              }))
                            }
                            placeholder="Describe what changed and why the finding is resolved."
                          />
                        </label>
                        <div className="evidence-actions">
                          <button
                            type="button"
                            onClick={() => setReviewIssueStatus(issue.id, "dismissed")}
                          >
                            Dismiss
                          </button>
                          <button
                            type="button"
                            disabled={!issueResolutionNotes[issue.id]?.trim()}
                            onClick={() => setReviewIssueStatus(issue.id, "resolved")}
                          >
                            <Check /> Resolve
                          </button>
                        </div>
                      </>
                    ) : (
                      <button type="button" onClick={() => setReviewIssueStatus(issue.id, "open")}>
                        Reopen
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}
        {studioTab === "submission" ? (
          <div className="requirements-panel release-center">
            <div className="requirements-heading">
              <div>
                <p className="section-label">SUBMISSION LIFECYCLE</p>
                <h2>From locked package through agency closeout</h2>
              </div>
              <span>{selected.submissions.length} submissions</span>
            </div>
            <p className="requirements-lede">
              Register the exact locked package sent to an agency, track status and identifiers, and
              manage every agency question through a documented response.
            </p>
            {formError ? <p className="form-error">{formError}</p> : null}
            <section className="claim-composer">
              <div className="claim-fields">
                <label>
                  Locked release
                  <select
                    value={submissionReleaseId}
                    onChange={(event) => setSubmissionReleaseId(event.currentTarget.value)}
                  >
                    <option value="">Choose package</option>
                    {selected.releases
                      .filter((item) => item.status === "locked")
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          Package v{item.packageVersion}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Agency
                  <input
                    value={submissionAgency}
                    onChange={(event) => setSubmissionAgency(event.currentTarget.value)}
                  />
                </label>
                <label>
                  Tracking number (if already filed)
                  <input
                    value={submissionTracking}
                    onChange={(event) => setSubmissionTracking(event.currentTarget.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="primary-action"
                disabled={saving || !submissionReleaseId || !submissionAgency.trim()}
                onClick={addSubmission}
              >
                <Plus /> Register submission
              </button>
            </section>
            <div className="evidence-cards">
              {selected.submissions.map((submission) => (
                <article key={submission.id}>
                  <div className="evidence-card-head">
                    <span>
                      {submission.agency} ·{" "}
                      {selected.releases.find((item) => item.id === submission.releaseId)
                        ?.packageVersion
                        ? `Package v${selected.releases.find((item) => item.id === submission.releaseId)?.packageVersion}`
                        : "Locked package"}
                    </span>
                    <StatusPill value={submission.status} />
                  </div>
                  <p>
                    {submission.trackingNumber
                      ? `Tracking ${submission.trackingNumber}`
                      : "Tracking number not recorded"}
                  </p>
                  <small>
                    {submission.submittedAt
                      ? `Submitted ${formatDate(submission.submittedAt)}`
                      : `Created ${formatDate(submission.createdAt)}`}
                  </small>
                  <div className="evidence-actions">
                    {submission.status === "ready" ? (
                      <button
                        type="button"
                        onClick={() => setSubmissionStatus(submission, "submitted")}
                      >
                        Mark submitted
                      </button>
                    ) : null}
                    {submission.status === "submitted" ? (
                      <button
                        type="button"
                        onClick={() => setSubmissionStatus(submission, "under_review")}
                      >
                        Agency review started
                      </button>
                    ) : null}
                    {submission.status === "questions" || submission.status === "under_review" ? (
                      <button
                        type="button"
                        onClick={() => setSubmissionStatus(submission, "closed")}
                      >
                        <Check /> Close lifecycle
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            <section className="claim-composer">
              <div className="requirements-heading">
                <div>
                  <p className="section-label">AGENCY QUESTIONS</p>
                  <h2>Response work queue</h2>
                </div>
              </div>
              <div className="claim-fields">
                <label>
                  Submission
                  <select
                    value={questionSubmissionId}
                    onChange={(event) => setQuestionSubmissionId(event.currentTarget.value)}
                  >
                    <option value="">Choose submission</option>
                    {selected.submissions
                      .filter((item) => !["closed", "withdrawn"].includes(item.status))
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.agency} · {item.trackingNumber || item.id.slice(0, 8)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    value={questionPriority}
                    onChange={(event) =>
                      setQuestionPriority(event.currentTarget.value as AgencyQuestion["priority"])
                    }
                  >
                    <option value="blocking">Blocking</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                  </select>
                </label>
                <label>
                  Due date
                  <input
                    type="date"
                    value={questionDueDate}
                    onChange={(event) => setQuestionDueDate(event.currentTarget.value)}
                  />
                </label>
                <label>
                  Question title
                  <input
                    value={questionTitle}
                    onChange={(event) => setQuestionTitle(event.currentTarget.value)}
                  />
                </label>
              </div>
              <label>
                Agency question
                <textarea
                  value={questionBody}
                  onChange={(event) => setQuestionBody(event.currentTarget.value)}
                />
              </label>
              <button
                type="button"
                className="primary-action"
                disabled={
                  saving || !questionSubmissionId || !questionTitle.trim() || !questionBody.trim()
                }
                onClick={addAgencyQuestion}
              >
                <Plus /> Add question
              </button>
              <div className="evidence-cards">
                {selected.agencyQuestions.map((question) => (
                  <article key={question.id}>
                    <div className="evidence-card-head">
                      <span>
                        <CircleAlert /> {question.title}
                      </span>
                      <StatusPill value={question.status} />
                    </div>
                    <p>{question.body}</p>
                    <small>
                      {question.priority}
                      {question.dueDate ? ` · due ${question.dueDate}` : ""}
                    </small>
                    {question.status !== "closed" ? (
                      <>
                        <label>
                          Response
                          <textarea
                            value={questionResponses[question.id] ?? question.response ?? ""}
                            onChange={(event) =>
                              setQuestionResponses((current) => ({
                                ...current,
                                [question.id]: event.currentTarget.value,
                              }))
                            }
                          />
                        </label>
                        <div className="evidence-actions">
                          <button
                            type="button"
                            onClick={() => answerAgencyQuestion(question, "drafting")}
                          >
                            Save response draft
                          </button>
                          <button
                            type="button"
                            disabled={
                              !(questionResponses[question.id]?.trim() || question.response?.trim())
                            }
                            onClick={() => answerAgencyQuestion(question, "answered")}
                          >
                            <Check /> Mark answered
                          </button>
                          {question.status === "answered" ? (
                            <button
                              type="button"
                              onClick={() => answerAgencyQuestion(question, "closed")}
                            >
                              Close question
                            </button>
                          ) : null}
                        </div>
                      </>
                    ) : question.response ? (
                      <blockquote>“{question.response}”</blockquote>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}
        {studioTab === "activity" ? (
          <div className="requirements-panel">
            <div className="requirements-heading">
              <div>
                <p className="section-label">AUDIT TRAIL</p>
                <h2>Workspace activity</h2>
              </div>
              <span>{selected.auditEvents.length} events</span>
            </div>
            <p className="requirements-lede">
              An append-only record of drafting, review, evidence, claim, and request decisions.
            </p>
            <div className="quality-checks">
              {selected.auditEvents.map((event) => (
                <article key={event.id}>
                  <span>
                    <Clock3 />
                  </span>
                  <div>
                    <small>{formatDate(event.createdAt)}</small>
                    <h3>{event.summary}</h3>
                    <p>{event.action.replaceAll("_", " ")}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
        {studioTab === "draft" && selectedSection ? (
          <div className="drafting-studio">
            <div className="requirements-heading">
              <div>
                <p className="section-label">DRAFTING STUDIO</p>
                <h2>{selectedSection.part}</h2>
              </div>
              <StatusPill value={selectedSection.status} />
            </div>
            <div className="draft-layout">
              <nav>
                {selected.sections.map((section) => (
                  <button
                    type="button"
                    key={section.id}
                    className={section.id === selectedSection.id ? "is-active" : ""}
                    onClick={() => chooseSection(section.id)}
                  >
                    <span>{section.part}</span>
                    <small>{section.status.replaceAll("_", " ")}</small>
                  </button>
                ))}
              </nav>
              <div className="draft-editor">
                <h3>{selectedSection.title}</h3>
                <div className="draft-provenance">
                  <ShieldCheck /> Only verified workspace evidence is listed in generated starters.
                  Every section requires human approval.
                </div>
                <section className="section-claims">
                  <div>
                    <strong>Verified claim ledger</strong>
                    <small>
                      {
                        selected.claims.filter((claim) => claim.sectionId === selectedSection.id)
                          .length
                      }{" "}
                      claims
                    </small>
                  </div>
                  {selected.claims.filter((claim) => claim.sectionId === selectedSection.id)
                    .length > 0 ? (
                    selected.claims
                      .filter((claim) => claim.sectionId === selectedSection.id)
                      .map((claim) => (
                        <article key={claim.id}>
                          {claim.status === "proposed" ? (
                            <textarea
                              aria-label={`Review claim ${claim.id}`}
                              value={claimEdits[claim.id] ?? claim.statement}
                              onChange={(event) =>
                                setClaimEdits((current) => ({
                                  ...current,
                                  [claim.id]: event.currentTarget.value,
                                }))
                              }
                            />
                          ) : (
                            <p>{claim.statement}</p>
                          )}
                          <blockquote>“{claim.sourceExcerpt}”</blockquote>
                          <small>
                            Page {claim.sourcePage} · [[claim:{claim.id}]]
                          </small>
                          {claim.status === "proposed" ? (
                            <div className="evidence-actions">
                              <button
                                type="button"
                                onClick={() => reviewClaim(claim.id, "rejected")}
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                onClick={() => reviewClaim(claim.id, "verified")}
                              >
                                Verify claim
                              </button>
                            </div>
                          ) : (
                            <StatusPill value={claim.status} />
                          )}
                        </article>
                      ))
                  ) : (
                    <p className="claim-empty">No claims are linked to this section yet.</p>
                  )}
                </section>
                <textarea
                  aria-label="Section draft"
                  value={draftContent}
                  onChange={(event) => setDraftContent(event.currentTarget.value)}
                  placeholder="Create a grounded starter or begin drafting here."
                />
                {selected.factBookEntries.some((fact) => fact.status === "verified") ? (
                  <section className="section-claims">
                    <div>
                      <strong>Insert a governed fact</strong>
                      <small>Values stay connected to the Fact Book</small>
                    </div>
                    {selected.factBookEntries
                      .filter((fact) => fact.status === "verified")
                      .flatMap((fact) =>
                        Object.entries(fact.fields).map(([field, value]) => (
                          <button
                            type="button"
                            key={`${fact.id}-${field}`}
                            onClick={() => insertFactReference(fact.id, field)}
                          >
                            <Plus /> {fact.title}: {field.replaceAll("_", " ")} ({value})
                          </button>
                        ))
                      )}
                  </section>
                ) : null}
                {draftContent.includes("{{fact:") ? (
                  <section className="section-claims">
                    <div>
                      <strong>Live document preview</strong>
                      <small>Current verified Fact Book values</small>
                    </div>
                    <article>
                      <p>{renderFactReferences(draftContent, selected.factBookEntries).rendered}</p>
                      {renderFactReferences(draftContent, selected.factBookEntries).unresolved
                        .length ? (
                        <small className="form-error">
                          {
                            renderFactReferences(draftContent, selected.factBookEntries).unresolved
                              .length
                          }{" "}
                          unresolved fact reference
                          {renderFactReferences(draftContent, selected.factBookEntries).unresolved
                            .length === 1
                            ? ""
                            : "s"}
                        </small>
                      ) : null}
                    </article>
                  </section>
                ) : null}
                {assistMeta ? (
                  <p className="assist-meta">
                    Drafted with {assistMeta.provider} · {assistMeta.model} · constrained to{" "}
                    {assistMeta.claimCount} verified claims. Review before saving.
                  </p>
                ) : null}
                <p className={`draft-save-state ${draftDirty ? "has-changes" : ""}`}>
                  {draftDirty
                    ? "Unsaved changes"
                    : `Saved ${formatDate(selectedSection.updatedAt)}`}
                </p>
                {formError ? <p className="form-error">{formError}</p> : null}
                <div className="draft-actions">
                  <button type="button" onClick={assistSection} disabled={saving}>
                    <NotebookPen /> Draft from verified claims
                  </button>
                  <button type="button" onClick={generateStarter} disabled={saving}>
                    <FileText /> Create section starter
                  </button>
                  <button type="button" onClick={() => saveSection("draft")} disabled={saving}>
                    Save draft
                  </button>
                  <button type="button" onClick={() => saveSection("in_review")} disabled={saving}>
                    Send to review
                  </button>
                  <button
                    type="button"
                    className="approve-action"
                    onClick={() => saveSection("approved")}
                    disabled={saving || draftContent.trim().length < 80}
                  >
                    <Check /> Approve
                  </button>
                </div>
                <section className="section-claims">
                  <div>
                    <strong>Version history</strong>
                    <small>{sectionVersions.length} saved versions</small>
                  </div>
                  {sectionVersions.slice(0, 8).map((version) => (
                    <article key={version.id}>
                      <p>
                        Version {version.version} · {version.status.replaceAll("_", " ")}
                      </p>
                      <small>
                        {formatDate(version.createdAt)} ·{" "}
                        {version.content.slice(0, 120) || "Empty draft"}
                      </small>
                      <div className="evidence-actions">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => restoreVersion(version.id)}
                        >
                          Restore as new draft
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              </div>
            </div>
          </div>
        ) : null}
        {studioTab === "quality" ? (
          <div className="quality-gate">
            <div className="requirements-heading">
              <div>
                <p className="section-label">QUALITY GATE</p>
                <h2>Submission controls</h2>
              </div>
              <ShieldCheck />
            </div>
            <p className="requirements-lede">
              These checks assess workspace completeness and traceability. They do not determine
              that the substance is GRAS or predict FDA action.
            </p>
            <div className="quality-summary">
              <strong>
                {qualityChecks.filter((check) => check.severity === "blocker").length}
              </strong>
              <span>blocking controls</span>
              <strong>{qualityChecks.filter((check) => check.severity === "passed").length}</strong>
              <span>controls passed</span>
            </div>
            <div className="quality-checks">
              {qualityChecks.map((check) => (
                <article key={check.id} className={`quality-${check.severity}`}>
                  <span>{check.severity === "passed" ? <Check /> : <CircleAlert />}</span>
                  <div>
                    <small>{check.target}</small>
                    <h3>{check.title}</h3>
                    <p>{check.detail}</p>
                  </div>
                  <div className="quality-action">
                    <StatusPill value={check.severity} />
                    {check.severity !== "passed" ? (
                      <button
                        type="button"
                        onClick={() =>
                          setStudioTab(
                            check.target === "Evidence room"
                              ? "evidence"
                              : check.target === "Fact Book"
                                ? "facts"
                                : check.target === "Release center"
                                  ? "release"
                                  : check.target === "Evidence requests"
                                    ? "requests"
                                    : "draft"
                          )
                        }
                      >
                        Resolve <ArrowRight />
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  )
}

function readRoute(): Route {
  const path = window.location.pathname
  if (path.startsWith("/respond/")) {
    return { name: "respond", token: path.split("/")[2] ?? "" }
  }
  if (path.startsWith("/review/")) {
    return { name: "review", token: path.split("/")[2] ?? "" }
  }
  if (path.startsWith("/analysis")) {
    return { name: "analysis", id: path.split("/")[2] }
  }
  if (path.startsWith("/workspace")) {
    return { name: "workspace" }
  }
  if (path.startsWith("/dossiers")) {
    return { name: "dossiers", id: path.split("/")[2] }
  }
  return { name: "home" }
}

function routePath(route: Route) {
  if (route.name === "respond") return `/respond/${route.token}`
  if (route.name === "review") return `/review/${route.token}`
  if (route.name === "analysis") return `/analysis/${route.id ?? ""}`
  if (route.name === "workspace") return "/workspace"
  if (route.name === "dossiers") return route.id ? `/dossiers/${route.id}` : "/dossiers"
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

function publicCapabilityError(error: unknown, resource: string) {
  const message = errorMessage(error)
  if (/status (404|410)/i.test(message) || /invalid|expired|fulfilled|revoked/i.test(message)) {
    return `This ${resource} link is invalid, expired, or has already been used. Ask the Greenlit workspace owner for a new link.`
  }
  return message
}
