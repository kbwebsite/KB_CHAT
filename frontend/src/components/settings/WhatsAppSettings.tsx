import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../../store/auth'
import { useChatStore } from '../../store/chat'
import { useLockStore } from '../../store/lock'
import {
  extendedApi,
  sessionsApi,
  storageApi,
  usersApi,
  blockApi,
  broadcastApi,
  communityApi,
  convApi,
} from '../../services/api'
import { wallpaperStyle, customWallpaperUrl } from '../../utils/wallpapers'
import { useSettingsStore } from '../../store/settings'
import {
  ArrowLeft,
  Search,
  QrCode,
  Pencil,
  X,
  LogOut,
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
  Trash2,
  Check,
  Copy,
  ChevronDown,
  Plus,
  Send,
  Info,
  Download,
} from 'lucide-react'
import PrivacyCenter from '../PrivacyCenter'
import { PwaInstallSection } from '../PwaInstallSection'
import {
  AppearanceSettings,
  NotificationSettings,
  PrivacyQuickSettings,
  ChatSettings,
  AppLockSettings,
  SelectRow,
  ToggleRow,
  SectionLabel,
  DefaultTimerRow,
  LanguagePicker,
} from './shared'

/**
 * Single WhatsApp-structured settings UI shared by SettingsPage (route)
 * and SettingsPanel (in-chat sidebar). Every row expands inline to the
 * real, working controls — existing settings live in their correct
 * category, nothing is a dead mock.
 */

const fieldStyle = {
  background: 'rgba(20,20,42,0.9)',
  borderColor: 'rgba(255,255,255,0.12)',
  color: '#f0f0ff',
  caretColor: '#f0f0ff',
} as const

/* ── Broadcast lists manager (real CRUD + send) ─────────────────── */
function BroadcastManager({ showSend }: { showSend: boolean }) {
  const [lists, setLists] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [usernames, setUsernames] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    broadcastApi
      .list()
      .then((r: any) => {
        if (r?.success) setLists(r.data || [])
      })
      .finally(() => setLoading(false))
  }, [])

  const create = async () => {
    if (!name.trim()) return setMsg('Name your list first')
    const member_usernames = usernames
      .split(/[\s,]+/)
      .map((u) => u.replace(/^@/, '').trim())
      .filter(Boolean)
    if (member_usernames.length === 0) return setMsg('Add at least one @username')
    setCreating(true)
    try {
      const r = await broadcastApi.create({ name: name.trim(), member_usernames })
      if (r?.success) {
        setLists((l) => [r.data, ...l])
        setName('')
        setUsernames('')
        setShowCreate(false)
        setMsg('Broadcast list created')
      } else setMsg(r?.message || 'Failed')
    } catch (e: any) {
      setMsg(e.response?.data?.message || e.response?.data?.detail || 'Failed')
    } finally {
      setCreating(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this broadcast list?')) return
    try {
      await broadcastApi.remove(id)
      setLists((l) => l.filter((x) => x.id !== id))
    } catch (e: any) {
      setMsg(e.response?.data?.message || 'Failed')
    }
  }

  const send = async (id: number) => {
    const content = (drafts[id] || '').trim()
    if (!content || sendingId) return
    setSendingId(id)
    try {
      const r = await broadcastApi.send(id, content)
      if (r?.success) {
        setDrafts((d) => ({ ...d, [id]: '' }))
        setMsg(`Sent to ${r.data?.sent_to?.length ?? 0} chats`)
      } else setMsg(r?.message || 'Failed')
    } catch (e: any) {
      setMsg(e.response?.data?.message || e.response?.data?.detail || 'Failed')
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setShowCreate((v) => !v)}
        className="w-full py-2 rounded-xl bg-background border border-[var(--k-border)] text-xs font-medium hover:bg-muted transition-colors flex items-center justify-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" /> New list
      </button>
      {showCreate && (
        <div className="space-y-2 rounded-xl border border-subtle p-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="List name (e.g. Family)"
            maxLength={100}
            className="w-full px-3 py-2 rounded-xl border outline-none text-sm"
            style={fieldStyle}
          />
          <input
            value={usernames}
            onChange={(e) => setUsernames(e.target.value)}
            placeholder="@usernames, comma separated"
            className="w-full px-3 py-2 rounded-xl border outline-none text-sm"
            style={fieldStyle}
          />
          <button onClick={create} disabled={creating} className="w-full py-2 rounded-xl btn-primary text-sm font-medium disabled:opacity-50">
            {creating ? 'Creating…' : 'Create list'}
          </button>
        </div>
      )}
      {msg && <p className="text-xs text-center text-muted-foreground">{msg}</p>}
      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-3">Loading…</p>
      ) : lists.length === 0 && !showCreate ? (
        <p className="text-xs text-muted-foreground text-center py-2">
          No lists yet — message many people at once, each gets a private 1-1 chat.
        </p>
      ) : (
        lists.map((l) => (
          <div key={l.id} className="rounded-xl border border-subtle p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                {l.name}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[11px] text-muted-foreground">{l.member_count ?? 0} people</span>
                <button onClick={() => remove(l.id)} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-destructive" aria-label="Delete list">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {showSend && (
              <div className="flex gap-2">
                <input
                  value={drafts[l.id] || ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send(l.id)
                    }
                  }}
                  placeholder={`Broadcast to ${l.name}…`}
                  maxLength={4000}
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl border outline-none text-sm"
                  style={fieldStyle}
                />
                <button
                  onClick={() => send(l.id)}
                  disabled={sendingId === l.id || !(drafts[l.id] || '').trim()}
                  className="px-3 rounded-xl btn-primary disabled:opacity-40 shrink-0"
                  aria-label="Send broadcast"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

/* ── Communities quick list (real data + open) ──────────────────── */
function CommunitiesQuickList({ onOpen }: { onOpen: (convId: number) => void }) {
  const [lists, setLists] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    communityApi
      .list()
      .then((r: any) => {
        if (r?.success) setLists(r.data || [])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-xs text-muted-foreground text-center py-2">Loading…</p>
  if (lists.length === 0)
    return (
      <p className="text-xs text-muted-foreground">
        No communities yet — gather related groups under one roof from Chats → ⋮ → Communities.
      </p>
    )
  return (
    <div className="space-y-1">
      {lists.map((c) => (
        <div key={c.id} className="py-1.5 border-b border-[var(--k-border)]/40 last:border-0">
          <p className="text-sm font-semibold truncate">{c.name}</p>
          {(c.groups || []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No groups linked yet.</p>
          ) : (
            (c.groups || []).slice(0, 4).map((g: any) => (
              <button
                key={g.id}
                onClick={() => onOpen(g.id)}
                className="w-full text-left text-xs text-muted-foreground hover:text-secondary truncate py-0.5"
              >
                {g.title || 'Group'} · {g.member_count ?? 0} members →
              </button>
            ))
          )}
        </div>
      ))}
    </div>
  )
}

/* ── Invite section (real share + real contacts) ────────────────── */
function InviteSection() {
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    extendedApi
      .contacts()
      .then((r: any) => {
        if (r?.success) setContacts(r.data || [])
      })
      .finally(() => setLoading(false))
  }, [])

  const link = `${window.location.origin}/signup`

  const shareLink = async () => {
    const text = `Join me on Kryzen: ${link}`
    try {
      if (navigator.share) await navigator.share({ title: 'Kryzen', text })
      else {
        await navigator.clipboard.writeText(text)
        setMsg('Invite link copied')
      }
    } catch { /* cancelled */ }
  }

  const invitePerson = async (u: any) => {
    const text = `Join me on Kryzen, ${u.display_name || u.username}: ${link}`
    try {
      if (navigator.share) await navigator.share({ title: 'Kryzen invite', text })
      else {
        await navigator.clipboard.writeText(text)
        setMsg(`Invite for ${u.display_name || u.username} copied`)
      }
    } catch { /* cancelled */ }
  }

  return (
    <div className="space-y-3">
      <button onClick={shareLink} className="w-full py-2.5 rounded-xl btn-primary text-sm font-medium">
        Share link
      </button>
      {msg && <p className="text-xs text-center text-muted-foreground">{msg}</p>}
      <div>
        <SectionLabel>From contacts</SectionLabel>
        {loading ? (
          <p className="text-xs text-muted-foreground py-2">Loading…</p>
        ) : contacts.length === 0 ? (
          <p className="text-xs text-muted-foreground py-1">No contacts yet — add people from Chats → Contacts.</p>
        ) : (
          contacts.slice(0, 20).map((u: any) => (
            <div key={u.id} className="flex items-center gap-2.5 py-1.5 border-b border-[var(--k-border)]/40 last:border-0">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  (u.display_name || u.username || '?')[0].toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{u.display_name}</p>
                <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
              </div>
              <button
                onClick={() => invitePerson(u)}
                className="text-xs font-semibold text-green-500 hover:text-green-400 shrink-0 px-2 py-1"
              >
                INVITE
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/* ── Locked chats (real, via lock store) ────────────────────────── */
function LockedChats() {
  const lockedIds = useLockStore((s) => s.lockedIds)
  const unlockChat = useLockStore((s) => s.unlockChat)
  const conversations = useChatStore((s: any) => s.conversations)
  const ids = Object.keys(lockedIds || {})
  if (ids.length === 0)
    return (
      <p className="text-xs text-muted-foreground">
        No locked chats. Lock a chat from its header menu — it will ask for your app PIN to open.
      </p>
    )
  const byId = new Map<string, any>((conversations || []).map((c: any) => [String(c.id), c]))
  return (
    <div className="space-y-1">
      {ids.map((id) => {
        const c = byId.get(String(id))
        return (
          <div key={id} className="flex items-center gap-2 py-1.5 border-b border-[var(--k-border)]/40 last:border-0">
            <Lock className="w-3.5 h-3.5 text-tertiary shrink-0" />
            <p className="flex-1 min-w-0 text-sm truncate">{c?.title || `Chat ${id}`}</p>
            <button
              onClick={() => unlockChat(Number(id))}
              className="text-xs px-2.5 py-1 rounded-lg bg-background border border-[var(--k-border)] hover:bg-muted transition-colors shrink-0"
            >
              Unlock
            </button>
          </div>
        )
      })}
    </div>
  )
}

/* ── Static info row (WhatsApp sub-page style, honest when N/A) ──── */
function InfoRow({ title, sub, value }: { title: string; sub?: string; value?: string }) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-medium">{title}</p>
        {value && (
          <span className="text-xs text-muted-foreground uppercase tracking-wide shrink-0">{value}</span>
        )}
      </div>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

/* ── Contacts quick list (real data + start chat) ───────────────── */
function ContactsQuickList({ onOpen }: { onOpen: (convId: number) => void }) {
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    extendedApi
      .contacts()
      .then((r: any) => {
        if (r?.success) setContacts(r.data || [])
      })
      .finally(() => setLoading(false))
  }, [])

  const chat = async (u: any) => {
    if (busyId) return
    setBusyId(u.id)
    try {
      const r: any = await convApi.create({ participant_id: u.id })
      if (r?.success) onOpen(r.data.id)
      else setMsg(r?.message || 'Failed to start chat')
    } catch (e: any) {
      setMsg(e.response?.data?.detail || e.response?.data?.message || 'Failed to start chat')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="text-xs text-muted-foreground text-center py-2">Loading…</p>
  if (contacts.length === 0)
    return (
      <p className="text-xs text-muted-foreground">
        No contacts yet — find people by username from the chat search to start talking.
      </p>
    )
  return (
    <div className="space-y-1">
      {msg && <p className="text-xs text-center text-muted-foreground">{msg}</p>}
      {contacts.slice(0, 15).map((u: any) => (
        <div key={u.id} className="flex items-center gap-2.5 py-1.5 border-b border-[var(--k-border)]/40 last:border-0">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
            {u.avatar_url ? (
              <img src={u.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              (u.display_name || u.username || '?')[0].toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{u.display_name}</p>
            <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
          </div>
          <button
            onClick={() => chat(u)}
            disabled={busyId === u.id}
            className="px-3 py-1.5 rounded-full btn-primary text-[13px] font-semibold shrink-0 disabled:opacity-50"
          >
            {busyId === u.id ? '…' : 'Chat'}
          </button>
        </div>
      ))}
      {contacts.length > 15 && (
        <p className="text-xs text-muted-foreground text-center pt-1">+ {contacts.length - 15} more in the full list</p>
      )}
    </div>
  )
}

/* ── Main shared settings UI ────────────────────────────────────── */
export function WhatsAppSettings({
  layout,
  onBack,
  onLogout,
  onOpenConversation,
}: {
  layout: 'page' | 'panel'
  onBack: () => void
  onLogout: () => void
  onOpenConversation: (convId: number) => void
}) {
  const { user, logout } = useAuthStore() as any
  const chatWallpaper = useSettingsStore((s) => s.chat_wallpaper)
  const setCurrent = useChatStore((s: any) => s.setCurrent)
  const fetchMessages = useChatStore((s: any) => s.fetchMessages)
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState<string | null>(null)
  const [changingPassword, setChangingPassword] = useState(false)
  const [sessions, setSessions] = useState<any[]>([])
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [storage, setStorage] = useState<any>(null)
  const [blocked, setBlocked] = useState<any[] | null>(null)
  const [buildInfo, setBuildInfo] = useState<{ service?: string; version?: string; commit?: string }>({})
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editAbout, setEditAbout] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)

  useEffect(()=>{ sessionsApi.list().then(r=>{ if(r.success) setSessions(r.data) }).catch(()=>{}) }, [])
  useEffect(()=>{ storageApi.dashboard().then(r=>{ if(r.success) setStorage(r.data)}).catch(()=>{}) }, [])
  useEffect(()=>{ blockApi.list().then((r:any)=>{ if (r?.success) setBlocked(r.data || []) }).catch(()=> setBlocked([])) }, [])
  useEffect(()=>{
    fetch('/api/health').then(r=>r.json()).then(j=> setBuildInfo({ service: j?.data?.service, version: j?.data?.version, commit: j?.data?.commit })).catch(()=>{})
  }, [])

  const handleChangePwd = async ()=>{
    setPwdMsg(null)
    if (newPwd.length < 6) { setPwdMsg('New password needs at least 6 characters'); return }
    setChangingPassword(true)
    try {
      const res = await extendedApi.changePassword(currentPwd, newPwd)
      if (res.success) { setPwdMsg('Password updated'); setCurrentPwd(''); setNewPwd('') }
    } catch (e:any) { setPwdMsg(e.response?.data?.detail || e.response?.data?.message || 'Failed') }
    finally { setChangingPassword(false) }
  }

  const handleLogout = async ()=>{
    await logout()
    onLogout()
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

  const startEdit = () => {
    setEditName(user?.display_name || '')
    setEditAbout(user?.about || '')
    setProfileMsg(null)
    setEditing(true)
  }

  const saveProfile = async () => {
    const { setUser } = useAuthStore.getState() as any
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

  const copyHandle = async () => {
    try {
      await navigator.clipboard.writeText(`@${user?.username || ''}`)
      setNotice('Handle copied')
    } catch {}
  }

  const openConversation = async (id: number) => {
    try {
      setCurrent(id)
      await fetchMessages(id)
    } catch {}
    onOpenConversation(id)
  }

  const copyFeedbackInfo = async () => {
    const info = `Kryzen feedback\nService: ${buildInfo.service || '?'}\nVersion: ${buildInfo.version || '?'}\nBuild: ${buildInfo.commit || '?'}\nAccount: @${user?.username || '?'}\n\nDescribe the issue:\n`
    try {
      await navigator.clipboard.writeText(info)
      setFeedbackMsg('Template copied — paste it anywhere to reach us')
    } catch {
      setFeedbackMsg('Copy failed in this browser')
    }
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
      id: 'linked',
      icon: MonitorSmartphone,
      title: 'Linked devices',
      subtitle: 'Use Kryzen on other devices',
      body: (
        <div className="space-y-2">
          <SectionLabel>Device status</SectionLabel>
          {sessions.length === 0 && <p className="text-xs text-muted-foreground">No sessions found</p>}
          {sessions.map((s: any) => (
            <div key={s.id} className="flex justify-between items-center gap-2 py-1.5 border-b border-[var(--k-border)]/40 last:border-0">
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{s.device_info || 'Unknown device'}</p>
                <p className="text-xs text-muted-foreground truncate">{s.browser_info || ''}</p>
              </div>
              {s.is_current
                ? <span className="text-xs text-muted-foreground shrink-0">✓ Current</span>
                : <button onClick={() => handleDeleteSession(s.id)} className="text-xs px-2 py-0.5 rounded-lg bg-background border border-[var(--k-border)] hover:text-destructive hover:border-destructive/40 transition-colors shrink-0">Log out</button>}
            </div>
          ))}
          {sessions.length > 1 && (
            <button onClick={() => sessionsApi.logoutOthers().then(() => setSessions(sessions.filter(s => s.is_current)))} className="mt-1 w-full py-1.5 rounded-lg bg-background border border-[var(--k-border)] text-xs hover:bg-muted transition-colors">
              Log out other sessions
            </button>
          )}
          <p className="text-xs text-muted-foreground flex items-start gap-1.5 pt-1">
            <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
            QR code pairing isn&apos;t available yet — every signed-in browser or app shows up here.
          </p>
        </div>
      ),
    },
    {
      id: 'account',
      icon: KeyRound,
      title: 'Account',
      subtitle: 'Security notifications, change password',
      body: (
        <div className="space-y-3">
          <div>
            <SectionLabel>Add account</SectionLabel>
            <p className="text-xs text-muted-foreground mt-1">One account per device — log out below to switch accounts.</p>
          </div>
          <div>
            <SectionLabel>Login and security</SectionLabel>
            <div className="mt-1 divide-y divide-[var(--k-border)]/40">
              <InfoRow title="Passkeys" sub="Not available yet — your password + app PIN protect this account." />
              <div className="py-1">
                <div className="flex justify-between text-xs gap-2 py-1">
                  <span className="text-muted-foreground shrink-0">Password</span>
                  <span className="font-medium">••••••••</span>
                </div>
                <input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} placeholder="Current password" className="auth-input w-full px-3 py-2 rounded-lg text-sm mt-1" />
                <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="New password (min 6)" className="auth-input w-full px-3 py-2 rounded-lg text-sm mt-1.5" />
                <button onClick={handleChangePwd} className="auth-submit-btn w-full py-2 rounded-lg text-white text-sm font-medium mt-1.5" disabled={changingPassword}>
                  {changingPassword ? 'Updating...' : 'Update password'}
                </button>
                {pwdMsg && <p className="text-xs text-center p-1.5 rounded-lg bg-background mt-1.5">{pwdMsg}</p>}
                <div className="flex justify-between text-xs gap-2 py-1">
                  <span className="text-muted-foreground shrink-0">Email</span>
                  <span className="font-medium truncate ml-2">{user?.email || '—'}{(user as any)?.email_verified ? ' · verified' : ''}</span>
                </div>
              </div>
              <div className="py-1">
                <SectionLabel>Two-step verification</SectionLabel>
                <div className="mt-1">
                  <AppLockSettings />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Your app PIN is Kryzen&apos;s second factor — it gates the app and locked chats.</p>
              </div>
              <InfoRow title="Security notifications" sub="Security alert history isn't available yet." />
            </div>
          </div>
          <div>
            <SectionLabel>Your account</SectionLabel>
            <div className="mt-1 divide-y divide-[var(--k-border)]/40">
              <div className="flex justify-between py-2 gap-2">
                <div>
                  <p className="text-[15px] font-medium">Username</p>
                  <p className="text-xs text-muted-foreground mt-0.5">@{user?.username}</p>
                </div>
              </div>
              <InfoRow title="Change phone number" sub="Kryzen identities are usernames, not phone numbers — there's no number to change." />
              <InfoRow title="Ad preferences in Accounts Centre" sub="Kryzen shows no ads — there's nothing to prefer." />
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-red-500 hover:bg-red-500/10 transition-colors text-sm">
            <LogOut className="w-4 h-4" /> Log out
          </button>
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
          <div>
            <SectionLabel>Who can see my personal info</SectionLabel>
            <div className="mt-1">
              <PrivacyQuickSettings />
            </div>
          </div>
          <div>
            <SectionLabel>Disappearing messages</SectionLabel>
            <div className="mt-1">
              <DefaultTimerRow />
            </div>
          </div>
          <div className="divide-y divide-[var(--k-border)]/40">
            <InfoRow title="Groups" value="Everyone" sub="Per-group privacy isn't available yet." />
            <InfoRow title="Live location" sub="Live location sharing isn't available yet." />
            <InfoRow title="Calls" sub="Silence unknown callers isn't available yet — unknown calls ring normally." />
          </div>
          <div>
            <SectionLabel>Contacts</SectionLabel>
            <div className="mt-1">
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
          </div>
          <div>
            <SectionLabel>App lock</SectionLabel>
            <div className="mt-1">
              <AppLockSettings />
            </div>
          </div>
          <div>
            <SectionLabel>Chat lock</SectionLabel>
            <div className="mt-1">
              <LockedChats />
            </div>
          </div>
          <div>
            <SectionLabel>Advanced</SectionLabel>
            <div className="mt-1 space-y-2">
              <ToggleRow k="link_previews" label="Link previews" desc="Unfurl links into rich cards" />
              <InfoRow title="Allow camera effects" sub="Camera effects aren't available yet." />
            </div>
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
              <p className="text-sm font-medium">Privacy checkup</p>
              <p className="text-xs text-muted-foreground">Control your privacy and choose the right settings for you</p>
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
      body: (
        <div className="space-y-3">
          <div>
            <SectionLabel>People</SectionLabel>
            <div className="mt-1">
              <ContactsQuickList onOpen={openConversation} />
            </div>
          </div>
          <div>
            <SectionLabel>Your lists</SectionLabel>
            <div className="mt-1">
              <BroadcastManager showSend={false} />
            </div>
          </div>
          <div>
            <SectionLabel>Communities</SectionLabel>
            <div className="mt-1">
              <CommunitiesQuickList onOpen={openConversation} />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'chats',
      icon: MessageSquare,
      title: 'Chats',
      subtitle: 'Chat history, backup',
      body: (
        <div className="space-y-3">
          <div>
            <SectionLabel>Chat settings</SectionLabel>
            <div className="mt-1 space-y-2">
              <ToggleRow k="enter_to_send" label="Enter is send" desc="Enter key will send your message" />
              <ToggleRow k="media_auto_download" label="Media visibility" desc="Show newly downloaded media inline" />
              <SelectRow
                k="chat_font_size"
                label="Font size"
                desc="Message text size in the conversation view"
                options={[
                  { id: 'small', label: 'Small' },
                  { id: 'medium', label: 'Medium' },
                  { id: 'large', label: 'Large' },
                ]}
              />
              <ToggleRow k="typing_indicators" label="Typing indicators" desc="Send and show “typing…” states" />
              <InfoRow title="Voice message transcripts" sub="Transcripts aren't available yet." />
              <InfoRow title="Sticker suggestions" sub="Suggestions while typing aren't available yet." />
            </div>
          </div>
          <div>
            <SectionLabel>Archived chats</SectionLabel>
            <InfoRow title="Keep chats archived" sub="Archived chats stay archived in the chat list — open one to unarchive it." />
          </div>
          <div>
            <SectionLabel>Chat backup</SectionLabel>
            <InfoRow title="Chat backup" sub="Kryzen doesn't upload backups anywhere yet — your history stays on your devices." />
            <InfoRow title="Transfer chats" sub="Chat transfer between devices isn't available yet." />
          </div>
        </div>
      ),
    },
    {
      id: 'appearance',
      icon: Palette,
      title: 'Appearance',
      subtitle: 'Chat theme, app icon, app theme',
      body: (
        <div className="space-y-3">
          <div>
            <SectionLabel>Default chat theme</SectionLabel>
            <div className="mt-1.5 flex items-center gap-3">
              <span
                className="w-10 h-10 rounded-lg border border-subtle shrink-0 bg-cover bg-center"
                style={
                  chatWallpaper === 'custom' && customWallpaperUrl()
                    ? { backgroundImage: `url(${customWallpaperUrl()})` }
                    : wallpaperStyle(chatWallpaper)
                }
              />
              <p className="text-xs text-muted-foreground">Your current wallpaper, live in every chat. Change it below.</p>
            </div>
          </div>
          <AppearanceSettings />
          <InfoRow title="App icon" sub="Custom app icons aren't available on web yet." />
        </div>
      ),
    },
    {
      id: 'broadcasts',
      icon: Megaphone,
      title: 'Broadcasts',
      subtitle: 'Manage lists and send broadcasts',
      body: <BroadcastManager showSend />,
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
        <div className="space-y-3">
          <div>
            <SectionLabel>Manage storage</SectionLabel>
            {storage ? (
              <div className="mt-1.5 rounded-xl border border-[var(--k-border)] p-3 space-y-1.5">
                <div className="flex justify-between text-xs"><span>Images</span><span>{(storage.images/1024/1024).toFixed(1)} MB</span></div>
                <div className="flex justify-between text-xs"><span>Videos</span><span>{(storage.videos/1024/1024).toFixed(1)} MB</span></div>
                <div className="flex justify-between text-xs"><span>Audio</span><span>{(storage.audio/1024/1024).toFixed(1)} MB</span></div>
                <div className="flex justify-between text-xs"><span>Files</span><span>{(storage.files/1024/1024).toFixed(1)} MB</span></div>
                <div className="border-t border-[var(--k-border)]/40 pt-1.5 flex justify-between text-xs font-medium"><span>Total</span><span>{(storage.total/1024/1024).toFixed(1)} MB</span></div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">Measuring…</p>
            )}
            <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 transition-colors text-sm">
              <Trash className="w-4 h-4" /> Clear local cache
            </button>
          </div>
          <div>
            <SectionLabel>Network usage</SectionLabel>
            <p className="text-xs text-muted-foreground mt-1">Per-chat network stats aren&apos;t tracked yet.</p>
            <InfoRow title="Use less data for calls" sub="Calls are peer-to-peer — there's no saver mode yet." />
            <InfoRow title="Proxy" value="Off" sub="Proxy support isn't available yet." />
          </div>
          <div>
            <SectionLabel>Media upload quality</SectionLabel>
            <InfoRow title="Media upload quality" value="Original" sub="Uploads always send at original quality." />
          </div>
          <div>
            <SectionLabel>Auto-download quality</SectionLabel>
            <InfoRow title="Auto-download quality" value="Auto" sub="Quality follows the master switch below." />
            <div className="mt-1">
              <ToggleRow k="media_auto_download" label="Auto-download media" desc="Voice notes always download automatically" />
            </div>
          </div>
          <div>
            <SectionLabel>Media auto-download</SectionLabel>
            <p className="text-xs text-muted-foreground mt-1">One switch covers mobile data, Wi-Fi and roaming.</p>
          </div>
        </div>
      ),
    },
    {
      id: 'parental',
      icon: ShieldCheck,
      title: 'Parental controls',
      subtitle: 'Settings for your family',
      body: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">There are no separate parental controls — family safety lives in Privacy → App lock.</p>
          <button
            onClick={() => setOpenRow('privacy')}
            className="w-full py-2 rounded-xl btn-primary text-sm font-medium"
          >
            Open Privacy → App lock
          </button>
        </div>
      ),
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
            label="Increase text size"
            desc="Large message text is easier to read"
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
          <p className="text-xs text-muted-foreground">A dedicated high-contrast mode and sticker-animation control aren&apos;t here yet.</p>
        </div>
      ),
    },
    {
      id: 'language',
      icon: Globe,
      title: 'App language',
      subtitle: "English (device's language)",
      body: <LanguagePicker />,
    },
    {
      id: 'help',
      icon: HelpCircle,
      title: 'Help and feedback',
      subtitle: 'Help centre, contact us, privacy policy',
      body: (
        <div className="space-y-3">
          <div>
            <SectionLabel>Help centre</SectionLabel>
            <p className="text-xs text-muted-foreground mt-1">New chats, groups, broadcasts, channels and communities all live under Chats → ⋮. Everything here saves instantly.</p>
            <button onClick={copyFeedbackInfo} className="mt-2 w-full py-2 rounded-xl bg-background border border-[var(--k-border)] text-sm hover:bg-muted transition-colors">
              Copy debug info
            </button>
            {feedbackMsg && <p className="text-xs text-center text-muted-foreground mt-1">{feedbackMsg}</p>}
          </div>
          <div>
            <SectionLabel>Send feedback</SectionLabel>
            <p className="text-xs text-muted-foreground mt-1">Copy the template above and send it to us wherever you reach the Kryzen team.</p>
          </div>
          <div>
            <SectionLabel>Terms and privacy policy</SectionLabel>
            <p className="text-xs text-muted-foreground mt-1">Kryzen keeps your messages between you and the people you send them to. No ads, no message selling, no phone-number directory.</p>
          </div>
          <div>
            <SectionLabel>Channel reports</SectionLabel>
            <p className="text-xs text-muted-foreground mt-1">Nothing to review — channel reporting isn&apos;t available yet.</p>
          </div>
          <div>
            <SectionLabel>App info</SectionLabel>
            <div className="mt-1 space-y-1.5">
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Service</span><span>{buildInfo.service || '…'}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Version</span><span>{buildInfo.version || '…'}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Commit</span><span>{buildInfo.commit || '…'}</span></div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'invite',
      icon: Users,
      title: 'Invite a friend',
      subtitle: undefined,
      body: <InviteSection />,
    },
    {
      id: 'updates',
      icon: Smartphone,
      title: 'App updates',
      subtitle: undefined,
      body: (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Version</span><span>{buildInfo.version || '…'}</span></div>
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Build</span><span>{buildInfo.commit || '…'}</span></div>
          <button onClick={() => window.location.reload()} className="w-full py-2 rounded-xl bg-background border border-[var(--k-border)] text-sm hover:bg-muted transition-colors">
            Check for updates
          </button>
          <p className="text-xs text-muted-foreground text-center">The web app updates itself on every deploy — reloading pulls the latest build.</p>
        </div>
      ),
    },
    {
      id: 'install',
      icon: Download,
      title: 'Install app',
      subtitle: 'Home-screen app with offline shell',
      body: <PwaInstallSection />,
    },
    {
      id: 'accounts',
      icon: InfinityIcon,
      title: 'Accounts Centre',
      subtitle: 'Control your experience across Kryzen and more',
      body: (
        <div className="space-y-3">
          <div>
            <SectionLabel>Profiles and personal details</SectionLabel>
            <div className="mt-1.5 flex items-center gap-3">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-[var(--k-border)] shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-white text-lg font-extrabold shrink-0">
                  {(user?.display_name || user?.username || '?')[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{user?.display_name}</p>
                <p className="text-xs text-muted-foreground truncate">@{user?.username}</p>
              </div>
            </div>
          </div>
          <div>
            <SectionLabel>Your information</SectionLabel>
            <div className="mt-1 space-y-1.5">
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Email</span><span className="font-medium truncate ml-2">{user?.email || '—'}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Verified</span><span className="font-medium">{(user as any)?.email_verified ? 'Yes' : 'Not yet'}</span></div>
            </div>
          </div>
          <div>
            <SectionLabel>Manage accounts</SectionLabel>
            <div className="mt-1 space-y-2">
              {sessions.length > 1 && (
                <button onClick={() => sessionsApi.logoutOthers().then(() => setSessions(sessions.filter(s => s.is_current)))} className="w-full py-2 rounded-xl bg-background border border-[var(--k-border)] text-sm hover:bg-muted transition-colors">
                  Log out other sessions
                </button>
              )}
              <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-medium bg-destructive/10 border border-destructive/20 hover:bg-destructive/25 transition-colors text-sm">
                <LogOut className="w-4 h-4" /> Log out
              </button>
              <p className="text-xs text-muted-foreground text-center">One account per device — log out to switch accounts.</p>
            </div>
          </div>
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
  }, [query, sessions, blocked, storage, buildInfo, showPrivacy, currentPwd, newPwd, pwdMsg, feedbackMsg])

  const scrollClass = layout === 'page' ? 'min-h-screen bg-background' : 'h-full flex flex-col bg-card'
  const contentClass = layout === 'page' ? 'max-w-3xl mx-auto pb-10' : 'flex-1 overflow-y-auto min-h-0 pb-8'

  return (
    <div className={scrollClass}>
      <div className={layout === 'page' ? contentClass : 'flex flex-col h-full min-h-0'}>
        {/* Top bar */}
        <div className="flex items-center gap-1 px-2 py-2 border-b border-[var(--k-border)] sticky top-0 bg-background/95 backdrop-blur z-10 shrink-0">
          <button onClick={onBack} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Back">
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

        <div className={layout === 'page' ? undefined : 'flex-1 overflow-y-auto min-h-0 pb-8'}>
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
              <div className="rounded-full gradient-primary p-[3px] shadow-2xl">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    className="w-36 h-36 rounded-full object-cover ring-2 ring-black/40"
                  />
                ) : (
                  <div className="w-36 h-36 rounded-full bg-card flex items-center justify-center text-white text-5xl font-extrabold ring-2 ring-black/40">
                    {(user?.display_name || user?.username || '?')[0].toUpperCase()}
                  </div>
                )}
              </div>
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
                    <Icon className={`w-7 h-7 shrink-0 transition-colors ${isOpen ? 'text-primary' : 'text-tertiary'}`} />
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[17px] font-semibold leading-snug transition-colors ${isOpen ? 'text-primary' : ''}`}>{r.title}</span>
                      {r.subtitle && (
                        <span className="block text-sm text-muted-foreground leading-snug mt-1">{r.subtitle}</span>
                      )}
                    </span>
                  </button>
                  {isOpen && r.body && (
                    <div className="px-5 pb-5 pl-[68px]">
                      <div className="settings-detail-enter rounded-2xl bg-elevated/60 border border-subtle p-3.5">{r.body}</div>
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
