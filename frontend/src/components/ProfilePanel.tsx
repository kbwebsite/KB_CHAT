import { useState } from 'react'
import { useAuthStore } from '../store/auth'
import { uploadApi, usersApi } from '../services/api'
import { X, Camera, QrCode, Trash2, Eye, Image as ImageIcon } from 'lucide-react'
import { initials } from '../utils/format'
import QRProfile from './QRProfile'

export function ProfilePanel({ onClose }: { onClose:()=>void }) {
  const { user, setUser } = useAuthStore()
  const [displayName, setDisplayName]=useState(user?.display_name || '')
  const [about, setAbout]=useState(user?.about || '')
  const [saving, setSaving]=useState(false)
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
      e.target.value=''
    }
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
  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b kryzen-glass-strong sticky top-0 z-10">
        <h2 className="font-semibold tracking-tight">Profile</h2>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition active:scale-95"><X className="w-4 h-4"/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-6 overscroll-contain">
        <div className="flex flex-col items-center gap-3">
          <div className="relative group">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold shadow-lg ring-1 ring-black/5 kryzen-lift">
              {avatarSrc ? <img src={avatarSrc} alt="" className={`w-full h-full ${fit==='cover'?'object-cover':'object-contain bg-muted'}`} /> : initials(user.display_name)}
            </div>
            <label className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer shadow-md hover:bg-primary/90 transition active:scale-95 ring-2 ring-card" aria-label="Change profile photo">
              <Camera className="w-5 h-5"/>
              <input type="file" className="hidden" accept="image/*" onChange={handleAvatar} />
            </label>
            {avatarSrc && (
              <button onClick={()=> setShowPreview(true)} className="absolute -top-1 -left-1 w-9 h-9 rounded-full bg-card border shadow-sm flex items-center justify-center hover:bg-muted transition" title="Preview" aria-label="Preview photo">
                <Eye className="w-4 h-4"/>
              </button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <label className="flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer transition active:scale-95 min-h-[44px]">
              <Camera className="w-3.5 h-3.5"/> {user.avatar_url ? 'Change' : 'Upload'} photo
              <input type="file" className="hidden" accept="image/*" onChange={handleAvatar} />
            </label>
            {user.avatar_url && (
              <button onClick={handleRemove} disabled={removing} className="flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-full bg-muted hover:bg-destructive/10 hover:text-destructive border transition disabled:opacity-50 min-h-[44px]">
                <Trash2 className="w-3.5 h-3.5"/> {removing?'Removing...':'Remove'}
              </button>
            )}
            <button onClick={()=> setFit(f=> f==='cover'?'contain':'cover')} className="flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-full bg-muted hover:bg-accent border transition min-h-[44px]">
              <ImageIcon className="w-3.5 h-3.5"/> Fit: {fit}
            </button>
          </div>
          <button onClick={()=> setShowQR(!showQR)} className="flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-full bg-muted hover:bg-accent transition min-h-[44px]">
            <QrCode className="w-3.5 h-3.5" /> {showQR ? 'Hide' : 'Show'} QR Code
          </button>
          <p className="text-[11px] text-muted-foreground text-center max-w-[260px]">Photo persists after refresh, logout/login and on other devices. Uses Supabase storage when configured.</p>
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

        {showQR && (
          <div className="border-t pt-4">
            <QRProfile username={user.username} displayName={user.display_name} />
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Display Name</label>
            <input value={displayName} onChange={e=>setDisplayName(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-muted border border-transparent focus:bg-background focus:border-primary outline-none text-sm transition" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">About</label>
            <textarea value={about} onChange={e=>setAbout(e.target.value)} rows={3} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-muted border border-transparent focus:bg-background focus:border-primary outline-none text-sm resize-none" placeholder="Hey there! I'm using Kryzen." />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <input value={user.email||''} disabled className="w-full mt-1 px-3 py-2.5 rounded-xl bg-muted text-sm opacity-60" />
          </div>
        </div>
        {msg && <p className="text-xs text-center py-2 rounded-lg bg-muted animate-slideUp">{msg}</p>}
        <button onClick={handleSave} disabled={saving} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 shadow-sm active:scale-[0.98] transition">{saving?'Saving...':'Save changes'}</button>
        <div className="text-xs text-muted-foreground text-center pt-4 border-t">
          Joined {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'recently'}
        </div>
      </div>
    </div>
  )
}
