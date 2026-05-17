import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud, FileText, X, Dna, Microscope, FlaskConical, Leaf, Loader2, AlertCircle } from 'lucide-react'
import NavBar from '../components/NavBar'
import { useAnalysis } from '../context/AnalysisContext'
import { submitAnalysis, getStatus } from '../lib/api'

const FOCUS_OPTIONS = [
  'Safety Study Completeness',
  'Intended Use & Exposure Estimates',
  'Substance Identity & Characterization',
  'Regulatory History',
  'Literature Review Coverage',
  'Expert Panel Qualifications',
]

const STATUS_MESSAGES = {
  pending: 'Extracting filing metadata...',
  running: 'Identifying comparable notices and running gap analysis...',
}

export default function Submit() {
  const navigate = useNavigate()
  const { setResult, setJobId } = useAnalysis()

  const [file, setFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [focusAreas, setFocusAreas] = useState([])
  const [loading, setLoading] = useState(false)
  const [jobStatus, setJobStatus] = useState(null)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)
  const pollingRef = useRef(null)

  const startPolling = useCallback((id) => {
    pollingRef.current = setInterval(async () => {
      try {
        const data = await getStatus(id)
        setJobStatus(data.status)
        if (data.status === 'complete') {
          clearInterval(pollingRef.current)
          setResult(data.result)
          navigate('/attributes')
        } else if (data.status === 'failed') {
          clearInterval(pollingRef.current)
          setLoading(false)
          setError(data.error || 'Analysis failed. Please try again.')
        }
      } catch {
        clearInterval(pollingRef.current)
        setLoading(false)
        setError('Could not reach the server. Make sure the backend is running.')
      }
    }, 2000)
  }, [navigate, setResult])

  useEffect(() => () => clearInterval(pollingRef.current), [])

  async function handleSubmit() {
    if (!file) return
    setError(null)
    setLoading(true)
    setJobStatus('pending')
    try {
      const { job_id } = await submitAnalysis(file)
      setJobId(job_id)
      startPolling(job_id)
    } catch {
      setLoading(false)
      setError('Failed to submit the filing. Make sure the backend is running at localhost:8000.')
    }
  }

  function handleFile(f) {
    if (f && f.type === 'application/pdf') {
      setFile(f)
      setError(null)
    } else if (f) {
      setError('Only PDF files are accepted.')
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  function toggleFocus(area) {
    setFocusAreas(prev =>
      prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <NavBar />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-2 border-border flex items-center justify-center bg-surface">
              <Dna className="w-10 h-10 text-accent" />
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-t-accent border-r-transparent border-b-transparent border-l-transparent animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-text-base text-lg font-semibold mb-2">Analyzing your filing</p>
            <p className="text-text-muted text-sm">{STATUS_MESSAGES[jobStatus] || 'Processing...'}</p>
          </div>
          <div className="flex items-center gap-2 text-text-dim text-xs">
            <Loader2 className="w-3 h-3 animate-spin" />
            This may take 30–60 seconds
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <NavBar />

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl">

          {/* Hero */}
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-3 mb-5">
              <Leaf className="w-5 h-5 text-accent opacity-50" />
              <Microscope className="w-5 h-5 text-accent opacity-75" />
              <FlaskConical className="w-5 h-5 text-accent opacity-50" />
            </div>
            <h1 className="text-4xl font-bold text-text-base tracking-tight mb-3">
              Analyze Your GRAS Filing
            </h1>
            <p className="text-text-muted text-base leading-relaxed max-w-md mx-auto">
              Upload your draft GRAS notice and receive an AI-powered gap analysis with scoring, comparables, and actionable recommendations.
            </p>
          </div>

          {/* Upload zone */}
          <div
            className="relative rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 mb-5"
            style={{
              borderColor: isDragging ? '#16a34a' : file ? '#16a34a' : '#ccddd3',
              background:  isDragging ? '#f0fdf4' : file ? '#f0fdf4' : '#ffffff',
            }}
            onClick={() => !file && fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={e => handleFile(e.target.files[0])}
            />

            {file ? (
              <div className="flex items-center justify-between p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-pale flex items-center justify-center">
                    <FileText className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-text-base font-medium text-sm">{file.name}</p>
                    <p className="text-text-dim text-xs mt-0.5">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setFile(null) }}
                  className="w-7 h-7 rounded-full hover:bg-surface-2 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-text-dim" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                <div className="w-14 h-14 rounded-full border border-border bg-surface-2 flex items-center justify-center mb-4">
                  <UploadCloud className="w-7 h-7 text-text-dim" />
                </div>
                <p className="text-text-base font-semibold mb-1">Drop your GRAS notice here</p>
                <p className="text-text-muted text-sm mb-3">or click to browse</p>
                <span className="text-xs text-text-dim bg-surface-2 border border-border px-3 py-1 rounded-full">PDF only</span>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
              <AlertCircle className="w-4 h-4 text-critical mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Focus areas */}
          <div className="mb-8">
            <p className="text-text-muted text-sm font-medium mb-3">
              What areas should we focus on?{' '}
              <span className="text-text-dim font-normal">(optional)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {FOCUS_OPTIONS.map(area => (
                <button
                  key={area}
                  onClick={() => toggleFocus(area)}
                  className="px-3 py-1.5 rounded-full text-sm transition-all duration-150 border font-medium"
                  style={{
                    background:  focusAreas.includes(area) ? '#dcfce7' : '#ffffff',
                    borderColor: focusAreas.includes(area) ? '#16a34a' : '#ccddd3',
                    color:       focusAreas.includes(area) ? '#15803d' : '#456050',
                  }}
                >
                  {area}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!file}
            className="w-full py-3.5 rounded-xl font-semibold text-base transition-all duration-200"
            style={{
              background: file ? '#16a34a' : '#e2ede6',
              color:      file ? '#ffffff' : '#9cbfab',
              cursor:     file ? 'pointer' : 'not-allowed',
            }}
          >
            Analyze Filing
          </button>

        </div>
      </main>
    </div>
  )
}
