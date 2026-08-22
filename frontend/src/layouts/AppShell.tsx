import { Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function AppShell() {
  const { user } = useAuthStore()
  // could add global toasts etc
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Outlet />
    </div>
  )
}
