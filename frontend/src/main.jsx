import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AnalysisProvider } from './context/AnalysisContext'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <AnalysisProvider>
        <App />
      </AnalysisProvider>
    </HashRouter>
  </StrictMode>
)
