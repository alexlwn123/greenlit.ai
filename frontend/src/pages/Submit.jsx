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
  const { setResult, setJobId, jobId } = useAnalysis()

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
      <div className="min-h-screen bg-forest-950 flex flex-col">
        <NavBar />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-2 border-forest-400 flex items-center justify-center">
              <Dna className="w-10 h-10 text-sprout-500" />
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-t-sprout-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-text-base text-lg font-medium mb-2">Analyzing your filing</p>
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
    <div className="min-h-screen bg-forest-950 flex flex-col">
      <NavBar />

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl">

          {/* Hero */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Leaf className="w-5 h-5 text-sprout-500 opacity-60" />
              <Microscope className="w-5 h-5 text-sprout-500 opacity-80" />
              <FlaskConical className="w-5 h-5 text-sprout-500 opacity-60" />
            </div>
            <h1 className="text-4xl font-semibold text-text-base tracking-tight mb-3">
              Analyze Your GRAS Filing
            </h1>
            <p className="text-text-muted text-base leading-relaxed max-w-md mx-auto">
              Upload your draft GRAS notice and receive an AI-powered gap analysis with scoring, comparables, and actionable recommendations.
            </p>
          </div>

          {/* Upload zone */}
          <div
            className="relative rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 mb-6"
            style={{
              borderColor: isDragging ? '#22c55e' : file ? '#16a34a' : '#1b3b1f',
              background: isDragging ? 'rgba(34,197,94,0.05)' : file ? 'rgba(22,163,74,0.04)' : 'rgba(11,26,13,0.6)',
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
              <div className="flex items-center justify-between p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-sprout-700 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-sprout-400" />
                  </div>
                  <div>
                    <p className="text-text-base font-medium text-sm">{file.name}</p>
                    <p className="text-text-muted text-xs mt-0.5">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setFile(null) }}
                  className="w-7 h-7 rounded-full hover:bg-forest-500 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-text-muted" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                <div className="w-14 h-14 rounded-full border border-forest-400 flex items-center justify-center mb-4">
                  <UploadCloud className="w-7 h-7 text-text-dim" />
                </div>
                <p className="text-text-base font-medium mb-1">Drop your GRAS notice here</p>
                <p className="text-text-muted text-sm mb-3">or click to browse</p>
                <span className="text-xs text-text-dim bg-forest-600 px-3 py-1 rounded-full">PDF only</span>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 bg-red-950/40 border border-red-800/50 rounded-lg p-4 mb-6">
              <AlertCircle className="w-4 h-4 text-critical mt-0.5 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
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
                  className="px-3 py-1.5 rounded-full text-sm transition-all duration-150 border"
                  style={{
                    background: focusAreas.includes(area) ? 'rgba(34,197,94,0.12)' : 'transparent',
                    borderColor: focusAreas.includes(area) ? '#22c55e' : '#1b3b1f',
                    color: focusAreas.includes(area) ? '#22c55e' : '#7fa884',
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
              background: file ? '#22c55e' : '#1b3b1f',
              color: file ? '#060e07' : '#3d5e42',
              cursor: file ? 'pointer' : 'not-allowed',
            }}
          >
            Analyze Filing
          </button>

        </div>
      </main>
    </div>
  )
}
