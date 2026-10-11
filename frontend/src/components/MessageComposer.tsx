import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Smile, Paperclip, X, Eye, Sparkles, Gamepad2, Plus, Camera, Navigation, Video, Pencil, Wand2, Undo2, Plane } from 'lucide-react'
import { MemeMaker } from './MemeMaker'
import { CameraModal } from './CameraModal'
import { VideoNoteRecorder } from './VideoNoteRecorder'
import { DoodlePad } from './DoodlePad'
import { MediaSheet, type MediaTab } from './MediaSheet'
import { fireEffect, withFxMarker, EFFECT_OPTIONS, type EffectKind } from '../utils/messageEffects'
import { useAuthStore } from '../store/auth'
import type { EmojiClickData } from 'emoji-picker-react'
import wsService from '../services/websocket'
import { VoiceRecorder } from './VoiceRecorder'
import { uploadApi, liveLocationApi, aiApi } from '../services/api'
import { startLiveTracking } from '../utils/liveLocation'
import { useSettingsStore } from '../store/settings'
export function MessageComposer({ onSend, onTyping, conversationId, replyTo, onCancelReply, disabled }: {
  onSend: (content: string, attachmentIds?: number[], type?: string, voiceDuration?: number, opts?: { view_once?: boolean, passport?: boolean }) => void,
  onTyping: (isTyping: boolean) => void,
  conversationId: number,
  replyTo?: { id: number; content: string; sender: string } | null,
  onCancelReply: () => void,
  disabled?: boolean,
}) {
  const [text, setText] = useState('')
  const [viewOnce, setViewOnce] = useState(false)
  const [passport, setPassport] = useState(false)
  const [effect, setEffect] = useState<EffectKind | null>(null)
  const [showEffects, setShowEffects] = useState(false)
  const [showMedia, setShowMedia] = useState(false)
  const [mediaTab, setMediaTab] = useState<MediaTab>('emoji')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [showGames, setShowGames] = useState(false)
  const [showWatchInput, setShowWatchInput] = useState(false)
  const [watchUrl, setWatchUrl] = useState('')
  const [showLive, setShowLive] = useState(false)
  const [sharingLive, setSharingLive] = useState(false)
  const [memeFile, setMemeFile] = useState<File | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [showVideoNote, setShowVideoNote] = useState(false)
  const [showDoodle, setShowDoodle] = useState(false)
  const [showRewrite, setShowRewrite] = useState(false)
  const [rewriteBusy, setRewriteBusy] = useState(false)
  const [canUndoRewrite, setCanUndoRewrite] = useState(false)
  const lastOrigRef = useRef<string | null>(null)

  const REWRITE_MODES = [
    { id: 'polite', label: 'Make polite', emoji: '🙏', prompt: 'Rewrite the following message to sound polite and friendly' },
    { id: 'shorten', label: 'Shorten', emoji: '✂️', prompt: 'Rewrite the following message to be shorter and punchier' },
    { id: 'grammar', label: 'Fix grammar', emoji: '📝', prompt: 'Fix the spelling and grammar of the following message' },
  ]

  const rewriteDraft = async (modeId: string) => {
    const mode = REWRITE_MODES.find((m) => m.id === modeId)
    if (!mode || rewriteBusy) return
    const original = text.trim()
    if (!original) {
      setUploadError('Type something first, then rewrite it.')
      setShowRewrite(false)
      return
    }
    setShowRewrite(false)
    setRewriteBusy(true)
    try {
      const st: any = await aiApi.status().catch(() => null)
      if (!st?.success || !st?.data?.live) {
        setUploadError('Rewrite needs AI — no key configured. Ask your admin.')
        return
      }
      const res: any = await aiApi.chat(
        `${mode.prompt}. Reply with ONLY the rewritten text, no quotes, no commentary:\n\n${original.slice(0, 1000)}`,
      )
      let out = (res?.data?.reply || '').trim().replace(/^["'“”]+|["'“”]+$/g, '').trim()
      if (!out) throw new Error('Empty rewrite')
      lastOrigRef.current = original
      setText(out)
      writeDraft(conversationId, out)
      requestAnimationFrame(() => autoResize())
      setCanUndoRewrite(true)
    } catch (err: any) {
      setUploadError(err.response?.data?.message || err.message || 'Rewrite failed.')
    } finally {
      setRewriteBusy(false)
    }
  }

  const undoRewrite = () => {
    if (lastOrigRef.current != null) {
      setText(lastOrigRef.current)
      writeDraft(conversationId, lastOrigRef.current)
      requestAnimationFrame(() => autoResize())
    }
    lastOrigRef.current = null
    setCanUndoRewrite(false)
  }
  const { user } = useAuthStore()

  // Sub-popups (effects/games/live) and the ＋ sheet dismiss together.
  const closeSubPopups = () => { setShowEffects(false); setShowGames(false); setShowLive(false); setShowRewrite(false) }
  const closeMore = () => { setShowMore(false); closeSubPopups() }
  // One unified media sheet (emoji/GIF/sticker/meme tabs).
  const openMedia = (t: MediaTab) => {
    if (showMedia && mediaTab === t) setShowMedia(false)
    else { setMediaTab(t); setShowMedia(true) }
    closeSubPopups()
    setShowMore(false)
  }

  const sendChallenge = (kind: 'ttt' | 'rps' | 'c4' | 'emoji' | 'chess' | 'tod' | 'wc' | 'mys') => {
    const name = user?.display_name || user?.username || 'Someone'
    if (kind === 'rps') {
      onSend(`🎮RPS:new\n${name} started rock-paper-scissors — tap your throw!`, undefined, 'text')
    } else if (kind === 'c4') {
      onSend(`🎮C4:new\n${name} started Connect Four — tap a column to drop!`, undefined, 'text')
    } else if (kind === 'emoji') {
      onSend(`🎮EMOJI:new\n${name} started an emoji movie game — guess the movie!`, undefined, 'text')
    } else if (kind === 'chess') {
      onSend(`🎮CHESS:new\n${name} started chess — you play Black, good luck!`, undefined, 'text')
    } else if (kind === 'tod') {
      onSend(`🎮TOD:new\n${name} started truth or dare — spin the wheel!`, undefined, 'text')
    } else if (kind === 'wc') {
      onSend(`🎮WC:new\n${name} started a word chain — drop the first word!`, undefined, 'text')
    } else if (kind === 'mys') {
      const packs = ['manor', 'train', 'ship']
      const pack = packs[Math.floor(Math.random() * packs.length)]
      onSend(`🎮MYS:new:${pack}\n${name} started a murder mystery — who did it? 🕯️`, undefined, 'text')
    } else {
      onSend(`🎮TTT:new\n${name} started tic-tac-toe — tap a square to join as O!`, undefined, 'text')
    }
    setShowGames(false)
  }

  const sendWatchRoom = () => {
    const url = watchUrl.trim()
    if (!/^https?:\/\/\S+/i.test(url)) {
      setUploadError('Paste a YouTube or mp4 link first.')
      return
    }
    const name = user?.display_name || user?.username || 'Someone'
    onSend(`🎮WT:new\n${url}\n${name} started a watch party — press play together!`, undefined, 'text')
    setWatchUrl('')
    setShowWatchInput(false)
    setShowGames(false)
  }

  // Extra actions: inline on desktop, behind ＋ on mobile.
  const renderExtras = () => (
    <>
      {/* View-once: burns after first view (1-1 text only) */}
      <button
        onClick={() => setViewOnce(v => !v)}
        className="composer-action-btn"
        aria-label="View once"
        title={viewOnce ? 'View-once ON: message deletes after first view' : 'Send as view-once'}
        style={viewOnce ? { color: 'var(--accent-secondary)', background: 'var(--accent-subtle)' } : undefined}
      >
        <Eye className="w-5 h-5" />
      </button>
      {/* Passport: forward-once chain with a visible journey */}
      <button
        onClick={() => setPassport(v => !v)}
        className="composer-action-btn"
        aria-label="Passport message"
        title={passport ? 'Passport ON: each hand forwards it exactly once' : 'Send as passport (forward-once chain)'}
        style={passport ? { color: 'var(--accent-secondary)', background: 'var(--accent-subtle)' } : undefined}
      >
        <Plane className="w-5 h-5" />
      </button>
      {/* Send-with-effect picker */}
      <div className="relative">
        <button
            onClick={() => { setShowEffects(v => !v); setShowMedia(false); setShowGames(false); setShowLive(false) }}
          className="composer-action-btn"
          aria-label="Send with effect"
          title={effect ? `Effect: ${effect} (tap to change)` : 'Send with effect'}
          style={effect ? { color: 'var(--accent-secondary)', background: 'var(--accent-subtle)' } : undefined}
        >
          <Sparkles className="w-5 h-5" />
        </button>
        {showEffects && (
          <div className="fixed left-1/2 -translate-x-1/2 bottom-40 z-40 w-52 max-w-[calc(100vw-24px)] rounded-2xl border bg-card p-1.5 shadow-xl">
            <button
              onClick={() => { setEffect(null); setShowEffects(false) }}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-muted flex items-center gap-2 ${!effect ? 'text-primary font-medium' : ''}`}
            >
              <span className="w-5 text-center">🚫</span> None
            </button>
            {EFFECT_OPTIONS.map(o => (
              <button
                key={o.kind}
                onClick={() => { setEffect(o.kind); setShowEffects(false) }}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-muted flex items-center gap-2 ${effect === o.kind ? 'text-primary font-medium' : ''}`}
              >
                <span className="w-5 text-center text-base">{o.emoji}</span> {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* AI rewrite: polite / shorten / grammar, with one-tap undo */}
      <div className="relative">
        <button
          onClick={() => { setShowRewrite(v => !v); setShowMedia(false); setShowEffects(false); setShowGames(false); setShowLive(false) }}
          className="composer-action-btn"
          aria-label="Rewrite with AI"
          title="Rewrite draft with AI"
          style={canUndoRewrite ? { color: 'var(--accent-secondary)', background: 'var(--accent-subtle)' } : undefined}
        >
          <Wand2 className="w-5 h-5" />
        </button>
        {showRewrite && (
          <div className="fixed left-1/2 -translate-x-1/2 bottom-40 z-40 w-52 max-w-[calc(100vw-24px)] rounded-2xl border bg-card p-1.5 shadow-xl">
            {rewriteBusy ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">Rewriting…</p>
            ) : (
              REWRITE_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => rewriteDraft(m.id)}
                  className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-muted flex items-center gap-2"
                >
                  <span className="w-5 text-center text-base">{m.emoji}</span> {m.label}
                </button>
              ))
            )}
          </div>
        )}
      </div>
        <div className="relative">
          <button
            onClick={() => { setShowGames(v => !v); setShowMedia(false); setShowEffects(false); setShowLive(false) }}
            className="composer-action-btn"
            aria-label="Start a game"
            title="Challenge chat to a game"
          >
            <Gamepad2 className="w-5 h-5" />
          </button>
          {showGames && (
            <div className="fixed left-1/2 -translate-x-1/2 bottom-40 z-40 w-52 max-w-[calc(100vw-24px)] rounded-2xl border bg-card p-1.5 shadow-xl">
              <button
                onClick={() => sendChallenge('ttt')}
                className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-muted flex items-center gap-2"
              >
                <span className="w-5 text-center text-base">🎮</span> Tic-Tac-Toe
              </button>
              <button
                onClick={() => sendChallenge('rps')}
                className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-muted flex items-center gap-2"
              >
                <span className="w-5 text-center text-base">✊</span> Rock-Paper-Scissors
              </button>
              <button
                onClick={() => sendChallenge('c4')}
                className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-muted flex items-center gap-2"
              >
                <span className="w-5 text-center text-base">🔴</span> Connect Four
              </button>
              <button
                onClick={() => sendChallenge('emoji')}
                className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-muted flex items-center gap-2"
              >
                <span className="w-5 text-center text-base">🎬</span> Emoji Movies
              </button>
              <button
                onClick={() => sendChallenge('chess')}
                className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-muted flex items-center gap-2"
              >
                <span className="w-5 text-center text-base">♞</span> Chess
              </button>
              <button
                onClick={() => sendChallenge('tod')}
                className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-muted flex items-center gap-2"
              >
                <span className="w-5 text-center text-base">🎡</span> Truth or Dare
              </button>
              <button
                onClick={() => sendChallenge('wc')}
                className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-muted flex items-center gap-2"
              >
                <span className="w-5 text-center text-base">🔗</span> Word Chain
              </button>
              <button
                onClick={() => sendChallenge('mys')}
                className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-muted flex items-center gap-2"
              >
                <span className="w-5 text-center text-base">🎭</span> Murder Mystery
              </button>
              <button
                onClick={() => setShowWatchInput(v => !v)}
                className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-muted flex items-center gap-2"
              >
                <span className="w-5 text-center text-base">📺</span> Watch Together
              </button>
              {showWatchInput && (
                <div className="p-1.5 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    value={watchUrl}
                    onChange={(e) => setWatchUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendWatchRoom() } }}
                    placeholder="YouTube / mp4 link…"
                    inputMode="url"
                    className="flex-1 min-w-0 px-2.5 py-2 rounded-xl bg-muted text-sm outline-none"
                  />
                  <button
                    onClick={sendWatchRoom}
                    className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shrink-0"
                  >
                    Start
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      {/* Emoji, GIFs, stickers, memes — all in one sheet */}
      <button onClick={() => openMedia('sticker')} className="composer-action-btn" aria-label="Emoji, GIFs and stickers" title="Emoji, GIFs, stickers and memes">
        <Smile className="w-5 h-5" />
      </button>
      <div className="relative">
        <button
          onClick={() => { setShowLive(v => !v); setShowMedia(false); setShowEffects(false); setShowGames(false) }}
          className="composer-action-btn"
          aria-label="Share live location"
          title="Share live location (updates in real time)"
          style={sharingLive ? { color: 'var(--accent-secondary)', background: 'var(--accent-subtle)' } : undefined}
        >
          <Navigation className="w-5 h-5" />
        </button>
        {showLive && (
          <div className="fixed left-1/2 -translate-x-1/2 bottom-40 z-40 w-52 max-w-[calc(100vw-24px)] rounded-2xl border bg-card p-1.5 shadow-xl">
            <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide opacity-60">Live for</p>
            {[
              { m: 15, label: '15 minutes' },
              { m: 60, label: '1 hour' },
              { m: 480, label: '8 hours' },
            ].map(o => (
              <button
                key={o.m}
                onClick={() => handleLiveShare(o.m)}
                disabled={sharingLive}
                className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-muted flex items-center gap-2 disabled:opacity-50"
              >
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> {o.label}
              </button>
            ))}
            <p className="px-3 py-1.5 text-[11px] opacity-60">Members see you move in real time. Stop anytime from the map card.</p>
          </div>
        )}
      </div>
      <button onClick={() => { setShowCamera(true); setShowMedia(false); closeSubPopups(); setShowMore(false) }} className="composer-action-btn" aria-label="Take a photo" title="Take a photo">
        <Camera className="w-5 h-5" />
      </button>
      <button onClick={() => { setShowVideoNote(true); setShowMedia(false); closeSubPopups(); setShowMore(false) }} className="composer-action-btn" aria-label="Record video message" title="Record video message (up to 1:00)">
        <Video className="w-5 h-5" />
      </button>
      <button onClick={() => { setShowDoodle(true); setShowMedia(false); closeSubPopups(); setShowMore(false) }} className="composer-action-btn" aria-label="Draw a doodle" title="Draw a doodle">
        <Pencil className="w-5 h-5" />
      </button>
    </>
  )
  // Ref mirror: state updates are async, so a fast double-Enter would read
  // stale `sending === false` twice and fire two sends. The ref blocks that.
  const sendingRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const typingTimeout = useRef<any>(null)
  const lastTyping = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const enterToSend = useSettingsStore(s => s.enter_to_send)
  const typingEnabled = useSettingsStore(s => s.typing_indicators)

  // Typing signals honor the user's indicator preference: when off, peers
  // never see us typing (and we never see them — see ChatView/List).
  const emitTyping = (isTyping: boolean) => {
    onTyping(isTyping)
    if (typingEnabled) wsService.sendTyping(conversationId, isTyping)
  }

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxH = 120
    el.style.height = Math.min(el.scrollHeight, maxH) + 'px'
  }, [])

  useEffect(() => { autoResize() }, [text, autoResize])
  useEffect(() => {
    setText(readDraft(conversationId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])
  // Icebreakers (and similar fillers) drop text in from outside the composer.
  useEffect(() => {
    const onFill = (e: Event) => {
      try {
        const d = (e as CustomEvent).detail
        if (d && d.cid === conversationId && typeof d.text === 'string') {
          setText(d.text)
          requestAnimationFrame(() => textareaRef.current?.focus())
        }
      } catch {}
    }
    window.addEventListener('kryzen:fill-draft', onFill)
    return () => window.removeEventListener('kryzen:fill-draft', onFill)
  }, [conversationId])
  useEffect(() => {
    const t = setTimeout(() => writeDraft(conversationId, text), 500)
    return () => clearTimeout(t)
  }, [text, conversationId])

  // Unsent text is kept per conversation (survives chat switches + reloads).
  const readDraft = (cid: number): string => {
    try {
      const m = JSON.parse(localStorage.getItem('kb_drafts') || '{}')
      const v = m && typeof m === 'object' ? m[String(cid)] : ''
      return typeof v === 'string' ? v : ''
    } catch {
      return ''
    }
  }
  const writeDraft = (cid: number, v: string) => {
    try {
      const m = JSON.parse(localStorage.getItem('kb_drafts') || '{}')
      const o = m && typeof m === 'object' ? m : {}
      if (v.trim()) o[String(cid)] = v
      else delete o[String(cid)]
      localStorage.setItem('kb_drafts', JSON.stringify(o))
    } catch {}
  }

  const handleChange = (v: string) => {
    setText(v)
    // Manual edits diverge from any AI rewrite: drop the one-tap undo.
    if (canUndoRewrite) {
      lastOrigRef.current = null
      setCanUndoRewrite(false)
    }
    const isTyping = v.length > 0
    if (isTyping !== lastTyping.current) {
      lastTyping.current = isTyping
      emitTyping(isTyping)
    }
    if (typingTimeout.current) clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => {
      if (lastTyping.current) {
        lastTyping.current = false
        emitTyping(false)
      }
    }, 2000)
  }

  const handleSend = () => {
    if (!text.trim() || sendingRef.current || uploading || disabled) return
    sendingRef.current = true
    setSending(true)
    const body = text.trim()
    const vo = viewOnce
    const pp = passport
    const fx = effect
    setViewOnce(false)
    setPassport(false)
    setEffect(null)
    setText('')
    writeDraft(conversationId, '')
    onCancelReply()
    lastTyping.current = false
    emitTyping(false)
    closeSubPopups()
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    // Call onSend and reset sending state after a delay (onSend is void, not async).
    // A chosen effect rides along as a marker tag so the RECEIVER celebrates
    // too; it still plays locally for the sender right away.
    onSend(fx ? withFxMarker(body, fx) : body, undefined, 'text', undefined, (vo || pp) ? { ...(vo ? { view_once: true } : {}), ...(pp ? { passport: true } : {}) } : undefined)
    if (fx) setTimeout(() => fireEffect(fx), 250)
    setTimeout(() => { sendingRef.current = false; setSending(false) }, 1500)
  }

  const handleEmoji = (e: EmojiClickData) => {
    setText(prev => prev + e.emoji)
  }

  const handleSticker = (url: string) => {
    onSend(url, undefined, 'text')
    setShowMedia(false)
  }

  const handleGif = (url: string) => {
    onSend(url, undefined, 'text')
    setShowMedia(false)
  }

  const handleDirectImageSend = async (file: File) => {
    setMemeFile(null)
    setShowCamera(false)
    setUploading(true)
    setProgress(0)
    setUploadError(null)
    abortRef.current = new AbortController()
    try {
      const res = await uploadApi.upload(file, (p) => setProgress(p), abortRef.current.signal)
      if (res.success) {
        const att = res.data
        onSend(text || 'Meme', [att.id], 'image' as any, undefined)
        setText('')
      }
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') setUploadError('Upload cancelled')
      else setUploadError(err.response?.data?.message || err.message || 'Upload failed')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (files.length === 0) return
    for (const file of files) {
      setUploading(true)
      setProgress(0)
      setUploadError(null)
      abortRef.current = new AbortController()
      try {
        const res = await uploadApi.upload(file, (p) => setProgress(p), abortRef.current.signal)
        if (res.success) {
          const att = res.data
          const isImage = att.mime_type.startsWith('image/')
          const isVoice = att.mime_type.startsWith('audio/')
          const type = isImage ? 'image' : isVoice ? 'voice' : 'file'
          let voiceDur: number | undefined
          if (isVoice) {
            voiceDur = await probeAudioDuration(file)
            if (voiceDur != null) voiceDur = Math.min(voiceDur, 300)
          }
          const fallback = isImage ? (text || 'Image') : isVoice ? `Voice${voiceDur != null ? ` ${Math.floor(voiceDur / 60)}:${String(voiceDur % 60).padStart(2, '0')}` : ` ${Math.round(att.file_size / 1024)}KB`}` : `File: ${att.original_filename}`
          onSend(fallback, [att.id], type as any, voiceDur)
          setText('')
          if (isImage) writeDraft(conversationId, '')
        }
      } catch (err: any) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') setUploadError('Upload cancelled')
        else setUploadError(err.response?.data?.message || err.message || 'Upload failed')
      } finally {
        setUploading(false)
        setProgress(0)
        if (fileRef.current) fileRef.current.value = ''
      }
    }
  }

  const handleLiveShare = (minutes: number) => {
    setShowLive(false)
    if (disabled || sharingLive) return
    if (!('geolocation' in navigator)) {
      setUploadError('Geolocation not supported in this browser')
      return
    }
    setSharingLive(true)
    setUploadError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r: any = await liveLocationApi.start({
            conversation_id: conversationId,
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null,
            duration_minutes: minutes,
          })
          if (r?.success && r.data?.id) {
            const sid = r.data.id as number
            onSend(`📍 Live location\n[live:${sid}]`, undefined, 'live_location')
            startLiveTracking(sid, r.data.expires_at ?? null)
          } else {
            setUploadError(r?.message || 'Could not start live location')
          }
        } catch (err: any) {
          setUploadError(err.response?.data?.message || err.response?.data?.detail || 'Could not start live location')
        } finally {
          setSharingLive(false)
        }
      },
      () => {
        setUploadError('Location unavailable — allow location access and retry')
        setSharingLive(false)
      },
      { timeout: 15000 },
    )
  }

  const probeAudioDuration = (file: File): Promise<number | undefined> => {
    return new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(file)
        const el = document.createElement('audio')
        el.preload = 'metadata'
        el.onloadedmetadata = () => {
          const d = Number.isFinite(el.duration) ? Math.round(el.duration) : undefined
          URL.revokeObjectURL(url)
          resolve(d)
        }
        el.onerror = () => { URL.revokeObjectURL(url); resolve(undefined) }
        el.src = url
        // Safety timeout in case metadata never loads (revokes too — the
        // loadedmetadata/error paths already resolved or never will).
        setTimeout(() => { URL.revokeObjectURL(url); resolve(undefined) }, 4000)
      } catch { resolve(undefined) }
    })
  }

  const handleVideoNoteSend = async (blob: Blob, duration: number) => {
    const type = blob.type || 'video/webm'
    const ext = type.includes('mp4') ? 'mp4' : 'webm'
    const file = new File([blob], `video_note_${Date.now()}.${ext}`, { type })
    setShowVideoNote(false)
    setUploading(true)
    setProgress(0)
    abortRef.current = new AbortController()
    try {
      const res = await uploadApi.upload(file, (p) => setProgress(p), abortRef.current.signal)
      if (res.success) {
        const att = res.data
        const secs = Math.max(1, Math.min(Math.round(duration), 60))
        onSend(`Video ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, [att.id], 'video_note' as any, secs)
      } else {
        setUploadError('Video message upload failed')
      }
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') setUploadError('Upload cancelled')
      else setUploadError(err.response?.data?.message || err.message || 'Video message upload failed')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const handleVoiceSend = async (blob: Blob, duration: number) => {    const type = blob.type || 'audio/webm'
    const ext = type.includes('mp4') ? 'm4a' : type.includes('wav') ? 'wav' : type.includes('ogg') ? 'ogg' : 'webm'
    const file = new File([blob], `voice_${Date.now()}.${ext}`, { type })
    setUploading(true)
    setProgress(0)
    try {
      const res = await uploadApi.upload(file, (p) => setProgress(p))
      if (res.success) {
        const att = res.data
        onSend(`Voice ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`, [att.id], 'voice' as any, Math.min(Math.round(duration), 300))
      }
    } catch {
      setUploadError('Voice upload failed')
    } finally { setUploading(false) }
  }

  const handleDoodleSend = async (file: File) => {
    setShowDoodle(false)
    setUploading(true)
    setProgress(0)
    setUploadError(null)
    abortRef.current = new AbortController()
    try {
      const res = await uploadApi.upload(file, (p) => setProgress(p), abortRef.current.signal)
      if (res.success) {
        const att = res.data
        onSend(text || 'Doodle', [att.id], 'image' as any, undefined)
        setText('')
      } else {
        setUploadError('Doodle upload failed')
      }
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') setUploadError('Upload cancelled')
      else setUploadError(err.response?.data?.message || err.message || 'Doodle upload failed')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (enterToSend) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    } else {
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleSend() }
    }
    if (e.key === 'Escape') { onCancelReply(); setShowMedia(false); closeSubPopups(); setShowMore(false); setShowCamera(false); setShowVideoNote(false); setShowDoodle(false) }
  }

  return (
    <div className="composer-wrapper relative" style={{ background: 'rgba(6,6,14,0.97)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', borderTop: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 -4px 24px rgba(0,0,0,0.4)' }}>
      {/* Reply preview */}
      {replyTo && (
        <div className="composer-reply-preview">
          <div className="min-w-0">
            <p className="font-semibold gradient-text text-xs">Replying to {replyTo.sender}</p>
            <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>{replyTo.content}</p>
          </div>
          <button onClick={onCancelReply} className="btn-icon shrink-0" aria-label="Cancel reply">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="composer-upload-progress">
          <div className="composer-progress-bar">
            <div className="composer-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between items-center text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            <span>Uploading {progress}%</span>
            <button onClick={() => abortRef.current?.abort()} className="font-medium" style={{ color: 'var(--error)' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <div className="composer-upload-error">
          <span>{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="font-medium underline">Dismiss</button>
        </div>
      )}

      {/* Rewrite undo */}
      {canUndoRewrite && !uploading && (
        <div className="composer-upload-error" style={{ borderColor: 'var(--accent-subtle)' }}>
          <span>✨ Rewritten with AI</span>
          <button onClick={undoRewrite} className="font-medium underline flex items-center gap-1">
            <Undo2 className="w-3 h-3" /> Undo
          </button>
        </div>
      )}

      {/* Main input row */}
      {/* Mobile ＋ sheet: full composer width, floating above the input row.
          Tap-outside dismisses it. */}
      {showMore && (
        <button
          aria-label="Close more actions"
          className="fixed inset-0 z-20 bg-transparent border-0 p-0 cursor-default"
          onClick={closeMore}
        />
      )}
      {showMore && (
        <div data-testid="more-actions-sheet" className="absolute bottom-full left-2 right-2 z-30 mb-2 rounded-2xl border bg-card p-2 shadow-xl flex flex-wrap items-center gap-1">
          {renderExtras()}
        </div>
      )}
      <div className="composer-input-row">
        {/* Attachment */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="composer-action-btn"
          aria-label="Attach file"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFile} accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.mp4,.mp3,.webm,.m4a,.wav,.ogg,.aac,.amr" multiple />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={viewOnce ? 'View-once message… burns after first view' : 'Type a message...'}
          rows={1}
          className="composer-textarea"
          style={{ background: 'rgba(20,20,42,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, color: '#f0f0ff', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 2px 8px rgba(0,0,0,0.2)' }}
          disabled={disabled || uploading}
        />

        {/* Right side buttons */}
        <button onClick={() => openMedia('emoji')} className="composer-action-btn" aria-label="Emoji">
          <Smile className="w-5 h-5" />
        </button>
        {/* Extra actions: inline on desktop… */}
        <div className="hidden sm:flex sm:items-center">{renderExtras()}</div>
        {/* …behind ＋ on mobile: attach, typing, emoji, voice stay in the row.
            NOTE: the sheet lives on the composer wrapper (see below), NOT
            inside this tiny button box — anchoring left/right insets here
            collapses it into a thin vertical strip over the messages. */}
        <div className="sm:hidden">
          <button onClick={() => { setShowMore(v => !v); setShowMedia(false); closeSubPopups() }} className="composer-action-btn" aria-label="More actions" title="More actions">
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Voice recorder - shown when empty, send when has text */}
        {text.trim() ? (
          <button
            onClick={handleSend}
            disabled={uploading || sending}
            className="composer-send-btn"
            style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', boxShadow: '0 4px 20px var(--accent-glow), 0 0 0 1px var(--border-accent)' }}
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
            {sending && (
              <span className="w-1 h-1 absolute -top-1 -left-1 rounded-full bg-[7c5cfc] animate-spin text-[1px]"></span>
            )}
          </button>
        ) : (
          <VoiceRecorder onSend={handleVoiceSend} />
        )}
      </div>

      {/* Unified media sheet: emoji / GIF / stickers / meme tabs */}
      {showMedia && (
        <MediaSheet
          tab={mediaTab}
          onTab={setMediaTab}
          onEmoji={handleEmoji}
          onSticker={handleSticker}
          onGif={handleGif}
          onMemeFile={(f) => setMemeFile(f)}
          onClose={() => setShowMedia(false)}
        />
      )}

      {/* Meme maker */}
      {memeFile && (
        <MemeMaker file={memeFile} onClose={() => setMemeFile(null)} onSend={handleDirectImageSend} />
      )}

      {/* In-app camera */}
      {showCamera && (
        <CameraModal onClose={() => setShowCamera(false)} onCapture={handleDirectImageSend} />
      )}

      {/* Round video messages */}
      {showVideoNote && (
        <VideoNoteRecorder onClose={() => setShowVideoNote(false)} onSend={handleVideoNoteSend} />
      )}

      {/* Hand-drawn doodles */}
      {showDoodle && (
        <DoodlePad onClose={() => setShowDoodle(false)} onSend={handleDoodleSend} />
      )}
    </div>
  )
}
