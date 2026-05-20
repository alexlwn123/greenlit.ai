const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function submitAnalysis(file) {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${BASE_URL}/analyze`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getStatus(jobId) {
  const res = await fetch(`${BASE_URL}/status/${jobId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
