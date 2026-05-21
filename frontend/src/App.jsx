import { Routes, Route, Navigate } from 'react-router-dom'
import Submit from './pages/Submit'
import Evaluation from './pages/Evaluation'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Submit />} />
      <Route path="/evaluation" element={<Evaluation />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
