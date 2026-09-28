import { useState } from 'react'
import { useAuthStore } from '../store/auth'
import { uploadApi, usersApi } from '../services/api'
import { X, Camera, QrCode, Trash2, Eye, BadgeCheck, LogOut, AtSign } from 'lucide-react'
import { initials } from '../utils/format'
import QRProfile from './QRProfile'

const ABOUT_MAX = 140

export function ProfilePanel({ onClose }: { onClose:()=>void }) {
  const { user, setUser, logout } = useAuthStore()
  const [displayName, setDisplayName]=useState(user?.display_name || '')
  const [about, setAbout]=useState(user?.about || '')
  const [saving, setSaving]=useState(false)
  const [uploading, setUploading]=useState(false)
  const [msg, setMsg]=useState<string | null>(null)
  const [showQR, setShowQR]=useState(false)
  const [preview, setPreview]=useState<string|null>(null)
  const [showPreview, setShowPreview]=useState(false)
  const [fit, setFit]=useState<'cover'|'contain'>('cover')
  const [removing, setRemoving]=useState(false)

  const handleSave=async ()=>{
    setSaving(true)
    setMsg(null)
    try {
      const res = await usersApi.updateMe({ display_name: displayName, about })
      if (res.success) {
        setUser(res.data)
        setMsg('Profile updated')
      }
    } catch (e:any) {
      setMsg(e.response?.data?.message || 'Failed')
    } finally { setSaving(false) }
  }

  const handleAvatar=async (e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0]
    if (!file) return
    // local preview before upload
    const url = URL.createObjectURL(file)
    setPreview(url)
    setShowPreview(true)
    setUploading(true)
    try {
      const res = await uploadApi.avatar(file)
      if (res.success) {
        const updated = {...user!, avatar_url: res.data.avatar_url}
        setUser(updated as any)
        setPreview(res.data.avatar_url)
        setMsg('Avatar updated — persists across devices')
      }
    } catch (err:any) {
      setMsg(err.response?.data?.message || 'Avatar upload failed')
    } finally {
      setUploading(false)
      e.target.value=''
    }
  }

  const handleLogout=async ()=>{
    await logout()
    window.location.href='/login'
  }

  const handleRemove=async ()=>{
    if (!user?.avatar_url) return
    if (!confirm('Remove profile photo?')) return
    setRemoving(true)
    try {
      const res = await usersApi.updateMe({ avatar_url: null })
      if (res.success) {
        setUser(res.data)
        setPreview(null)
        setMsg('Avatar removed')
      } else {
        // fallback: clear locally and rely on backend null
        setUser({...user!, avatar_url: null} as any)
        setPreview(null)
        setMsg('Avatar removed')
      }
    } catch (e:any) {
      setMsg(e.response?.data?.message || 'Remove failed')
    } finally { setRemoving(false) }
  }

  if (!user) return null
  const avatarSrc = preview || user.avatar_url
  const dirty = displayName !== (user.display_name || '') || about !== (user.about || '')
  const verified = (user as any).email_verified
  return (
    <div className="h-full flex flex-col bg-card">
      {/* Cover header */}
      <div className="relative shrink-0 h-24 bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-500 overflow-hidden">
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-10 -left-6 w-36 h-36 rounded-full bg-black/20 blur-2xl" />
        <span className="absolute bottom-1.5 left-5 flex items-center gap-1 text-white/70 text-xs font-semibold tracking-wide" aria-hidden="true">
          <AtSign className="w-3 h-3"/> {user.username}
        </span>
        <button onClick={onClose} className="absolute top-3 right-3 p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition active:scale-95" aria-label="Close profile">
          <X className="w-4 h-4"/>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain pb-4">
        {/* Identity block below the cover */}
        <div className="px-6 pt-4">
          <div className="relative w-fit">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold shadow-lg ring-4 ring-card">
              {avatarSrc ? <img src={avatarSrc} alt="" className={`w-full h-full ${fit==='cover'?'object-cover':'object-contain bg-muted'}`} /> : initials(user.display_name)}
            </div>
            <label className={`absolute bottom-0 right-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md ring-2 ring-card transition active:scale-95 ${uploading ? 'opacity-60 pointer-events-none' : 'cursor-pointer hover:bg-primary/90'}`} aria-label="Change profile photo">
              <Camera className="w-5 h-5"/>
              <input type="file" className="hidden" accept="image/*" onChange={handleAvatar} disabled={uploading} />
            </label>
          </div>

          <h2 className="mt-3 text-lg font-bold tracking-tight">{user.display_name}</h2>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
          <div className="mt-2 flex items-center gap-2">
            {user.is_online ? (
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/> Online
              </span>
            ) : user.last_seen ? (
              <span className="text-xs text-muted-foreground">Last seen {new Date(user.last_seen).toLocaleString()}</span>
            ) : null}
          </div>

          {/* Photo actions */}
          <div className="mt-4 flex flex-wrap gap-2">
            <label className={`flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-full bg-primary text-primary-foreground font-medium transition active:scale-95 min-h-[44px] ${uploading ? 'opacity-60 pointer-events-none' : 'hover:bg-primary/90 cursor-pointer'}`}>
              <Camera className="w-3.5 h-3.5"/> {uploading ? 'Uploading…' : user.avatar_url ? 'Change photo' : 'Upload photo'}
              <input type="file" className="hidden" accept="image/*" onChange={handleAvatar} disabled={uploading} />
            </label>
            {avatarSrc && (
              <button onClick={()=> setShowPreview(true)} className="flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-full bg-muted hover:bg-accent border transition min-h-[44px]" aria-label="Preview photo">
                <Eye className="w-3.5 h-3.5"/> View
              </button>
            )}
            {user.avatar_url && (
              <button onClick={handleRemove} disabled={removing} className="flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-full bg-muted hover:bg-destructive/10 hover:text-destructive border transition disabled:opacity-50 min-h-[44px]">
                <Trash2 className="w-3.5 h-3.5"/> {removing?'Removing...':'Remove'}
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Photos are stored securely and sync across your devices.</p>
        </div>

        {/* Editable info card */}
        <div className="px-6 mt-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Profile info</p>
          <div className="rounded-2xl border bg-muted/40 p-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Display Name</label>
              <input value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={100} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-background border border-transparent focus:border-primary outline-none text-sm transition" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">About</label>
                <span className="text-[11px] text-muted-foreground">{about.length}/{ABOUT_MAX}</span>
              </div>
              <textarea value={about} onChange={e=>setAbout(e.target.value.slice(0, ABOUT_MAX))} rows={3} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-background border border-transparent focus:border-primary outline-none text-sm resize-none" placeholder="Hey there! I'm using Kryzen." />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <div className="relative">
                <input value={user.email||''} disabled className="w-full mt-1 px-3 py-2.5 rounded-xl bg-muted text-sm opacity-60 pr-9" />
                {verified && <BadgeCheck className="w-4 h-4 text-primary absolute right-3 top-1/2 -translate-y-1/2" aria-label="Verified email" />}
              </div>
            </div>
          </div>
        </div>

        {/* QR card */}
        <div className="px-6 mt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Share</p>
          <button onClick={()=> setShowQR(!showQR)} className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border bg-muted/40 hover:bg-muted transition min-h-[52px]">
            <span className="flex items-center gap-2 text-sm font-medium"><QrCode className="w-4 h-4" /> Share QR Code</span>
            <span className="text-xs text-muted-foreground">{showQR ? 'Hide' : 'Show'}</span>
          </button>
          {showQR && (
            <div className="mt-2 rounded-2xl border p-4">
              <QRProfile username={user.username} displayName={user.display_name} />
            </div>
          )}
        </div>

        <div className="px-6 mt-4 text-xs text-muted-foreground text-center">
          Joined {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'recently'}
        </div>

        {/* Danger zone */}
        <div className="px-6 mt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Account</p>
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 transition active:scale-[0.98] min-h-[48px]">
            <LogOut className="w-4 h-4"/> Log out
          </button>
        </div>
      </div>

      {/* Save bar footer */}
      <div className="shrink-0 px-6 py-3 border-t bg-card">
        {msg && <p className="text-xs text-center py-2 px-3 mb-2 rounded-lg bg-muted animate-slideUp">{msg}</p>}
        <button onClick={handleSave} disabled={saving || !dirty} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-40 shadow-sm active:scale-[0.98] transition">{saving?'Saving...':'Save changes'}</button>
      </div>

      {showPreview && avatarSrc && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={()=> setShowPreview(false)}>
          <div className="relative bg-card rounded-2xl overflow-hidden shadow-2xl max-w-sm w-full" onClick={e=> e.stopPropagation()}>
            <div className="p-3 border-b flex items-center justify-between">
              <span className="text-sm font-medium">Photo preview</span>
              <button onClick={()=> setShowPreview(false)} className="p-1.5 rounded-full hover:bg-muted"><X className="w-4 h-4"/></button>
            </div>
            <div className="p-4 flex items-center justify-center bg-muted/30">
              <img src={avatarSrc} alt="preview" className={`max-h-[360px] w-auto rounded-xl shadow ${fit==='cover'?'object-cover':'object-contain'}`} />
            </div>
            <div className="p-3 flex gap-2 border-t bg-card">
              <button onClick={()=> setFit(f=> f==='cover'?'contain':'cover')} className="flex-1 py-2 rounded-xl bg-muted text-sm">Toggle fit ({fit})</button>
              <button onClick={()=> setShowPreview(false)} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
