import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { extendedApi, sessionsApi, storageApi } from '../services/api'
import { X, LogOut, Palette, Bell, Shield, Lock, MessageSquare, HardDrive, Ban, Info, Trash } from 'lucide-react'
import PrivacyCenter from '../components/PrivacyCenter'
import {
  AppearanceSettings,
  NotificationSettings,
  PrivacyQuickSettings,
  ChatSettings,
  AppLockSettings,
} from '../components/settings/shared'
import { blockApi } from '../services/api'

/**
 * Full-page settings (mobile route + desktop fallback). Preference sections
 * are shared with SettingsPanel (see components/settings/shared) — one
 * definition, both surfaces, same store.
 */
export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState<string | null>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [storage, setStorage] = useState<any>(null)
  const [blocked, setBlocked] = useState<any[] | null>(null)
  const [buildInfo, setBuildInfo] = useState<{ service?: string; commit?: string }>({})

  useEffect(()=>{ sessionsApi.list().then(r=>{ if(r.success) setSessions(r.data) }).catch(()=>{}) }, [])
  useEffect(()=>{ storageApi.dashboard().then(r=>{ if(r.success) setStorage(r.data)}).catch(()=>{}) }, [])
  useEffect(()=>{ blockApi.list().then((r:any)=>{ if (r?.success) setBlocked(r.data || []) }).catch(()=> setBlocked([])) }, [])
  useEffect(()=>{
    fetch('/api/health').then(r=>r.json()).then(j=> setBuildInfo({ service: j?.data?.service, commit: j?.data?.commit })).catch(()=>{})
  }, [])

  const handleChangePwd = async ()=>{
    setPwdMsg(null)
    setChangingPassword(true)
    try {
      const res = await extendedApi.changePassword(currentPwd, newPwd)
      if (res.success) { setPwdMsg('Password updated'); setCurrentPwd(''); setNewPwd('') }
    } catch (e:any) { setPwdMsg(e.response?.data?.detail || e.response?.data?.message || 'Failed') }
    finally { setChangingPassword(false) }
  }

  const handleLogout = async ()=>{
    await logout()
    navigate('/login')
  }

  const handleDeleteSession = async (id: number)=>{
    try {
      await sessionsApi.remove(id)
      setSessions(s=> s.filter((x:any)=> x.id !== id))
    } catch {}
  }

  const handleUnblock = async (userId: number)=>{
    try {
      await blockApi.unblock(userId)
      setBlocked(b=> (b || []).filter((x:any)=> x.user_id !== userId))
    } catch {}
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 border-b border-[var(--k-border)] pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground">Account and app preferences</p>
          </div>
          <button onClick={()=>navigate(-1)} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Back">
            <X className="w-5 h-5"/>
          </button>
        </div>

        <div className="space-y-6">
          {/* Account */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Shield className="w-3 h-3"/> Account</h2>
            <div className="settings-section">
              <p className="text-sm font-medium">{user?.display_name}</p>
              <p className="text-xs text-muted-foreground">@{user?.username} • {user?.email}</p>
            </div>
          </section>

          {/* Appearance */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Palette className="w-3 h-3"/> Appearance</h2>
            <AppearanceSettings />
          </section>

          {/* Notifications */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Bell className="w-3 h-3"/> Notifications</h2>
            <NotificationSettings />
          </section>

          {/* Privacy */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Shield className="w-3 h-3"/> Privacy</h2>
            <div className="space-y-2">
              <PrivacyQuickSettings />
              {showPrivacy ? (
                <div className="settings-section overflow-hidden p-0">
                  <div className="p-2 flex justify-end">
                    <button onClick={()=>setShowPrivacy(false)} className="text-xs px-2 py-1 rounded-lg bg-background border border-[var(--k-border)] hover:bg-muted transition-colors">Close</button>
                  </div>
                  <PrivacyCenter />
                </div>
              ) : (
                <button onClick={()=>setShowPrivacy(true)} className="settings-section w-full text-left hover:border-[var(--k-primary)]/20 transition-colors">
                  <p className="text-sm font-medium">Privacy Center</p>
                  <p className="text-xs text-muted-foreground">Profile, status and contact visibility</p>
                </button>
              )}
            </div>
          </section>

          {/* Blocked contacts */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Ban className="w-3 h-3"/> Blocked contacts</h2>
            <div className="settings-section">
              {blocked === null ? (
                <p className="text-xs text-muted-foreground">Loading...</p>
              ) : blocked.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nobody blocked.</p>
              ) : blocked.map((b: any) => (
                <div key={b.user_id} className="flex items-center gap-2.5 py-1.5 border-b border-[var(--k-border)]/40 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.display_name || b.username}</p>
                    <p className="text-xs text-muted-foreground truncate">@{b.username}</p>
                  </div>
                  <button onClick={() => handleUnblock(b.user_id)} className="text-xs px-2.5 py-1 rounded-lg bg-background border border-[var(--k-border)] hover:bg-muted transition-colors shrink-0">Unblock</button>
                </div>
              ))}
            </div>
          </section>

          {/* Security */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Lock className="w-3 h-3"/> Security</h2>
            <div className="space-y-3">
              <AppLockSettings />
              <div className="settings-section space-y-2">
                <p className="text-sm font-medium">Change password</p>
                <input type="password" value={currentPwd} onChange={e=> setCurrentPwd(e.target.value)} placeholder="Current password" className="auth-input w-full px-3 py-2 rounded-lg text-sm"/>
                <input type="password" value={newPwd} onChange={e=> setNewPwd(e.target.value)} placeholder="New password (min 6)" className="auth-input w-full px-3 py-2 rounded-lg text-sm"/>
                <button onClick={handleChangePwd} className="auth-submit-btn w-full py-2 rounded-lg text-white text-sm font-medium" disabled={changingPassword}>
                  {changingPassword ? 'Updating...' : 'Update password'}
                </button>
                {pwdMsg && <p className="text-xs text-center p-1.5 rounded-lg bg-background">{pwdMsg}</p>}
              </div>
              <div className="settings-section">
                <p className="text-sm font-medium mb-2">Active sessions</p>
                {sessions.length===0 && <p className="text-xs text-muted-foreground">No sessions found</p>}
                {sessions.map((s:any)=> (
                  <div key={s.id} className="flex justify-between items-center gap-2 py-1.5 border-b border-[var(--k-border)]/40 last:border-0">
                    <div className="min-w-0">
                      <span className="text-xs font-medium">{s.device_info || 'Unknown device'}</span>
                      <span className="text-xs text-muted-foreground ml-2">{s.browser_info || ''}</span>
                    </div>
                    {s.is_current
                      ? <span className="text-xs text-muted-foreground shrink-0">✓ Current</span>
                      : <button onClick={()=>handleDeleteSession(s.id)} className="text-xs px-2 py-0.5 rounded-lg bg-background border border-[var(--k-border)] hover:text-destructive hover:border-destructive/40 transition-colors shrink-0">Revoke</button>}
                  </div>
                ))}
                {sessions.length > 1 && (
                  <button onClick={()=> sessionsApi.logoutOthers().then(()=> setSessions(sessions.filter(s=>s.is_current)))} className="mt-2 w-full py-1.5 rounded-lg bg-background border border-[var(--k-border)] text-xs hover:bg-muted transition-colors">
                    Logout other sessions
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Chat */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><MessageSquare className="w-3 h-3"/> Chat</h2>
            <ChatSettings />
          </section>

          {/* Storage */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><HardDrive className="w-3 h-3"/> Storage</h2>
            <div className="space-y-2">
              {storage && (
                <div className="settings-section space-y-2">
                  <div className="flex justify-between text-xs"><span>Images</span><span>{(storage.images/1024/1024).toFixed(1)} MB</span></div>
                  <div className="flex justify-between text-xs"><span>Videos</span><span>{(storage.videos/1024/1024).toFixed(1)} MB</span></div>
                  <div className="flex justify-between text-xs"><span>Audio</span><span>{(storage.audio/1024/1024).toFixed(1)} MB</span></div>
                  <div className="flex justify-between text-xs"><span>Files</span><span>{(storage.files/1024/1024).toFixed(1)} MB</span></div>
                  <div className="border-t border-[var(--k-border)]/40 pt-2 flex justify-between text-xs font-medium"><span>Total</span><span>{(storage.total/1024/1024).toFixed(1)} MB</span></div>
                </div>
              )}
              <div className="settings-section">
                <button onClick={()=> { localStorage.clear(); window.location.reload(); }} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 transition-colors">
                  <Trash className="w-4 h-4"/> Clear local cache
                </button>
                <p className="text-xs text-muted-foreground text-center mt-1">Clears local cache, wallpapers, and temp data</p>
              </div>
            </div>
          </section>

          {/* About */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Info className="w-3 h-3"/> About</h2>
            <div className="settings-section space-y-2">
              <div className="flex justify-between text-xs"><span>Service</span><span>{buildInfo.service || '…'}</span></div>
              <div className="flex justify-between text-xs"><span>Commit</span><span>{buildInfo.commit || '…'}</span></div>
              <div className="flex justify-between text-xs"><span>Platform</span><span>{typeof Capacitor !== 'undefined' && (Capacitor as any).isNativePlatform?.() ? 'Mobile' : 'Web'}</span></div>
            </div>
          </section>
        </div>

        <div className="mt-6 pt-6 border-t border-[var(--k-border)]">
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-medium bg-destructive/10 border border-destructive/20 hover:bg-destructive/25 transition-colors">
            <LogOut className="w-4 h-4"/> Log out
          </button>
        </div>
      </div>
    </div>
  )
}
