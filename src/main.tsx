import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@/frontend/css/index.css'
import App from './App.tsx'
import { AuthProvider } from '@/frontend/contexts/AuthContext.tsx'
import { ThemeProvider } from '@/frontend/contexts/ThemeContext.tsx'
import EmailVerifyBanner from '@/frontend/components/EmailVerifyBanner.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <App />
          <EmailVerifyBanner />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
