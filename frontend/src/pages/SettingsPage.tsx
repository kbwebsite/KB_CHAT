import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useSettingsStore } from '../store/settings'
import { extendedApi, settingsApi, sessionsApi, storageApi } from '../services/api'
import { X, LogOut, Moon, Sun, Monitor, Palette, Wallpaper, Upload, Trash2, Bell, Shield, Lock, MessageSquare, HardDrive, Ban, Vibrate, Info, Trash, RefreshCw, ChevronDown } from 'lucide-react'

export const Select = ({ label, value, options, onChange }: { label: string; value: string; options: {id:string, label:string}[]; onChange: (v:string)=>void }) => (
  <div className="settings-section">
    <label className="text-xs font-medium text-muted-foreground mb-1">{label}</label>
    <select value={value} onChange={e=> onChange(e.target.value)} className="w-full px-3 py-2 rounded-lg border-[var(--k-border)] bg-background text-sm outline-none focus:ring-2 focus:ring-ring" aria-label={label}>
      {options.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
    </select>
  </div>
)

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, token, logout } = useAuthStore()
  const settings = useSettingsStore()
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState<string | null>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [storage, setStorage] = useState<any>(null)

  useEffect(()=>{ sessionsApi.list().then(r=>{ if(r.success) setSessions(r.data) }).catch(()=>{}) }, [])
  useEffect(()=>{ storageApi.dashboard().then(r=>{ if(r.success) setStorage(r.data)}).catch(()=>{}) }, [])

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

  const handleDeleteSession = (id: number)=>{
    // Will be confirmed in UI
  }

  const themeOptions = [
    {id:'light', label:'Light', icon: Sun},
    {id:'dark', label:'Dark', icon: Moon},
    {id:'system', label:'System', icon: Monitor},
  ] as const

  const accentOptions = [
    {id:'violet', color:'bg-violet-600'},
    {id:'blue', color:'bg-blue-600'},
    {id:'emerald', color:'bg-emerald-600'},
    {id:'rose', color:'bg-rose-600'},
    {id:'amber', color:'bg-amber-500'},
    {id:'indigo', color:'bg-indigo-600'},
  ] as const

  const paperOptions = [
    {id:'default', label:'Default'},
    {id:'dots', label:'Dots'},
    {id:'gradient', label:'Gradient'},
  ] as const

  const privacyOptions = [
    {key:'online_status_visible', label:'Online Status', desc:'Who can see when you\'re online', type:'select', options:[
      {id:'everyone', label:'Everyone'},
      {id:'contacts', label:'Contacts Only'},
      {id:'nobody', label:'Nobody'},
    ]},
    {key:'read_receipts', label:'Read Receipts', desc:'Let others know you\'ve read their messages', type:'toggle'},
    {key:'last_seen_visible', label:'Last Seen', desc:'Who can see your last active time', type:'select', options:[
      {id:'everyone', label:'Everyone'},
      {id:'contacts', label:'Contacts Only'},
      {id:'nobody', label:'Nobody'},
    ]},
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 border-b border-[var(--k-border)] pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground">Account and app preferences</p>
          </div>
          <button onClick={handleLogout} className="text-sm text-primary hover:underline">
            Log out
          </button>
        </div>

        {/* Settings Sections */}
        <div className="space-y-6">

          {/* Account Section */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Shield className="w-3 h-3"/> Account</h2>
            <div className="settings-section">
              <p className="text-sm font-medium">{user?.display_name}</p>
              <p className="text-xs text-muted-foreground">@{user?.username} • {user?.email}</p>
            </div>
          </section>

          {/* Appearance Section */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Palette className="w-3 h-3"/> Appearance</h2>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {themeOptions.map(opt=> (
                <button key={opt.id} onClick={()=> settings.update({theme: opt.id as any})} className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${settings.theme===opt.id ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20' : 'bg-muted hover:bg-accent border-transparent hover:border-[var(--k-border)]'}`}>
                  <opt.icon className="w-5 h-5"/>
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs font-medium mb-2">Accent Color</p>
            <div className="flex gap-2 mb-3">
              {accentOptions.map(a=> (
                <button key={a.id} onClick={()=> settings.update({accent_color: a.id})} className={`settings-accent-dot ${a.color} ${settings.accent_color===a.id ? 'active' : ''}`} title={a.id}/>
              ))}
            </div>
            <p className="text-xs font-medium mb-2 flex items-center gap-1"><Wallpaper className="w-3 h-3"/> Wallpaper</p>
            <div className="grid grid-cols-3 gap-2">
              {paperOptions.map(w=> (
                <button key={w.id} onClick={()=> settings.update({chat_wallpaper: w.id})} className={`settings-wallpaper-btn h-16 p-2 ${w.id === settings.chat_wallpaper ? 'active' : ''}`}>
                  <span className="text-xs bg-card/80 px-1.5 py-0.5 rounded">{w.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Notifications Section */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Bell className="w-3 h-3"/> Notifications</h2>
            <div className="space-y-2">
              <label key='message_notifications' className="settings-section flex items-center justify-between cursor-pointer">
                <div><p className="text-sm font-medium">Message notifications</p><p className="text-xs text-muted-foreground">Show new message alerts</p></div>
                <input type="checkbox" checked={settings.message_notifications} onChange={e=> settings.update({message_notifications: e.target.checked})} className="settings-toggle"/>
              </label>
              <label key='sound_enabled' className="settings-section flex items-center justify-between cursor-pointer">
                <div><p className="text-sm font-medium">Sound</p><p className="text-xs text-muted-foreground">Play sound on new message</p></div>
                <input type="checkbox" checked={settings.sound_enabled} onChange={e=> settings.update({sound_enabled: e.target.checked})} className="settings-toggle"/>
              </label>
              <label key='vibrate_enabled' className="settings-section flex items-center justify-between cursor-pointer">
                <div><p className="text-sm font-medium">Vibration</p><p className="text-xs text-muted-foreground">Vibrate on new message</p></div>
                <input type="checkbox" checked={settings.vibrate_enabled} onChange={e=> settings.update({vibrate_enabled: e.target.checked})} className="settings-toggle"/>
              </label>
              <label key='desktop_notifications' className="settings-section flex items-center justify-between cursor-pointer">
                <div><p className="text-sm font-medium">Desktop notifications</p><p className="text-xs text-muted-foreground">Browser notifications</p></div>
                <input type="checkbox" checked={settings.desktop_notifications} onChange={e=> settings.update({desktop_notifications: e.target.checked})} className="settings-toggle"/>
              </label>
            </div>
            <button onClick={()=>{
              if ('Notification' in window) {
                if (Notification.permission==='default') Notification.requestPermission()
                else alert(`Permission: ${Notification.permission}`)
              }
            }} className="settings-section w-full text-left hover:border-[var(--k-primary)]/20 transition-colors">
              <p className="text-sm font-medium">Request notification permission</p>
              <p className="text-xs text-muted-foreground">Current: {typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'}</p>
            </button>
          </section>

          {/* Privacy Section */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Shield className="w-3 h-3"/> Privacy</h2>
            <button onClick={()=> setShowPrivacy(true)} className="settings-section w-full text-left hover:border-[var(--k-primary)]/20 transition-colors">
              <p className="text-sm font-medium">Privacy Center</p>
              <p className="text-xs text-muted-foreground">Manage who can see your info</p>
            </button>
          </section>

          {/* Privacy toggles (inline quick toggles) */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Shield className="w-3 h-3"/> Privacy</h3>
            <div className="space-y-2">
              {privacyOptions.map(item=> {
                if (item.type === 'toggle') {
                  return (
                    <label key={item.key} className="settings-section flex items-center justify-between cursor-pointer">
                      <div><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.desc}</p></div>
                      <input type="checkbox" checked={(settings as any)[item.key]} onChange={e=> settings.update({[item.key]: e.target.checked})} className="settings-toggle"/>
                    </label>
                  )
                } else {
                  return (
                    <div key={item.key} className="settings-section">
                      <Select label={item.label} value={(settings as any)[item.key]} options={item.options || []} onChange={v => settings.update({[item.key]: v} as any)} />
                    </div>
                  )
                }
              })}
            </div>
          </section>

          {/* Security Section */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Lock className="w-3 h-3"/> Security</h2>
            <div className="space-y-3">
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
                  <div key={s.id} className="flex justify-between items-center py-1.5 border-b border-[var(--k-border)]/40 last:border-0">
                    <div>
                      <span className="text-xs font-medium">{s.device_info || 'Unknown device'}</span>
                      <span className="text-xs text-muted-foreground ml-2">{s.browser_info || ''}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{s.is_current ? '✓ Current' : new Date(s.last_active).toLocaleDateString()}</span>
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

          {/* Chat Settings Section */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><MessageSquare className="w-3 h-3"/> Chat Settings</h2>
            <div className="space-y-2">
              <label className="settings-section flex items-center justify-between cursor-pointer">
                <div><p className="text-sm font-medium">Enter to send</p><p className="text-xs text-muted-foreground">Enter sends, Shift+Enter new line</p></div>
                <input type="checkbox" checked={settings.enter_to_send} onChange={e=> settings.update({enter_to_send: e.target.checked})} className="settings-toggle"/>
              </label>
              <label className="settings-section flex items-center justify-between cursor-pointer">
                <div><p className="text-sm font-medium">Media auto-download</p><p className="text-xs text-muted-foreground">Automatically download images</p></div>
                <input type="checkbox" checked={settings.media_auto_download} onChange={e=> settings.update({media_auto_download: e.target.checked})} className="settings-toggle"/>
              </label>
              <label className="settings-section flex items-center justify-between cursor-pointer">
                <div><p className="text-sm font-medium">Chat font size</p><p className="text-xs text-muted-foreground">Adjust message text size</p></div>
                <select value={settings.chat_font_size} onChange={e=> settings.update({chat_font_size: e.target.value as any})} className="w-full px-3 py-2 rounded-lg border-[var(--k-border)] bg-background text-sm outline-none focus:ring-2 focus:ring-ring">
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </label>
              <label className="settings-section flex items-center justify-between cursor-pointer">
                <div><p className="text-sm font-medium">Vibration</p><p className="text-xs text-muted-foreground">Vibrate on new message</p></div>
                <input type="checkbox" checked={settings.vibrate_enabled} onChange={e=> settings.update({vibrate_enabled: e.target.checked})} className="settings-toggle"/>
              </label>
            </div>
          </section>

          {/* Storage Section */}
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
            <div className="settings-section">
              <button onClick={()=> { localStorage.clear(); window.location.reload(); }} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 transition-colors">
                <Trash className="w-4 h-4"/> Clear local cache
              </button>
              <p className="text-xs text-muted-foreground text-center mt-1">Clears local cache, wallpapers, and temp data</p>
            </div>
          </section>

          {/* About Section */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Info className="w-3 h-3"/> About</h3>
            <div className="settings-section space-y-2">
              <div className="flex justify-between text-xs"><span>Version</span><span id="app-version">Loading...</span></div>
              <div className="flex justify-between text-xs"><span>Commit</span><span id="commit-sha">Loading...</span></div>
              <div className="flex justify-between text-xs"><span>Platform</span><span>{typeof Capacitor !== 'undefined' ? 'Mobile' : 'Web'}</span></div>
            </div>
          </section>

        </div>

        {/* Logout button at bottom */}
        <div className="mt-6 pt-6 border-t border-[var(--k-border)]">
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-medium bg-destructive/10 border border-destructive/20 hover:bg-destructive/25 transition-colors">
            <LogOut className="w-4 h-4"/> Log out
          </button>
        </div>
      </div>
    </div>
  )
}