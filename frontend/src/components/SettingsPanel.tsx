import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { extendedApi, sessionsApi, storageApi } from '../services/api'
import { blockApi } from '../services/api'
import { X, LogOut, Palette, Bell, Shield, Lock, MessageSquare, HardDrive, Ban } from 'lucide-react'
import PrivacyCenter from './PrivacyCenter'
import {
  AppearanceSettings,
  NotificationSettings,
  PrivacyQuickSettings,
  ChatSettings,
} from './settings/shared'

/**
 * Desktop sidebar settings. Preference sections are shared with
 * SettingsPage (see ./settings/shared) — add a control there once and
 * both surfaces get it, wired to the same store.
 */
export function SettingsPanel({ onClose }: { onClose:()=>void }) {
  const { logout, user } = useAuthStore()
  const [currentPwd, setCurrentPwd]=useState('')
  const [newPwd, setNewPwd]=useState('')
  const [pwdMsg, setPwdMsg]=useState<string|null>(null)
  const [sessions, setSessions]=useState<any[]>([])
  const [storage, setStorage]=useState<any>(null)
  const [showPrivacy, setShowPrivacy]=useState(false)
  const [blocked, setBlocked]=useState<any[]|null>(null)
  const loadBlocked=()=>{
    blockApi.list()
      .then((r:any)=>{ if (r?.success) setBlocked(r.data || []) })
      .catch(()=> setBlocked([]))
  }
  const handleUnblock=async (userId:number)=>{
    try {
      await blockApi.unblock(userId)
      setBlocked(b=> (b || []).filter((x:any)=> x.user_id !== userId))
    } catch {}
  }

  useEffect(()=>{ sessionsApi.list().then(r=>{ if(r.success) setSessions(r.data)}).catch(()=>{}) }, [])
  useEffect(()=>{ loadBlocked() }, [])
  useEffect(()=>{ storageApi.dashboard().then(r=>{ if(r.success) setStorage(r.data)}).catch(()=>{}) }, [])

  const handleChangePwd=async ()=>{
    setPwdMsg(null)
    try {
      const res=await extendedApi.changePassword(currentPwd, newPwd)
      if (res.success) { setPwdMsg('Password updated'); setCurrentPwd(''); setNewPwd('') }
    } catch (e:any) { setPwdMsg(e.response?.data?.detail || e.response?.data?.message || 'Failed') }
  }

  const handleDeleteSession=async (id:number)=>{
    try {
      await sessionsApi.remove(id)
      setSessions(s=> s.filter((x:any)=> x.id !== id))
    } catch {}
  }

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b border-[var(--k-border)]" style={{background:'hsl(var(--k-glass-strong))',backdropFilter:'blur(18px) saturate(160%)',WebkitBackdropFilter:'blur(18px) saturate(160%)'}}>
        <h2 className="font-semibold tracking-tight">Settings</h2>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors"><X className="w-4 h-4"/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Account */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Shield className="w-3 h-3"/> Account</h3>
          <div className="settings-section">
            <p className="text-sm font-medium tracking-tight">{user?.display_name}</p>
            <p className="text-xs text-muted-foreground">@{user?.username} • {user?.email}</p>
          </div>
        </section>

        {/* Appearance */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Palette className="w-3 h-3"/> Appearance</h3>
          <AppearanceSettings />
        </section>

        {/* Notifications */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Bell className="w-3 h-3"/> Notifications</h3>
          <NotificationSettings />
        </section>

        {/* Privacy */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Shield className="w-3 h-3"/> Privacy</h3>
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
                <p className="text-sm font-medium">Open Privacy Center</p>
                <p className="text-xs text-muted-foreground">Profile, status and contact visibility</p>
              </button>
            )}
          </div>
        </section>

        {/* Blocked contacts */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Ban className="w-3 h-3"/> Blocked contacts</h3>
          <div className="settings-section">
            {blocked === null ? (
              <p className="text-xs text-muted-foreground">Loading...</p>
            ) : blocked.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nobody blocked. Block someone from their contact info to stop exchanging messages.</p>
            ) : blocked.map((b: any) => (
              <div key={b.user_id} className="flex items-center gap-2.5 py-1.5 border-b border-[var(--k-border)]/40 last:border-0">
                <div className="w-8 h-8 rounded-full kryzen-accent-gradient text-white flex items-center justify-center overflow-hidden text-xs font-bold shrink-0">
                  {b.avatar_url ? <img src={b.avatar_url} alt="" className="w-full h-full object-cover"/> : (b.display_name || b.username || '?')[0]}
                </div>
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
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Lock className="w-3 h-3"/> Security</h3>
          <div className="space-y-3">
            <div className="settings-section space-y-2">
              <p className="text-sm font-medium">Change password</p>
              <input type="password" value={currentPwd} onChange={e=>setCurrentPwd(e.target.value)} placeholder="Current password" className="auth-input w-full px-3 py-2 rounded-lg text-sm"/>
              <input type="password" value={newPwd} onChange={e=>setNewPwd(e.target.value)} placeholder="New password (min 6)" className="auth-input w-full px-3 py-2 rounded-lg text-sm"/>
              <button onClick={handleChangePwd} className="auth-submit-btn w-full py-2 rounded-lg text-white text-sm font-medium">Update password</button>
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
                <button onClick={async ()=>{ await sessionsApi.logoutOthers(); setSessions(sessions.filter((s:any)=>s.is_current)) }} className="mt-2 w-full py-1.5 rounded-lg bg-background border border-[var(--k-border)] text-xs hover:bg-muted transition-colors">Logout other sessions</button>
              )}
            </div>
          </div>
        </section>

        {/* Storage */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><HardDrive className="w-3 h-3"/> Storage</h3>
          {storage && (
            <div className="settings-section space-y-2">
              <div className="flex justify-between text-xs"><span>Images</span><span>{(storage.images/1024/1024).toFixed(1)} MB</span></div>
              <div className="flex justify-between text-xs"><span>Videos</span><span>{(storage.videos/1024/1024).toFixed(1)} MB</span></div>
              <div className="flex justify-between text-xs"><span>Audio</span><span>{(storage.audio/1024/1024).toFixed(1)} MB</span></div>
              <div className="flex justify-between text-xs"><span>Files</span><span>{(storage.files/1024/1024).toFixed(1)} MB</span></div>
              <div className="border-t border-[var(--k-border)]/40 pt-2 flex justify-between text-xs font-medium"><span>Total</span><span>{(storage.total/1024/1024).toFixed(1)} MB</span></div>
            </div>
          )}
        </section>

        {/* Chat */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><MessageSquare className="w-3 h-3"/> Chat</h3>
          <ChatSettings />
        </section>

        <button onClick={async ()=>{ await logout(); window.location.href='/login' }} className="settings-logout-btn w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-medium">
          <LogOut className="w-4 h-4"/> Log out
        </button>

        <p className="text-[11px] text-center text-muted-foreground tracking-tight">Kryzen • Secure • Fast • Reliable</p>
      </div>
    </div>
  )
}
