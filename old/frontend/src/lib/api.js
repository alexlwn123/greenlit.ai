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

export async function fetchResearch(substance, method = '', organism = '') {
  const params = new URLSearchParams({ substance, method, organism })
  const res = await fetch(`${BASE_URL}/research?${params}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function downloadOutline(jobId) {
  const res = await fetch(`${BASE_URL}/outline/${jobId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.blob()
}

export async function fetchSidecar(grnNumber) {
  const res = await fetch(`${BASE_URL}/sidecar/${grnNumber}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
