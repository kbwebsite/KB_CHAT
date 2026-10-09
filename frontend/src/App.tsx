import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { useAuthStore } from './store/auth'
import { initTheme } from './store/theme'
import { useLockStore } from './store/lock'
import { LockScreen } from './components/LockScreen'
import { useToastStore } from './store/toast'
import { popDueReminders } from './utils/reminders'
import { isNativeApp } from './services/api'
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
const UserPage = lazy(() => import('./pages/UserPage'))
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
  // Preset engine first so the settings accent (init) wins deterministically on boot.
  useEffect(()=>{ initTheme(); init() }, [])
  const lockEnabled = useLockStore(s => s.enabled)
  const unlocked = useLockStore(s => s.unlocked)

  // Auto-lock: tab hidden for 60s+ relocks (only when a lock is set up).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const onVis = () => {
      const st = useLockStore.getState()
      if (document.hidden) {
        if (st.enabled && st.unlocked) t = setTimeout(() => useLockStore.getState().lock(), 60000)
      } else if (t) {
        clearTimeout(t)
        t = null
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      if (t) clearTimeout(t)
    }
  }, [])

  // Reminder ticker: fires due message reminders as a popup + toast,
  // then clears them. Runs app-wide so it works from any screen.
  useEffect(() => {
    const tick = () => {
      let fired: ReturnType<typeof popDueReminders> = []
      try {
        fired = popDueReminders(Date.now())
      } catch {}
      for (const r of fired) {
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            const n = new Notification('⏰ Reminder', {
              body: `${r.sender} in ${r.convTitle}: ${r.snippet}`,
            })
            n.onclick = () => {
              try {
                window.focus()
              } catch {}
              n.close()
            }
          }
        } catch {}
        try {
          useToastStore.getState().push(`⏰ Reminder — ${r.sender}: ${r.snippet}`, 'info')
        } catch {}
      }
    }
    tick()
    const t = setInterval(tick, 30000)
    return () => clearInterval(t)
  }, [])

  if (lockEnabled && !unlocked) {
    return (
      <ErrorBoundary>
        <LockScreen />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      {boot && <BootSplash onDone={endBoot} />}
      <BrowserRouter>
        <Suspense fallback={<div className="h-screen flex items-center justify-center"><LoadingState text="Loading..." /></div>}>
          <Routes>
            {/* Marketing landing is web-only: inside the native shell there is
                nothing to download, so skip straight to login (PublicOnly
                bounces signed-in users to /chat). */}
            <Route path="/" element={isNativeApp() ? <Navigate to="/login" replace /> : <LandingPage />} />
            <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
            <Route path="/signup" element={<PublicOnly><SignupPage /></PublicOnly>} />
            <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
            <Route path="/join/:token" element={<JoinPage />} />
          <Route path="/u/:username" element={<UserPage />} />
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
