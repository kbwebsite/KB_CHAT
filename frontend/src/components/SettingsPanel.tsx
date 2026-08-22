import { useEffect, useState } from 'react'
import { useSettingsStore } from '../store/settings'
import { useAuthStore } from '../store/auth'
import { extendedApi, settingsApi } from '../services/api'
import { X, LogOut, Moon, Sun, Monitor, Palette, Wallpaper, Bell, Shield, Lock, MessageSquare } from 'lucide-react'

export function SettingsPanel({ onClose }: { onClose:()=>void }) {
  const settings = useSettingsStore()
  const { logout, user } = useAuthStore()
  const [currentPwd, setCurrentPwd]=useState('')
  const [newPwd, setNewPwd]=useState('')
  const [pwdMsg, setPwdMsg]=useState<string|null>(null)
  const [sessions, setSessions]=useState<any[]>([])

  useEffect(()=>{ settingsApi.sessions().then(r=>{ if(r.success) setSessions(r.data)}) }, [])

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
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Privacy</h3>
          <div className="space-y-2">
            <label className="flex items-center justify-between p-3 rounded-xl bg-muted">
              <div><p className="text-sm font-medium">Read receipts</p><p className="text-xs text-muted-foreground">Show blue ticks when read</p></div>
              <input type="checkbox" checked={settings.read_receipts} onChange={e=> settings.update({read_receipts: e.target.checked})} className="w-4 h-4"/>
            </label>
            <div className="p-3 rounded-xl bg-muted">
              <p className="text-sm font-medium">Last seen visibility</p>
              <select value={settings.last_seen_visible} onChange={e=> settings.update({last_seen_visible: e.target.value})} className="mt-1 w-full px-2 py-1.5 rounded-lg bg-background border text-sm">
                <option value="everyone">Everyone</option>
                <option value="contacts">Contacts</option>
                <option value="nobody">Nobody</option>
              </select>
            </div>
            <div className="p-3 rounded-xl bg-muted">
              <p className="text-sm font-medium">Online status</p>
              <select value={settings.online_status_visible} onChange={e=> settings.update({online_status_visible: e.target.value})} className="mt-1 w-full px-2 py-1.5 rounded-lg bg-background border text-sm">
                <option value="everyone">Everyone</option>
                <option value="contacts">Contacts</option>
                <option value="nobody">Nobody</option>
              </select>
            </div>
          </div>
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
              {sessions.map(s=> (
                <div key={s.id} className="flex justify-between items-center py-1">
                  <span className="text-xs">{s.device}</span>
                  <span className="text-xs text-muted-foreground">{s.is_current ? 'Current' : s.last_active}</span>
                </div>
              ))}
              <button onClick={async ()=>{ alert('Other sessions logged out (V1 single session)') }} className="mt-2 w-full py-1.5 rounded-lg bg-background border text-xs">Logout other sessions</button>
            </div>
          </div>
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

        <p className="text-[11px] text-center text-muted-foreground">KB Chat v2 • Secure • Fast • Reliable</p>
      </div>
    </div>
  )
}
