import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AnalysisProvider } from './context/AnalysisContext'
import { AuthProvider } from './context/AuthContext'
import { NotesProvider } from './context/NotesContext'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <AnalysisProvider>
          <NotesProvider>
            <App />
          </NotesProvider>
        </AnalysisProvider>
      </AuthProvider>
    </HashRouter>
  </StrictMode>
)
