import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import { useAuthStore } from './store/auth'
import { initTheme } from './store/theme'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoadingState } from './components/LoadingState'
import { ToastContainer } from './components/Toast'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const SignupPage = lazy(() => import('./pages/SignupPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const KBAIPage = lazy(() => import('./pages/KBAIPage'))

function Protected({ children }: { children: React.ReactNode }) {
  const { user, token, initialized } = useAuthStore()
  if (!initialized) return <div className="h-screen flex items-center justify-center"><LoadingState text="Initializing..." /></div>
  if (!user || !token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, token, initialized } = useAuthStore()
  if (!initialized) return <div className="h-screen flex items-center justify-center"><LoadingState /></div>
  if (user && token) return <Navigate to="/chat" replace />
  return <>{children}</>
}

export default function App() {
  const init = useAuthStore(s=> s.init)
  useEffect(()=>{ init(); initTheme() }, [])

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<div className="h-screen flex items-center justify-center"><LoadingState text="Loading..." /></div>}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
            <Route path="/signup" element={<PublicOnly><SignupPage /></PublicOnly>} />
            <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
            <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
            <Route path="/chat" element={<Protected><ChatPage /></Protected>} />
            <Route path="/ai" element={<Protected><KBAIPage /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <ToastContainer />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
