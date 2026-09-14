import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { useAuthStore } from './store/auth'
import { initTheme } from './store/theme'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoadingState } from './components/LoadingState'
import { ToastContainer } from './components/Toast'
import { BootSplash } from './components/BootSplash'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const SignupPage = lazy(() => import('./pages/SignupPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const JoinPage = lazy(() => import('./pages/JoinPage'))
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
  if (user && token) {
    // A group invite link opened while logged out resumes here after login.
    try {
      const pending = localStorage.getItem('kb_pending_invite')
      if (pending) {
        localStorage.removeItem('kb_pending_invite')
        return <Navigate to={`/join/${pending}`} replace />
      }
    } catch {}
    return <Navigate to="/chat" replace />
  }
  return <>{children}</>
}

export default function App() {
  const init = useAuthStore(s=> s.init)
  const [boot, setBoot] = useState(true)
  const endBoot = useCallback(() => setBoot(false), [])
  useEffect(()=>{ init(); initTheme() }, [])

  return (
    <ErrorBoundary>
      {boot && <BootSplash onDone={endBoot} />}
      <BrowserRouter>
        <Suspense fallback={<div className="h-screen flex items-center justify-center"><LoadingState text="Loading..." /></div>}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
            <Route path="/signup" element={<PublicOnly><SignupPage /></PublicOnly>} />
            <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
            <Route path="/join/:token" element={<JoinPage />} />
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
