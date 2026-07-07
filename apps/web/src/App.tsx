import type { AnalysisRecord, ReadinessReport, WorkbookNote } from "@greenlit/core"
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Download,
  History,
  ListChecks,
  Loader2,
  NotebookPen,
  RefreshCw,
  Save,
  Upload,
} from "lucide-react"
import { type ChangeEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import {
  createAnalysis,
  createNote,
  downloadAnalysisFile,
  listAnalyses,
  listNotes,
  waitForAnalysis,
} from "./api"

const workflowItems = [
  { label: "Submit filing", icon: Upload, targetId: "submit-filing" },
  { label: "Analysis progress", icon: Loader2, targetId: "submit-filing" },
  { label: "Report overview", icon: ListChecks, targetId: "readiness-report" },
  { label: "Findings detail", icon: ListChecks, targetId: "readiness-report" },
  { label: "Workbook", icon: NotebookPen, targetId: "workbook-notes" },
  { label: "History", icon: History, targetId: "analysis-history" },
]

type LoadState = "idle" | "loading" | "uploading" | "polling"

export default function App() {
  const [history, setHistory] = useState<AnalysisRecord[]>([])
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisRecord | null>(null)
  const [loadState, setLoadState] = useState<LoadState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<WorkbookNote[]>([])
  const [noteDraft, setNoteDraft] = useState("")

  const activeReport = activeAnalysis?.report
  const statusLabel = statusText(activeAnalysis)
  const latestCompleted = useMemo(
    () => history.find((analysis) => analysis.status === "complete"),
    [history]
  )

  const refreshHistory = useCallback(async () => {
    setError(null)
    setLoadState((current) => (current === "idle" ? "loading" : current))

    try {
      const analyses = await listAnalyses()
      setHistory(analyses)
      setActiveAnalysis((current) => {
        if (current) {
          return analyses.find((analysis) => analysis.id === current.id) ?? current
        }

        return analyses[0] ?? null
      })
    } catch (refreshError) {
      setError(errorMessage(refreshError))
    } finally {
      setLoadState((current) => (current === "loading" ? "idle" : current))
    }
  }, [])

  useEffect(() => {
    void refreshHistory()
  }, [refreshHistory])

  useEffect(() => {
    if (!activeAnalysis?.id || activeAnalysis.status !== "complete") {
      setNotes([])
      return
    }

    let isCurrent = true

    listNotes(activeAnalysis.id)
      .then((nextNotes) => {
        if (isCurrent) {
          setNotes(nextNotes)
        }
      })
      .catch((notesError) => {
        if (isCurrent) {
          setError(errorMessage(notesError))
        }
      })

    return () => {
      isCurrent = false
    }
  }, [activeAnalysis?.id, activeAnalysis?.status])

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ""

    if (!file) {
      return
    }

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
    } catch (uploadError) {
      setError(errorMessage(uploadError))
    } finally {
      setLoadState("idle")
    }
  }

  function openAnalysis(analysis: AnalysisRecord) {
    setActiveAnalysis(analysis)
    setError(null)
  }

  async function saveNote() {
    if (!activeAnalysis?.id || !noteDraft.trim()) {
      return
    }

    setError(null)

    try {
      const note = await createNote(activeAnalysis.id, noteDraft)
      setNotes((current) => [note, ...current])
      setNoteDraft("")
    } catch (noteError) {
      setError(errorMessage(noteError))
    }
  }

  async function download(kind: "outline" | "export") {
    if (!activeAnalysis?.id) {
      return
    }

    setError(null)

    try {
      await downloadAnalysisFile(activeAnalysis.id, kind)
    } catch (downloadError) {
      setError(errorMessage(downloadError))
    }
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">greenlit.ai</p>
          <h1>GRAS readiness review</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-button" onClick={refreshHistory}>
            <RefreshCw aria-hidden="true" />
            Reload
          </button>
        </div>
      </header>

      <section className="workspace-grid" aria-label="MVP workflow">
        <div className="submit-panel" id="submit-filing">
          <div className="panel-copy">
            <p className="eyebrow">Live upload flow</p>
            <h2>Upload a draft filing</h2>
            <p>
              The hosted backend saves the PDF, extracts text, creates an analysis record, and
              returns a minimum readiness score.
            </p>
            {activeAnalysis ? (
              <div className={`status-callout status-${activeAnalysis.status}`}>
                {statusIcon(activeAnalysis.status)}
                <span>{statusLabel}</span>
              </div>
            ) : (
              <div className="status-callout">
                <CircleDashed aria-hidden="true" />
                <span>Ready for upload</span>
              </div>
            )}
            {error ? (
              <div className="error-callout" role="alert">
                <AlertCircle aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}
          </div>

          <label className="upload-dropzone">
            {loadState === "uploading" || loadState === "polling" ? (
              <Loader2 className="spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            <span>{loadState === "uploading" ? "Saving PDF" : "Choose PDF"}</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleUpload}
              disabled={loadState === "uploading" || loadState === "polling"}
              aria-label="Choose PDF"
            />
          </label>
        </div>

        <ReportPanel
          report={activeReport}
          fallbackAnalysis={activeAnalysis}
          latestCompleted={latestCompleted}
          onOpenAnalysis={openAnalysis}
          onDownload={download}
          canDownload={Boolean(activeAnalysis?.report)}
        />
      </section>

      <section className="history-panel" id="analysis-history" aria-label="Saved analyses">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Saved analyses</p>
            <h2>Analysis history</h2>
          </div>
          <span>{history.length} saved</span>
        </div>
        {history.length > 0 ? (
          <div className="history-list">
            {history.map((analysis) => (
              <button
                type="button"
                key={analysis.id}
                className={`history-item ${activeAnalysis?.id === analysis.id ? "is-active" : ""}`}
                onClick={() => openAnalysis(analysis)}
              >
                <span>
                  <strong>{analysis.filingName}</strong>
                  <small>{new Date(analysis.createdAt).toLocaleString()}</small>
                </span>
                <span className={`status-chip status-${analysis.status}`}>{analysis.status}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-state">
            No saved analyses yet. Upload a PDF to create the first one.
          </p>
        )}
      </section>

      <WorkbookPanel
        activeAnalysis={activeAnalysis}
        notes={notes}
        noteDraft={noteDraft}
        onNoteDraftChange={setNoteDraft}
        onSaveNote={saveNote}
      />

      <nav className="workflow-strip" aria-label="Core workflow steps">
        {workflowItems.map((item) => {
          const Icon = item.icon

          return (
            <a key={item.label} className="workflow-item" href={`#${item.targetId}`}>
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          )
        })}
      </nav>
    </main>
  )
}

function ReportPanel({
  report,
  fallbackAnalysis,
  latestCompleted,
  onOpenAnalysis,
  onDownload,
  canDownload,
}: {
  report: ReadinessReport | undefined
  fallbackAnalysis: AnalysisRecord | null
  latestCompleted: AnalysisRecord | undefined
  onOpenAnalysis: (analysis: AnalysisRecord) => void
  onDownload: (kind: "outline" | "export") => void
  canDownload: boolean
}) {
  if (!report) {
    return (
      <aside className="summary-panel" id="readiness-report" aria-label="Analysis status">
        <p className="eyebrow">Waiting</p>
        <h2>{fallbackAnalysis?.filingName ?? "No report selected"}</h2>
        <p>
          {fallbackAnalysis?.status === "failed"
            ? fallbackAnalysis.error
            : "Upload a PDF or open a saved completed analysis to view the minimum score."}
        </p>
        {latestCompleted ? (
          <button
            type="button"
            className="inline-action"
            onClick={() => onOpenAnalysis(latestCompleted)}
          >
            Open latest completed report
          </button>
        ) : null}
      </aside>
    )
  }

  return (
    <aside className="summary-panel" id="readiness-report" aria-label="Readiness summary">
      <p className="eyebrow">Minimum score</p>
      <div className="score-row">
        <span>{report.readinessScore}</span>
        <span>Readiness score</span>
      </div>
      <h2>{report.filingName}</h2>
      <p>{report.summary}</p>
      {canDownload ? (
        <div className="download-actions">
          <button type="button" className="inline-action" onClick={() => onDownload("outline")}>
            <Download aria-hidden="true" />
            Outline
          </button>
          <button type="button" className="inline-action" onClick={() => onDownload("export")}>
            <Download aria-hidden="true" />
            Report
          </button>
        </div>
      ) : null}

      <div className="signal-grid">
        {report.signals.map((signal) => (
          <div key={signal.id} className="signal-item">
            <span>
              {signal.score}/{signal.maxScore}
            </span>
            <strong>{signal.label}</strong>
            <small>{signal.summary}</small>
          </div>
        ))}
      </div>

      <div className="module-stack">
        <ModuleSection title="Identified Gaps">
          <ul className="finding-list">
            {report.findings.map((finding) => (
              <li key={finding.id}>
                <span>{finding.severity}</span>
                <strong>{finding.title}</strong>
                <small>{finding.summary}</small>
                <details>
                  <summary>Rationale and evidence</summary>
                  <p>{finding.recommendedAction}</p>
                  {finding.evidence.length > 0 ? (
                    <ul>
                      {finding.evidence.map((evidence) => (
                        <li key={evidence}>{evidence}</li>
                      ))}
                    </ul>
                  ) : null}
                </details>
              </li>
            ))}
          </ul>
        </ModuleSection>

        <ModuleSection title="Recommended Next Steps">
          <div className="module-list">
            {report.findings.map((finding) => (
              <div key={`next-${finding.id}`} className="module-row">
                <span className={`status-chip severity-${finding.severity}`}>
                  {finding.severity}
                </span>
                <strong>{finding.title}</strong>
                <small>{finding.recommendedAction}</small>
              </div>
            ))}
          </div>
        </ModuleSection>

        <ModuleSection title="Documentation Benchmark">
          <div className="module-list">
            {report.modules.documentationBenchmark.map((item) => (
              <div key={item.id} className="module-row">
                <span className={`status-chip status-${item.status}`}>{item.status}</span>
                <strong>{item.label}</strong>
                <small>{item.summary}</small>
              </div>
            ))}
          </div>
        </ModuleSection>

        <ModuleSection title="Safety Signals">
          <div className="module-list">
            {report.modules.safetySignals.map((signal) => (
              <div key={signal.id} className="module-row">
                <span className={`status-chip signal-${signal.level}`}>{signal.level}</span>
                <strong>{signal.label}</strong>
                <small>{signal.summary}</small>
              </div>
            ))}
          </div>
        </ModuleSection>

        <ModuleSection title="Comparable Filings">
          <div className="module-list">
            {report.modules.comparableFilings.map((filing) => (
              <div key={filing.id} className="module-row">
                <span className="status-chip">{filing.status}</span>
                <strong>{filing.name}</strong>
                <small>{filing.rationale}</small>
              </div>
            ))}
          </div>
        </ModuleSection>

        <ModuleSection title="Filing Diff">
          <div className="module-list">
            {report.modules.filingDiff.slice(0, 5).map((item) => (
              <div key={item.id} className="module-row">
                <span className={`status-chip status-${item.status}`}>{item.status}</span>
                <strong>{item.label}</strong>
                <small>{item.recommendedAction}</small>
              </div>
            ))}
          </div>
        </ModuleSection>

        <ModuleSection title="Research References">
          <div className="module-list">
            {report.modules.researchReferences.map((reference) => (
              <div key={reference.id} className="module-row">
                <span className="status-chip">{reference.year ?? "source"}</span>
                <strong>{reference.title}</strong>
                <small>{reference.relevance}</small>
              </div>
            ))}
          </div>
        </ModuleSection>

        <ModuleSection title="Amendment Outline">
          <div className="module-list">
            {report.modules.amendmentOutline.map((section) => (
              <div key={section.id} className="module-row module-row-full">
                <strong>{section.title}</strong>
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ModuleSection>
      </div>
    </aside>
  )
}

function ModuleSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="module-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function WorkbookPanel({
  activeAnalysis,
  notes,
  noteDraft,
  onNoteDraftChange,
  onSaveNote,
}: {
  activeAnalysis: AnalysisRecord | null
  notes: WorkbookNote[]
  noteDraft: string
  onNoteDraftChange: (value: string) => void
  onSaveNote: () => void
}) {
  return (
    <section className="workbook-panel" id="workbook-notes" aria-label="Workbook notes">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Workbook</p>
          <h2>Follow-up notes</h2>
        </div>
        <span>{notes.length} notes</span>
      </div>

      {activeAnalysis?.status === "complete" ? (
        <div className="note-composer">
          <textarea
            value={noteDraft}
            onChange={(event) => onNoteDraftChange(event.currentTarget.value)}
            placeholder="Add a follow-up note"
            rows={3}
          />
          <button type="button" className="secondary-button" onClick={onSaveNote}>
            <Save aria-hidden="true" />
            Save note
          </button>
        </div>
      ) : (
        <p className="empty-state">Open a completed saved analysis to add workbook notes.</p>
      )}

      {notes.length > 0 ? (
        <div className="note-list">
          {notes.map((note) => (
            <div key={note.id} className="note-item">
              <span className={`status-chip status-${note.status}`}>{note.status}</span>
              <p>{note.body}</p>
              <small>{new Date(note.createdAt).toLocaleString()}</small>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function statusText(analysis: AnalysisRecord | null) {
  if (!analysis) {
    return "Ready for upload"
  }

  if (analysis.status === "queued") {
    return "Upload saved. Analysis is queued."
  }

  if (analysis.status === "running") {
    return "Extracting text and generating the minimum score."
  }

  if (analysis.status === "complete") {
    return "Minimum score saved and ready to reload."
  }

  return analysis.error ?? "Analysis failed."
}

function statusIcon(status: AnalysisRecord["status"]) {
  if (status === "complete") {
    return <CheckCircle2 aria-hidden="true" />
  }

  if (status === "failed") {
    return <AlertCircle aria-hidden="true" />
  }

  return <Loader2 className="spin" aria-hidden="true" />
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong."
}
