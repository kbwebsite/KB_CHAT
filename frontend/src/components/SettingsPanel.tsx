import { useEffect, useState } from 'react'
import { useSettingsStore } from '../store/settings'
import { useAuthStore } from '../store/auth'
import { extendedApi, settingsApi, sessionsApi, storageApi } from '../services/api'
import { X, LogOut, Moon, Sun, Monitor, Palette, Wallpaper, Bell, Shield, Lock, MessageSquare, HardDrive } from 'lucide-react'
import PrivacyCenter from './PrivacyCenter'

export function SettingsPanel({ onClose }: { onClose:()=>void }) {
  const settings = useSettingsStore()
  const { logout, user } = useAuthStore()
  const [currentPwd, setCurrentPwd]=useState('')
  const [newPwd, setNewPwd]=useState('')
  const [pwdMsg, setPwdMsg]=useState<string|null>(null)
  const [sessions, setSessions]=useState<any[]>([])
  const [storage, setStorage]=useState<any>(null)
  const [showPrivacy, setShowPrivacy]=useState(false)

  useEffect(()=>{ sessionsApi.list().then(r=>{ if(r.success) setSessions(r.data)}).catch(()=>{}) }, [])
  useEffect(()=>{ storageApi.dashboard().then(r=>{ if(r.success) setStorage(r.data)}).catch(()=>{}) }, [])

  const handleChangePwd=async ()=>{
    setPwdMsg(null)
    try {
      const res=await extendedApi.changePassword(currentPwd, newPwd)
      if (res.success) { setPwdMsg('Password updated'); setCurrentPwd(''); setNewPwd('') }
    } catch (e:any) { setPwdMsg(e.response?.data?.detail || e.response?.data?.message || 'Failed') }
  }

  const accentOptions = [
    {id:'violet', color:'bg-violet-600'},
    {id:'blue', color:'bg-blue-600'},
    {id:'emerald', color:'bg-emerald-600'},
    {id:'rose', color:'bg-rose-600'},
    {id:'amber', color:'bg-amber-500'},
    {id:'indigo', color:'bg-indigo-600'},
  ]

  const wallpapers = [
    {id:'default', label:'Default', preview:'bg-muted'},
    {id:'dots', label:'Dots', preview:'bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] bg-[size:20px_20px]'},
    {id:'gradient', label:'Gradient', preview:'bg-gradient-to-br from-violet-500/10 to-indigo-500/10'},
  ]

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold">Settings</h2>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-muted"><X className="w-4 h-4"/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Account */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Shield className="w-3 h-3"/> Account</h3>
          <div className="p-3 rounded-xl bg-muted">
            <p className="text-sm font-medium">{user?.display_name}</p>
            <p className="text-xs text-muted-foreground">@{user?.username} • {user?.email}</p>
          </div>
        </section>

        {/* Appearance */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Palette className="w-3 h-3"/> Appearance</h3>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {([
              {id:'light', label:'Light', icon: Sun},
              {id:'dark', label:'Dark', icon: Moon},
              {id:'system', label:'System', icon: Monitor},
            ] as const).map(opt=> (
              <button key={opt.id} onClick={()=>settings.update({theme: opt.id as any})} className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 ${settings.theme===opt.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted hover:bg-accent border-transparent'}`}>
                <opt.icon className="w-5 h-5"/>
                <span className="text-xs font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs font-medium mb-2">Accent Color</p>
          <div className="flex gap-2 mb-3">
            {accentOptions.map(a=> (
              <button key={a.id} onClick={()=> settings.update({accent_color: a.id})} className={`w-8 h-8 rounded-full ${a.color} ${settings.accent_color===a.id ? 'ring-2 ring-offset-2 ring-primary' : ''}`} title={a.id}/>
            ))}
          </div>
          <p className="text-xs font-medium mb-2 flex items-center gap-1"><Wallpaper className="w-3 h-3"/> Wallpaper</p>
          <div className="grid grid-cols-3 gap-2">
            {wallpapers.map(w=> (
              <button key={w.id} onClick={()=> settings.update({chat_wallpaper: w.id})} className={`h-16 rounded-xl border p-2 ${w.preview} ${settings.chat_wallpaper===w.id ? 'border-primary ring-1 ring-primary' : 'border-transparent'}`}>
                <span className="text-xs bg-card/80 px-1.5 py-0.5 rounded">{w.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Notifications */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Bell className="w-3 h-3"/> Notifications</h3>
          <div className="space-y-2">
            {[
              {key:'message_notifications', label:'Message notifications', desc:'Show new message alerts'},
              {key:'sound_enabled', label:'Sound', desc:'Play sound on new message'},
              {key:'desktop_notifications', label:'Desktop notifications', desc:'Browser notifications'},
            ].map(item=> (
              <label key={item.key} className="flex items-center justify-between p-3 rounded-xl bg-muted cursor-pointer">
                <div><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.desc}</p></div>
                <input type="checkbox" checked={(settings as any)[item.key]} onChange={e=> settings.update({[item.key]: e.target.checked} as any)} className="w-4 h-4"/>
              </label>
            ))}
            <button onClick={()=>{
              if ('Notification' in window) {
                if (Notification.permission==='default') Notification.requestPermission()
                else alert(`Permission: ${Notification.permission}`)
              }
            }} className="w-full text-left p-3 rounded-xl bg-muted hover:bg-accent">
              <p className="text-sm font-medium">Request notification permission</p>
              <p className="text-xs text-muted-foreground">Current: {typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'}</p>
            </button>
          </div>
        </section>

        {/* Privacy */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Shield className="w-3 h-3"/> Privacy Center</h3>
          {showPrivacy ? (
            <div className="rounded-xl bg-muted overflow-hidden">
              <div className="p-2 flex justify-end">
                <button onClick={()=>setShowPrivacy(false)} className="text-xs px-2 py-1 rounded bg-background border">Close</button>
              </div>
              <PrivacyCenter />
            </div>
          ) : (
            <button onClick={()=>setShowPrivacy(true)} className="w-full p-3 rounded-xl bg-muted hover:bg-accent text-left">
              <p className="text-sm font-medium">Open Privacy Center</p>
              <p className="text-xs text-muted-foreground">Manage who can see your info</p>
            </button>
          )}
        </section>

        {/* Security */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Lock className="w-3 h-3"/> Security</h3>
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-muted space-y-2">
              <p className="text-sm font-medium">Change password</p>
              <input type="password" value={currentPwd} onChange={e=>setCurrentPwd(e.target.value)} placeholder="Current password" className="w-full px-3 py-2 rounded-lg bg-background border text-sm"/>
              <input type="password" value={newPwd} onChange={e=>setNewPwd(e.target.value)} placeholder="New password (min 6)" className="w-full px-3 py-2 rounded-lg bg-background border text-sm"/>
              <button onClick={handleChangePwd} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Update password</button>
              {pwdMsg && <p className="text-xs text-center p-1.5 rounded bg-background">{pwdMsg}</p>}
            </div>
            <div className="p-3 rounded-xl bg-muted">
              <p className="text-sm font-medium mb-2">Active sessions</p>
              {sessions.length===0 && <p className="text-xs text-muted-foreground">No sessions found</p>}
              {sessions.map((s:any)=> (
                <div key={s.id} className="flex justify-between items-center py-1.5 border-b border-[var(--border)] last:border-0">
                  <div>
                    <span className="text-xs font-medium">{s.device_info || 'Unknown device'}</span>
                    <span className="text-xs text-muted-foreground ml-2">{s.browser_info || ''}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{s.is_current ? '✓ Current' : new Date(s.last_active).toLocaleDateString()}</span>
                </div>
              ))}
              {sessions.length > 1 && (
                <button onClick={async ()=>{ await sessionsApi.logoutOthers(); setSessions(sessions.filter((s:any)=>s.is_current)) }} className="mt-2 w-full py-1.5 rounded-lg bg-background border text-xs">Logout other sessions</button>
              )}
            </div>
          </div>
        </section>

        {/* Chat */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><HardDrive className="w-3 h-3"/> Storage</h3>
          {storage && (
            <div className="p-3 rounded-xl bg-muted space-y-2">
              <div className="flex justify-between text-xs"><span>Images</span><span>{(storage.images/1024/1024).toFixed(1)} MB</span></div>
              <div className="flex justify-between text-xs"><span>Videos</span><span>{(storage.videos/1024/1024).toFixed(1)} MB</span></div>
              <div className="flex justify-between text-xs"><span>Audio</span><span>{(storage.audio/1024/1024).toFixed(1)} MB</span></div>
              <div className="flex justify-between text-xs"><span>Files</span><span>{(storage.files/1024/1024).toFixed(1)} MB</span></div>
              <div className="border-t pt-2 flex justify-between text-xs font-medium"><span>Total</span><span>{(storage.total/1024/1024).toFixed(1)} MB</span></div>
            </div>
          )}
        </section>

        {/* Chat */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><MessageSquare className="w-3 h-3"/> Chat</h3>
          <div className="space-y-2">
            <label className="flex items-center justify-between p-3 rounded-xl bg-muted">
              <div><p className="text-sm font-medium">Enter to send</p><p className="text-xs text-muted-foreground">Enter sends, Shift+Enter new line</p></div>
              <input type="checkbox" checked={settings.enter_to_send} onChange={e=> settings.update({enter_to_send: e.target.checked})} className="w-4 h-4"/>
            </label>
            <label className="flex items-center justify-between p-3 rounded-xl bg-muted">
              <div><p className="text-sm font-medium">Media auto-download</p><p className="text-xs text-muted-foreground">Automatically download images</p></div>
              <input type="checkbox" checked={settings.media_auto_download} onChange={e=> settings.update({media_auto_download: e.target.checked})} className="w-4 h-4"/>
            </label>
          </div>
        </section>

        <button onClick={async ()=>{ await logout(); window.location.href='/login' }} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90">
          <LogOut className="w-4 h-4"/> Log out
        </button>

        <p className="text-[11px] text-center text-muted-foreground">Kryzen • Secure • Fast • Reliable</p>
      </div>
    </div>
  )
}
