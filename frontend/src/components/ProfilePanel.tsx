import { useState } from 'react'
import { useAuthStore } from '../store/auth'
import { uploadApi, usersApi } from '../services/api'
import { X, Camera, QrCode } from 'lucide-react'
import { initials } from '../utils/format'
import QRProfile from './QRProfile'

export function ProfilePanel({ onClose }: { onClose:()=>void }) {
  const { user, setUser } = useAuthStore()
  const [displayName, setDisplayName]=useState(user?.display_name || '')
  const [about, setAbout]=useState(user?.about || '')
  const [saving, setSaving]=useState(false)
  const [msg, setMsg]=useState<string | null>(null)
  const [showQR, setShowQR]=useState(false)

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
    try {
      const res = await uploadApi.avatar(file)
      if (res.success) {
        // user already updated via backend, but refresh
        const updated = {...user!, avatar_url: res.data.avatar_url}
        setUser(updated as any)
        setMsg('Avatar updated')
      }
    } catch (err:any) {
      setMsg(err.response?.data?.message || 'Avatar upload failed')
    }
  }

  if (!user) return null
  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold">Profile</h2>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-muted"><X className="w-4 h-4"/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold">
              {user.avatar_url ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(user.display_name)}
            </div>
            <label className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer shadow">
              <Camera className="w-4 h-4"/>
              <input type="file" className="hidden" accept="image/*" onChange={handleAvatar} />
            </label>
          </div>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
          <button onClick={()=> setShowQR(!showQR)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-accent transition">
            <QrCode className="w-3.5 h-3.5" /> {showQR ? 'Hide' : 'Show'} QR Code
          </button>
        </div>
        {showQR && (
          <div className="border-t pt-4">
            <QRProfile username={user.username} displayName={user.display_name} />
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Display Name</label>
            <input value={displayName} onChange={e=>setDisplayName(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-muted border border-transparent focus:bg-background focus:border-primary outline-none text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">About</label>
            <textarea value={about} onChange={e=>setAbout(e.target.value)} rows={3} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-muted border border-transparent focus:bg-background focus:border-primary outline-none text-sm resize-none" placeholder="Hey there! I'm using KB Chat." />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <input value={user.email||''} disabled className="w-full mt-1 px-3 py-2.5 rounded-xl bg-muted text-sm opacity-60" />
          </div>
        </div>
        {msg && <p className="text-xs text-center py-2 rounded-lg bg-muted">{msg}</p>}
        <button onClick={handleSave} disabled={saving} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50">{saving?'Saving...':'Save changes'}</button>
        <div className="text-xs text-muted-foreground text-center pt-4 border-t">
          Joined {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'recently'}
        </div>
      </div>
    </div>
  )
}
