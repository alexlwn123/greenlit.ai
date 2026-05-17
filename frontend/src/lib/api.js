import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function submitAnalysis(file) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await axios.post(`${BASE_URL}/analyze`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function getStatus(jobId) {
  const { data } = await axios.get(`${BASE_URL}/status/${jobId}`)
  return data
}
