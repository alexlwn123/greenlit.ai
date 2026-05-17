import { createContext, useContext, useState } from 'react'

const AnalysisContext = createContext(null)

export function AnalysisProvider({ children }) {
  const [result, setResult] = useState(null)
  const [jobId, setJobId] = useState(null)

  function reset() {
    setResult(null)
    setJobId(null)
  }

  return (
    <AnalysisContext.Provider value={{ result, setResult, jobId, setJobId, reset }}>
      {children}
    </AnalysisContext.Provider>
  )
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext)
  if (!ctx) throw new Error('useAnalysis must be used within AnalysisProvider')
  return ctx
}
