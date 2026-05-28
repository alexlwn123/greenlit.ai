import { createContext, useContext, useState } from 'react'

const AnalysisContext = createContext(null)

export function AnalysisProvider({ children }) {
  const [result, setResultRaw] = useState(null)
  const [jobId, setJobId] = useState(null)
  const [filingId, setFilingId] = useState(null)

  function setResult(r) {
    setResultRaw(r)
    if (r) setFilingId(prev => prev ?? crypto.randomUUID())
  }

  function loadSaved(analysis) {
    setResultRaw(analysis.result_json)
    setFilingId(analysis.filing_id ?? crypto.randomUUID())
    setJobId(null)
  }

  function reset() {
    setResultRaw(null)
    setJobId(null)
    setFilingId(null)
  }

  return (
    <AnalysisContext.Provider value={{ result, setResult, jobId, setJobId, filingId, loadSaved, reset }}>
      {children}
    </AnalysisContext.Provider>
  )
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext)
  if (!ctx) throw new Error('useAnalysis must be used within AnalysisProvider')
  return ctx
}
