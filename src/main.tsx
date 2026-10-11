import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@/frontend/css/index.css'
import App from './App.tsx'
import { AuthProvider } from '@/frontend/contexts/AuthContext.tsx'
import { ThemeProvider } from '@/frontend/contexts/ThemeContext.tsx'
import EmailVerifyBanner from '@/frontend/components/EmailVerifyBanner.tsx'
import { I18nProvider } from '@/frontend/i18n/I18nProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <I18nProvider>
            <App />
            <EmailVerifyBanner />
          </I18nProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
