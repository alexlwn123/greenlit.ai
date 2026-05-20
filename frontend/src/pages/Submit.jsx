import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud, FileText, X, Dna, Loader2, AlertCircle } from 'lucide-react'
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

const PROGRESS_MESSAGES = {
  extracting:   'Extracting document text...',
  analyzing:    'Running deep analysis with Claude AI...',
  retrieving:   'Finding similar GRAS notices...',
  benchmarking: 'Computing benchmark comparison...',
  finalizing:   'Building gap report...',
}

const ERROR_MESSAGES = {
  no_text:          'No text could be extracted. The PDF may be a scanned image — try running OCR first.',
  invalid_document: 'This file does not appear to be an FDA GRAS notice. Please upload a notice draft in standard Parts 1–7 format.',
  api_error:        'The analysis service is temporarily unavailable. Please try again in a few minutes.',
  internal_error:   'An unexpected error occurred. Please try again.',
}

export default function Submit() {
  const navigate = useNavigate()
  const { setResult, setJobId } = useAnalysis()

  const [file, setFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [focusAreas, setFocusAreas] = useState([])
  const [loading, setLoading] = useState(false)
  const [jobStatus, setJobStatus] = useState(null)
  const [progressStep, setProgressStep] = useState(null)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)
  const pollingRef = useRef(null)

  const startPolling = useCallback((id) => {
    pollingRef.current = setInterval(async () => {
      try {
        const data = await getStatus(id)
        setJobStatus(data.status)
        if (data.progress_step) setProgressStep(data.progress_step)
        if (data.status === 'complete') {
          clearInterval(pollingRef.current)
          setResult(data.result)
          navigate('/evaluation')
        } else if (data.status === 'failed') {
          clearInterval(pollingRef.current)
          setLoading(false)
          setError(ERROR_MESSAGES[data.error_code] || data.error || 'Analysis failed. Please try again.')
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
            <p className="text-text-muted text-sm">
              {PROGRESS_MESSAGES[progressStep] || (jobStatus === 'pending' ? 'Queued...' : 'Processing...')}
            </p>
          </div>
          <div className="flex items-center gap-2 text-text-dim text-xs">
            <Loader2 className="w-3 h-3 animate-spin" />
            This may take 3–5 minutes
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
            <h1 className="text-4xl font-bold text-text-base tracking-tight mb-3" style={{ letterSpacing: '-0.03em' }}>
              GRAS gap analysis
            </h1>
            <p className="text-text-muted text-base leading-relaxed max-w-md mx-auto">
              Upload your draft GRAS notice for an AI-powered gap analysis — scored, benchmarked, and ready to act on.
            </p>
          </div>

          {/* Upload zone */}
          <div
            className="relative rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 mb-5"
            style={{
              borderColor: isDragging ? '#00ff88' : file ? '#00ff88' : '#222222',
              background:  isDragging ? 'rgba(0,255,136,0.05)' : file ? 'rgba(0,255,136,0.03)' : '#0d0d0d',
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


          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!file}
            className="w-full py-3.5 rounded-xl font-semibold text-base transition-all duration-200"
            style={{
              background: file ? '#00ff88' : '#181818',
              color:      file ? '#000000' : '#383838',
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
