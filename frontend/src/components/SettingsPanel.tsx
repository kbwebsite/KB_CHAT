import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { extendedApi, sessionsApi, storageApi, usersApi } from '../services/api'
import { blockApi } from '../services/api'
import {
  ArrowLeft,
  Search,
  QrCode,
  Pencil,
  X,
  LogOut,
  Star,
  MonitorSmartphone,
  KeyRound,
  Lock,
  Users,
  Contact,
  MessageSquare,
  Palette,
  Megaphone,
  Bell,
  RefreshCw,
  ShieldCheck,
  Accessibility,
  Globe,
  HelpCircle,
  Smartphone,
  Infinity as InfinityIcon,
  Trash,
  Check,
  Copy,
  ChevronDown,
} from 'lucide-react'
import PrivacyCenter from './PrivacyCenter'
import {
  AppearanceSettings,
  NotificationSettings,
  PrivacyQuickSettings,
  ChatSettings,
  AppLockSettings,
  SelectRow,
} from './settings/shared'

/**
 * In-chat sidebar settings — WhatsApp structure (mirrors SettingsPage):
 * top bar (back, name, search, QR, edit), profile header
 * (about bubble, big avatar, name, handle), then seamless icon rows
 * that expand inline to the real controls.
 */
function RupeeIcon({ className }: { className?: string }) {
  return (
    <span className={`rounded-full bg-muted flex items-center justify-center font-bold shrink-0 ${className ?? ''}`}>
      ₹
    </span>
  )
}

export function SettingsPanel({ onClose }: { onClose:()=>void }) {
  const { logout, user, setUser } = useAuthStore() as any
  const [currentPwd, setCurrentPwd]=useState('')
  const [newPwd, setNewPwd]=useState('')
  const [pwdMsg, setPwdMsg]=useState<string|null>(null)
  const [sessions, setSessions]=useState<any[]>([])
  const [storage, setStorage]=useState<any>(null)
  const [showPrivacy, setShowPrivacy]=useState(false)
  const [blocked, setBlocked]=useState<any[]|null>(null)
  const [buildInfo, setBuildInfo]=useState<{ service?: string; commit?: string }>({})
  const [openRow, setOpenRow]=useState<string|null>(null)
  const [query, setQuery]=useState('')
  const [searching, setSearching]=useState(false)
  const [editing, setEditing]=useState(false)
  const [editName, setEditName]=useState('')
  const [editAbout, setEditAbout]=useState('')
  const [savingProfile, setSavingProfile]=useState(false)
  const [profileMsg, setProfileMsg]=useState<string|null>(null)
  const [showQr, setShowQr]=useState(false)
  const [notice, setNotice]=useState<string|null>(null)

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
  useEffect(()=>{
    fetch('/api/health').then(r=>r.json()).then(j=> setBuildInfo({ service: j?.data?.service, commit: j?.data?.commit })).catch(()=>{})
  }, [])

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

  const startEdit = () => {
    setEditName(user?.display_name || '')
    setEditAbout(user?.about || '')
    setProfileMsg(null)
    setEditing(true)
  }

  const saveProfile = async () => {
    if (!editName.trim()) { setProfileMsg('Name is required'); return }
    setSavingProfile(true)
    try {
      const r = await usersApi.updateMe({ display_name: editName.trim(), about: editAbout.trim() })
      if (r?.success && r.data) setUser(r.data)
      else setUser({ ...user, display_name: editName.trim(), about: editAbout.trim() })
      setEditing(false)
      setProfileMsg(null)
    } catch (e: any) {
      setProfileMsg(e.response?.data?.detail || e.response?.data?.message || 'Could not save')
    } finally {
      setSavingProfile(false)
    }
  }

  const inviteFriend = async () => {
    const link = `${window.location.origin}/signup`
    const text = `Join me on Kryzen: ${link}`
    try {
      if (navigator.share) await navigator.share({ title: 'Kryzen', text })
      else {
        await navigator.clipboard.writeText(text)
        setNotice('Invite link copied')
      }
    } catch { /* cancelled */ }
  }

  const copyHandle = async () => {
    try {
      await navigator.clipboard.writeText(`@${user?.username || ''}`)
      setNotice('Handle copied')
    } catch {}
  }

  type Row = {
    id: string
    icon: any
    title: string
    subtitle?: string
    body?: React.ReactNode
  }

  const rows: Row[] = [
    {
      id: 'payments',
      icon: RupeeIcon,
      title: 'Payments',
      subtitle: undefined,
      body: <p className="text-[13px] text-muted-foreground">Payments aren&apos;t available in Kryzen yet.</p>,
    },
    {
      id: 'subscriptions',
      icon: Star,
      title: 'Subscriptions',
      subtitle: 'Explore premium benefits',
      body: <p className="text-[13px] text-muted-foreground">No subscriptions in Kryzen — every feature is free.</p>,
    },
    {
      id: 'linked',
      icon: MonitorSmartphone,
      title: 'Linked devices',
      subtitle: 'Use Kryzen on other devices',
      body: (
        <div className="space-y-2">
          {sessions.length === 0 && <p className="text-xs text-muted-foreground">No sessions found</p>}
          {sessions.map((s: any) => (
            <div key={s.id} className="flex justify-between items-center gap-2 py-1.5 border-b border-[var(--k-border)]/40 last:border-0">
              <div className="min-w-0">
                <span className="text-xs font-medium">{s.device_info || 'Unknown device'}</span>
                <span className="text-xs text-muted-foreground ml-2">{s.browser_info || ''}</span>
              </div>
              {s.is_current
                ? <span className="text-xs text-muted-foreground shrink-0">✓ Current</span>
                : <button onClick={() => handleDeleteSession(s.id)} className="text-xs px-2 py-0.5 rounded-lg bg-background border border-[var(--k-border)] hover:text-destructive hover:border-destructive/40 transition-colors shrink-0">Revoke</button>}
            </div>
          ))}
          {sessions.length > 1 && (
            <button onClick={async ()=>{ await sessionsApi.logoutOthers(); setSessions(sessions.filter((s:any)=>s.is_current)) }} className="mt-1 w-full py-1.5 rounded-lg bg-background border border-[var(--k-border)] text-xs hover:bg-muted transition-colors">
              Log out other sessions
            </button>
          )}
        </div>
      ),
    },
    {
      id: 'account',
      icon: KeyRound,
      title: 'Account',
      subtitle: 'Security notifications, change password',
      body: (
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium truncate ml-2">{user?.email || '—'}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Verified</span>
            <span className="font-medium">{(user as any)?.email_verified ? 'Yes' : 'Not yet'}</span>
          </div>
          <input type="password" value={currentPwd} onChange={e=>setCurrentPwd(e.target.value)} placeholder="Current password" className="auth-input w-full px-3 py-2 rounded-lg text-sm"/>
          <input type="password" value={newPwd} onChange={e=>setNewPwd(e.target.value)} placeholder="New password (min 6)" className="auth-input w-full px-3 py-2 rounded-lg text-sm"/>
          <button onClick={handleChangePwd} className="auth-submit-btn w-full py-2 rounded-lg text-white text-sm font-medium">Update password</button>
          {pwdMsg && <p className="text-xs text-center p-1.5 rounded-lg bg-background">{pwdMsg}</p>}
        </div>
      ),
    },
    {
      id: 'privacy',
      icon: Lock,
      title: 'Privacy',
      subtitle: 'Blocked accounts, disappearing messages',
      body: (
        <div className="space-y-3">
          <PrivacyQuickSettings />
          <div>
            <p className="text-xs font-medium mb-1.5">Blocked contacts</p>
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
          {showPrivacy ? (
            <div>
              <div className="flex justify-end mb-1">
                <button onClick={()=>setShowPrivacy(false)} className="text-xs px-2 py-1 rounded-lg bg-background border border-[var(--k-border)] hover:bg-muted transition-colors">Close</button>
              </div>
              <PrivacyCenter />
            </div>
          ) : (
            <button onClick={()=>setShowPrivacy(true)} className="w-full text-left rounded-xl border border-[var(--k-border)] p-3 hover:border-[var(--k-primary)]/20 transition-colors">
              <p className="text-sm font-medium">Open Privacy Center</p>
              <p className="text-xs text-muted-foreground">Profile, status and contact visibility</p>
            </button>
          )}
        </div>
      ),
    },
    {
      id: 'lists',
      icon: Contact,
      title: 'Lists',
      subtitle: 'Manage people and groups',
      body: <p className="text-[13px] text-muted-foreground">Manage people from Chats → Contacts, and groups from Chats → ⋮ → New group.</p>,
    },
    {
      id: 'chats',
      icon: MessageSquare,
      title: 'Chats',
      subtitle: 'Chat history, backup',
      body: (
        <div className="space-y-2">
          <ChatSettings />
          <p className="text-[13px] text-muted-foreground">Exports live inside any chat (⋮ → Export). Backups aren&apos;t stored on a server.</p>
        </div>
      ),
    },
    {
      id: 'appearance',
      icon: Palette,
      title: 'Appearance',
      subtitle: 'Chat theme, app icon, app theme',
      body: <AppearanceSettings />,
    },
    {
      id: 'broadcasts',
      icon: Megaphone,
      title: 'Broadcasts',
      subtitle: 'Manage lists and send broadcasts',
      body: <p className="text-[13px] text-muted-foreground">Open Chats → ⋮ → Broadcast lists to manage lists and send broadcasts.</p>,
    },
    {
      id: 'notifications',
      icon: Bell,
      title: 'Notifications',
      subtitle: 'Message, group & call tones',
      body: <NotificationSettings />,
    },
    {
      id: 'storage',
      icon: RefreshCw,
      title: 'Storage and data',
      subtitle: 'Network usage, auto-download',
      body: (
        <div className="space-y-2">
          {storage && (
            <div className="rounded-xl border border-[var(--k-border)] p-3 space-y-1.5">
              <div className="flex justify-between text-xs"><span>Images</span><span>{(storage.images/1024/1024).toFixed(1)} MB</span></div>
              <div className="flex justify-between text-xs"><span>Videos</span><span>{(storage.videos/1024/1024).toFixed(1)} MB</span></div>
              <div className="flex justify-between text-xs"><span>Audio</span><span>{(storage.audio/1024/1024).toFixed(1)} MB</span></div>
              <div className="flex justify-between text-xs"><span>Files</span><span>{(storage.files/1024/1024).toFixed(1)} MB</span></div>
              <div className="border-t border-[var(--k-border)]/40 pt-1.5 flex justify-between text-xs font-medium"><span>Total</span><span>{(storage.total/1024/1024).toFixed(1)} MB</span></div>
            </div>
          )}
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 transition-colors text-sm">
            <Trash className="w-4 h-4" /> Clear local cache
          </button>
          <p className="text-xs text-muted-foreground text-center">Clears local cache, wallpapers, and temp data</p>
        </div>
      ),
    },
    {
      id: 'parental',
      icon: ShieldCheck,
      title: 'Parental controls',
      subtitle: 'Settings for your family',
      body: <AppLockSettings />,
    },
    {
      id: 'accessibility',
      icon: Accessibility,
      title: 'Accessibility',
      subtitle: 'Increase contrast, animation',
      body: (
        <div className="space-y-2">
          <SelectRow
            k="chat_font_size"
            label="Chat font size"
            desc="Message text size in the conversation view"
            options={[
              { id: 'small', label: 'Small' },
              { id: 'medium', label: 'Medium' },
              { id: 'large', label: 'Large' },
            ]}
          />
          <SelectRow
            k="message_density"
            label="Message spacing"
            desc="Comfortable breathes; compact fits more on screen"
            options={[
              { id: 'comfortable', label: 'Comfortable' },
              { id: 'compact', label: 'Compact' },
            ]}
          />
        </div>
      ),
    },
    {
      id: 'language',
      icon: Globe,
      title: 'App language',
      subtitle: "English (device's language)",
      body: <p className="text-[13px] text-muted-foreground">Kryzen currently ships in English. More languages are on the roadmap.</p>,
    },
    {
      id: 'help',
      icon: HelpCircle,
      title: 'Help and feedback',
      subtitle: 'Help centre, contact us, privacy policy',
      body: (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Service</span><span>{buildInfo.service || '…'}</span></div>
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Commit</span><span>{buildInfo.commit || '…'}</span></div>
        </div>
      ),
    },
    {
      id: 'invite',
      icon: Users,
      title: 'Invite a friend',
      subtitle: undefined,
      body: (
        <button onClick={inviteFriend} className="w-full py-2 rounded-xl btn-primary text-sm font-medium">
          Share invite link
        </button>
      ),
    },
    {
      id: 'updates',
      icon: Smartphone,
      title: 'App updates',
      subtitle: undefined,
      body: (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Build</span><span>{buildInfo.commit || '…'}</span></div>
          <button onClick={() => window.location.reload()} className="w-full py-2 rounded-xl bg-background border border-[var(--k-border)] text-sm hover:bg-muted transition-colors">
            Check for updates
          </button>
        </div>
      ),
    },
    {
      id: 'accounts',
      icon: InfinityIcon,
      title: 'Accounts Centre',
      subtitle: 'Control your experience across Kryzen and more',
      body: (
        <div className="space-y-2">
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Signed in as</span><span className="font-medium truncate ml-2">@{user?.username}</span></div>
          <button onClick={async ()=>{ await logout(); window.location.href='/login' }} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-medium bg-destructive/10 border border-destructive/20 hover:bg-destructive/25 transition-colors text-sm">
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </div>
      ),
    },
  ]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) => r.title.toLowerCase().includes(q) || (r.subtitle || '').toLowerCase().includes(q)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sessions, blocked, storage, buildInfo, showPrivacy, currentPwd, newPwd, pwdMsg])

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Top bar */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-[var(--k-border)] shrink-0 bg-background/95 backdrop-blur z-10">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <p className="flex-1 font-bold text-[17px] truncate tracking-tight px-1">{user?.display_name || 'Settings'}</p>
        <button onClick={() => setSearching((v) => !v)} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Search settings">
          <Search className="w-5 h-5" />
        </button>
        <button onClick={() => setShowQr(true)} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="My code">
          <QrCode className="w-5 h-5" />
        </button>
        <button onClick={startEdit} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Edit profile">
          <Pencil className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pb-8">
        {searching && (
          <div className="px-4 py-2 border-b border-[var(--k-border)]">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings…"
              className="w-full px-4 py-2.5 rounded-full bg-elevated border border-medium outline-none text-sm"
            />
          </div>
        )}

        {notice && <p className="px-4 py-2 text-xs text-muted-foreground border-b border-[var(--k-border)]">{notice}</p>}

        {/* Profile header */}
        <div
          className="px-4 pt-4 pb-6 text-center"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.055) 1.2px, transparent 1.2px)',
            backgroundSize: '20px 20px',
          }}
        >
          {user?.about && !editing && (
            <div className="flex justify-center mb-2">
              <div className="relative rounded-2xl bg-elevated border border-subtle px-6 py-2.5 max-w-[85%]">
                <p className="text-[15px] font-semibold tracking-wide">{user.about}</p>
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-elevated border-b border-r border-subtle" />
              </div>
            </div>
          )}
          <div className="flex justify-center mt-3">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt=""
                className="w-36 h-36 rounded-full object-cover ring-2 ring-white/10 shadow-2xl"
              />
            ) : (
              <div className="w-36 h-36 rounded-full gradient-primary flex items-center justify-center text-white text-5xl font-extrabold ring-2 ring-white/10 shadow-2xl">
                {(user?.display_name || user?.username || '?')[0].toUpperCase()}
              </div>
            )}
          </div>
          {!editing ? (
            <>
              <p className="mt-4 text-[22px] font-bold tracking-tight flex items-center justify-center gap-1">
                <span>{user?.display_name || 'Your name'}</span>
                <button onClick={startEdit} className="p-1 rounded-full text-muted-foreground hover:text-secondary" aria-label="Edit profile">
                  <ChevronDown className="w-5 h-5" />
                </button>
              </p>
              <button onClick={copyHandle} className="mt-1 text-[15px] text-muted-foreground flex items-center justify-center gap-1.5 mx-auto uppercase tracking-wide" title="Copy handle">
                @{user?.username || 'handle'} <Copy className="w-3.5 h-3.5 opacity-60" />
              </button>
            </>
          ) : (
            <div className="mt-3 max-w-sm mx-auto space-y-2 text-left">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Display name"
                maxLength={100}
                className="w-full px-3 py-2.5 rounded-xl bg-elevated border border-medium outline-none text-sm text-center"
              />
              <input
                value={editAbout}
                onChange={(e) => setEditAbout(e.target.value)}
                placeholder="About (shown in the bubble)"
                maxLength={140}
                className="w-full px-3 py-2.5 rounded-xl bg-elevated border border-medium outline-none text-sm text-center"
              />
              {profileMsg && <p className="text-xs text-center text-muted-foreground">{profileMsg}</p>}
              <div className="flex gap-2">
                <button onClick={saveProfile} disabled={savingProfile} className="flex-1 py-2 rounded-xl btn-primary text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
                  <Check className="w-4 h-4" /> {savingProfile ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-xl bg-elevated border border-medium text-sm">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rows */}
        <div>
          {filtered.map((r) => {
            const Icon = r.icon
            const isOpen = openRow === r.id
            const divided = r.id === 'accounts'
            return (
              <div key={r.id} className={divided ? 'border-t border-[var(--k-border)]' : undefined}>
                <button
                  onClick={() => setOpenRow(isOpen ? null : r.id)}
                  className="w-full flex items-center gap-5 px-5 py-[18px] text-left hover:bg-muted/40 transition-colors"
                >
                  <Icon className="w-7 h-7 text-tertiary shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[17px] font-semibold leading-snug">{r.title}</span>
                    {r.subtitle && (
                      <span className="block text-sm text-muted-foreground leading-snug mt-1">{r.subtitle}</span>
                    )}
                  </span>
                </button>
                {isOpen && r.body && (
                  <div className="px-5 pb-5 pl-[68px]">
                    <div className="rounded-2xl bg-elevated/60 border border-subtle p-3.5">{r.body}</div>
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No settings match “{query}”.</p>
          )}
        </div>

        <p className="text-center text-xs text-tertiary mt-8 tracking-[0.2em] uppercase">Also from Kryzen</p>
      </div>

      {/* QR / handle modal */}
      {showQr && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setShowQr(false)}>
          <div className="bg-card border border-border rounded-3xl p-6 w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover mx-auto ring-2 ring-[var(--k-border)]" />
            ) : (
              <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center text-white text-2xl font-extrabold mx-auto">
                {(user?.display_name || user?.username || '?')[0].toUpperCase()}
              </div>
            )}
            <p className="mt-2 font-bold">{user?.display_name}</p>
            <p className="text-sm text-muted-foreground">@{user?.username}</p>
            <button onClick={copyHandle} className="mt-3 w-full py-2 rounded-xl bg-elevated border border-medium text-sm font-medium">
              Copy handle
            </button>
            <button onClick={() => setShowQr(false)} className="mt-2 w-full py-2 rounded-xl btn-primary text-sm font-medium flex items-center justify-center gap-1.5">
              <X className="w-4 h-4" /> Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
