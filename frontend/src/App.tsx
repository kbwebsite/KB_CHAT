import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from './store/auth'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ChatPage from './pages/ChatPage'
import { LoadingState } from './components/LoadingState'

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
  useEffect(()=>{ init() }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="/signup" element={<PublicOnly><SignupPage /></PublicOnly>} />
        <Route path="/chat" element={<Protected><ChatPage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
