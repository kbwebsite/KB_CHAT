import { memo, useEffect, useState, type ReactNode } from 'react'
import { Conversation } from '../types'
import { formatTime, initials } from '../utils/format'
import { prettyPreview } from '../utils/messageEffects'
import { Users, Pin, BellOff, Archive, Check, CheckCheck, MessageSquare, Lock, MoreVertical, Bell } from 'lucide-react'
import { useSettingsStore } from '../store/settings'
import { convApi, extendedApi } from '../services/api'
import { useLongPress } from '../hooks/useDismiss'
import { useLockStore } from '../store/lock'
import { LockScreen } from './LockScreen'

const avatarGradients = [
  'linear-gradient(135deg, #6366f1, #8b5cf6)',
  'linear-gradient(135deg, #ec4899, #8b5cf6)',
  'linear-gradient(135deg, #06b6d4, #3b82f6)',
  'linear-gradient(135deg, #f43f5e, #ec4899)',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #10b981, #06b6d4)',
]

function getAvatarGradient(id: number) {
  return avatarGradients[id % avatarGradients.length]
}

function ConversationItemInner({ conv, active, onClick, isTyping, currentUserId, onPin, onMute, onArchive }: {
  conv: Conversation, active: boolean, onClick: () => void, isTyping?: boolean, currentUserId?: number, onPin?: (id: number) => void, onMute?: (id: number) => void, onArchive?: (id: number) => void
}) {
  const isGroup = conv.is_group
  const title = conv.title || 'Unknown'
  const avatar = conv.avatar_url
  const last = conv.last_message
  const hasUnread = conv.unread_count > 0
  const isPinned = (conv as any).is_pinned
  const isMuted = (conv as any).is_muted
  const isArchived = (conv as any).is_archived
  const isOwnLast = last?.sender_id === currentUserId
  const showTypingIndicators = useSettingsStore(s => s.typing_indicators)
  const typing = isTyping && showTypingIndicators

  return (
    <div
      className={`conv-item ${active ? 'active' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
    >
      <div className={`conv-avatar ${!isGroup && (conv.members || []).some(m => m.user_id !== currentUserId && m.is_online) ? 'online' : !isGroup && (conv.members || []).some(m => m.user_id !== currentUserId) ? 'offline' : ''}`}
        style={{ background: avatar ? 'none' : getAvatarGradient(conv.id), boxShadow: '0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)' }}>
        {avatar ? (
          <img src={avatar} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover rounded-[16px]" />
        ) : isGroup ? (
          <Users className="w-5 h-5 text-white" />
        ) : (
          <span className="text-sm font-bold text-white">{initials(title)}</span>
        )}
      </div>
      <div className="conv-content">
        <div className="conv-top-row">
          <span className="conv-name">
            {title}
            {isMuted && <BellOff className="w-3 h-3 opacity-40 inline ml-1" />}
            {isPinned && <Pin className="w-3 h-3 opacity-40 inline ml-1" />}
          </span>
          <span className="conv-time">
            {isOwnLast && last && <CheckCheck className="w-3.5 h-3.5 inline mr-0.5 text-accent-primary" />}
            {last ? formatTime(last.created_at) : ''}
          </span>
        </div>
        <div className="conv-bottom-row">
          <span className={`conv-preview ${typing ? 'conv-typing' : ''}`}>
            {typing ? 'typing...' : last ? (isGroup && !isOwnLast && last.sender_username ? `${last.sender_username}: ` : '') + (prettyPreview(last.content)?.slice(0, 45) || '📎 Attachment') : isGroup ? `${(conv.members || []).length} members` : 'Start conversation'}
          </span>
          {hasUnread && (
            <span className={`conv-unread ${isMuted ? 'opacity-60' : ''}`}>
              {conv.unread_count > 99 ? '99+' : conv.unread_count}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// Row-level memo: callbacks (onClick/onPin/...) are inline per render, but
// they only forward stable store actions + the row id, so rendering is
// decided by data props alone. Unchanged rows skip rerenders when a message
// lands in a different conversation or presence ticks elsewhere.
export const ConversationItem = memo(ConversationItemInner, (prev, next) =>
  prev.conv === next.conv &&
  prev.active === next.active &&
  prev.isTyping === next.isTyping &&
  prev.currentUserId === next.currentUserId
)

/**
 * Per-row actions menu (PE-1E). Only exposes actions the app supports:
 * pin, mute, archive — all plumbed through existing handlers. Nothing
 * destructive lives here, so no confirmation is needed.
 */
function RowMenu({ conv, onPin, onArchive, onChanged, onClose }: {
  conv: any; onPin?: (id: number) => void; onArchive?: (id: number) => void; onChanged?: () => void; onClose: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const muted = !!conv.is_muted
  const pinned = !!conv.is_pinned
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const run = async (key: string, fn: () => void | Promise<any>) => {
    setBusy(key)
    setErr(null)
    try {
      await fn()
      onChanged?.()
      onClose()
    } catch {
      setErr('Action failed — try again')
    } finally {
      setBusy(null)
    }
  }
  const itemCls = 'w-full text-left px-3 py-2.5 hover:bg-muted flex items-center gap-2.5 text-sm min-h-[44px] disabled:opacity-50'
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div role="menu" aria-label="Conversation actions" className="absolute right-1 top-9 z-50 w-48 rounded-xl border border-border bg-card shadow-xl py-1">
        <button role="menuitem" disabled={!!busy} onClick={() => run('pin', () => onPin?.(conv.id))} className={itemCls}>
          <Pin className="w-4 h-4 text-muted-foreground" /> {busy === 'pin' ? 'Working…' : pinned ? 'Unpin' : 'Pin'}
        </button>
        <button role="menuitem" disabled={!!busy} onClick={() => run('mute', () => extendedApi.mute(conv.id, !muted))} className={itemCls}>
          {muted ? <Bell className="w-4 h-4 text-muted-foreground" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}
          {busy === 'mute' ? 'Working…' : muted ? 'Unmute' : 'Mute'}
        </button>
        <button role="menuitem" disabled={!!busy} onClick={() => run('archive', () => onArchive?.(conv.id))} className={itemCls}>
          <Archive className="w-4 h-4 text-muted-foreground" /> {busy === 'archive' ? 'Working…' : 'Archive'}
        </button>
        {err && <p role="alert" className="px-3 py-1.5 text-xs text-destructive">{err}</p>}
      </div>
    </>
  )
}

/**
 * Long-press wrapper: opens the SAME row menu as the ⋯ button (no second
 * action model). Tap, scroll, links and buttons are unaffected — press
 * cancels on movement, release, or before the threshold.
 */
function PressableRow({ onLongPress, children }: {
  onLongPress: () => void
  children: ReactNode
}) {
  const { handlers } = useLongPress({ onLongPress })
  return (
    <div
      key={undefined}
      className="relative group"
      style={{ touchAction: 'pan-x pan-y' }}
      {...handlers}
    >
      {children}
    </div>
  )
}

export function ConversationList({ conversations, activeId, onSelect, search, onSearch, typingMap, currentUserId, onPin, onArchive, onMute, loading, onChanged, emptyHint }: {
  conversations: Conversation[], activeId: number | null, onSelect: (id: number) => void, search: string, onSearch: (v: string) => void, typingMap?: Record<number, Set<number>>, currentUserId?: number, onPin?: (id: number) => void, onArchive?: (id: number) => void, onMute?: (id: number) => void, loading?: boolean, onChanged?: () => void, emptyHint?: { title: string; text: string; actionLabel?: string; onAction?: () => void }
}) {
  const lockedIds = useLockStore((s) => s.lockedIds)
  const chatsRevealed = useLockStore((s) => s.chatsRevealed)
  const unlocked = useLockStore((s) => s.unlocked)
  const setChatsRevealed = useLockStore((s) => s.setChatsRevealed)
  const [lockPrompt, setLockPrompt] = useState(false)
  // PIN verified while the prompt is open -> reveal locked chats for this session.
  useEffect(() => {
    if (lockPrompt && unlocked) {
      setChatsRevealed(true)
      setLockPrompt(false)
    }
  }, [lockPrompt, unlocked, setChatsRevealed])
  const [archived, setArchived] = useState<any[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const loadArchived = () => {
    convApi
      .list(undefined, { include_archived: true })
      .then((r: any) => {
        if (r?.success) setArchived((r.data || []).filter((c: any) => c.is_archived))
      })
      .catch(() => {})
  }
  useEffect(() => {
    loadArchived()
  }, [])
  const unarchive = (id: number) => {
    convApi
      .archive(id, false)
      .then(() => {
        loadArchived()
        onChanged?.()
      })
      .catch(() => {})
  }
  const openArchived = () => {
    loadArchived()
    setShowArchived(true)
  }
  const hiddenLocked = chatsRevealed ? [] : conversations.filter((c) => lockedIds.includes(c.id))
  const visible = chatsRevealed ? conversations : conversations.filter((c) => !lockedIds.includes(c.id))
  const hiddenUnread = hiddenLocked.reduce((n, c) => n + (c.unread_count || 0), 0)
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="conv-list flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {lockPrompt && (
          <div className="fixed inset-0 z-[90]">
            <LockScreen />
          </div>
        )}
        {showArchived ? (
          <>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border sticky top-0 bg-card z-10">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Archive className="w-4 h-4 text-muted-foreground" /> Archived
              </p>
              <button onClick={() => setShowArchived(false)} className="text-xs text-primary font-medium px-2 py-1">
                Done
              </button>
            </div>
            {archived.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No archived chats</p>
            ) : (
              archived.map((c) => (
                <div key={c.id} className="flex items-center gap-1 pr-2">
                  <div className="flex-1 min-w-0">
                    <ConversationItem
                      conv={c}
                      active={c.id === activeId}
                      onClick={() => onSelect(c.id)}
                      isTyping={!!typingMap?.[c.id]?.size}
                      currentUserId={currentUserId}
                    />
                  </div>
                  <button
                    onClick={() => unarchive(c.id)}
                    className="text-[11px] px-2 py-1 rounded-lg bg-muted hover:bg-accent text-muted-foreground shrink-0"
                    title="Unarchive chat"
                  >
                    Unarchive
                  </button>
                </div>
              ))
            )}
          </>
        ) : loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-[52px] h-[52px] rounded-[16px] bg-elevated" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3.5 w-28 rounded bg-elevated" />
                  <div className="h-3 w-full rounded bg-elevated" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 && hiddenLocked.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <MessageSquare className="w-7 h-7" />
            </div>
            <p className="empty-state-title">{emptyHint?.title || 'No conversations yet'}</p>
            <p className="empty-state-text">{emptyHint?.text || 'Search for users to start chatting'}</p>
            {emptyHint?.actionLabel && emptyHint?.onAction && (
              <button onClick={emptyHint.onAction} className="mt-3 px-4 py-2.5 rounded-xl btn-primary text-sm font-bold min-h-[44px]">
                {emptyHint.actionLabel}
              </button>
            )}
          </div>
        ) : (
          <>
            {archived.length > 0 && (
              <button
                onClick={openArchived}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors text-left border-b border-border/50"
              >
                <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Archive className="w-4 h-4 text-muted-foreground" />
                </span>
                <span className="flex-1 text-sm font-medium">Archived</span>
                <span className="text-xs text-muted-foreground">{archived.length}</span>
              </button>
            )}
            {visible.map(c => (
              <PressableRow key={c.id} onLongPress={() => setMenuFor(c.id)}>
                <ConversationItem
                  conv={c}
                  active={c.id === activeId}
                  onClick={() => onSelect(c.id)}
                  isTyping={!!typingMap?.[c.id]?.size}
                  currentUserId={currentUserId}
                  onPin={onPin}
                  onMute={onMute}
                  onArchive={onArchive}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === c.id ? null : c.id) }}
                  aria-label={`Actions for ${c.title || 'conversation'}`}
                  aria-haspopup="menu"
                  aria-expanded={menuFor === c.id}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 transition"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {menuFor === c.id && (
                  <RowMenu conv={c} onPin={onPin} onArchive={onArchive} onChanged={onChanged} onClose={() => setMenuFor(null)} />
                )}
              </PressableRow>
            ))}
            {hiddenLocked.length > 0 && (
              <button
                onClick={() => setLockPrompt(true)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left"
              >
                <span className="w-[52px] h-[52px] rounded-[16px] bg-muted flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5 text-muted-foreground" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium">Locked chats</span>
                  <span className="block text-xs text-muted-foreground">
                    {hiddenLocked.length} hidden{hiddenUnread > 0 ? ` • ${hiddenUnread} unread` : ''} — tap to unlock
                  </span>
                </span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
