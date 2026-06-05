import { demoReport } from "@greenlit/core"
import { ClipboardCheck, FileText, History, NotebookPen, Upload } from "lucide-react"

const workflowItems = [
  { label: "Submit filing", icon: Upload },
  { label: "Review findings", icon: ClipboardCheck },
  { label: "Track notes", icon: NotebookPen },
  { label: "Reload history", icon: History },
]

export default function App() {
  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">greenlit.ai</p>
          <h1>GRAS readiness review</h1>
        </div>
        <button type="button" className="secondary-button">
          <FileText aria-hidden="true" />
          Open demo
        </button>
      </header>

      <section className="workspace-grid" aria-label="MVP workflow">
        <div className="submit-panel">
          <div>
            <h2>Submit a draft filing</h2>
            <p>
              Upload a GRAS notice PDF or open the demo report while the backend analysis path comes
              online.
            </p>
          </div>
          <label className="upload-dropzone">
            <Upload aria-hidden="true" />
            <span>Choose PDF</span>
            <input type="file" accept="application/pdf" />
          </label>
        </div>

        <aside className="summary-panel" aria-label="Demo readiness summary">
          <p className="eyebrow">Demo report</p>
          <div className="score-row">
            <span>{demoReport.readinessScore}</span>
            <span>Readiness score</span>
          </div>
          <ul>
            {demoReport.findings.map((finding) => (
              <li key={finding.id}>
                <strong>{finding.title}</strong>
                <span>{finding.severity}</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <nav className="workflow-strip" aria-label="Core workflow steps">
        {workflowItems.map((item) => {
          const Icon = item.icon

          return (
            <div key={item.label} className="workflow-item">
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </div>
          )
        })}
      </nav>
    </main>
  )
}
