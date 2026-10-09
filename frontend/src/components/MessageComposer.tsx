import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react'
import { Send, Smile, Paperclip, X, Image, Eye, Sparkles, Gamepad2, Plus, Laugh, MapPin, Camera, Navigation, Video } from 'lucide-react'
import { MemeMaker } from './MemeMaker'
import { CameraModal } from './CameraModal'
import { VideoNoteRecorder } from './VideoNoteRecorder'
import { fireEffect, withFxMarker, EFFECT_OPTIONS, type EffectKind } from '../utils/messageEffects'
import { useAuthStore } from '../store/auth'
import type { EmojiClickData, Theme as EmojiTheme } from 'emoji-picker-react'
import wsService from '../services/websocket'
import { VoiceRecorder } from './VoiceRecorder'
import { uploadApi, liveLocationApi } from '../services/api'
import { startLiveTracking } from '../utils/liveLocation'
import { useSettingsStore } from '../store/settings'
import StickerPicker from './StickerPicker'
import { GifPicker } from './GifPicker'

// Heavy picker (~300KB) loads on first open, never with the chat bundle.
const EmojiPicker = lazy(() => import('emoji-picker-react'))

// Theme enum lives in the lazily-loaded picker bundle; these literals match
// its values ('dark' | 'light') without statically importing the module.
function pickEmojiTheme(): EmojiTheme {
  try {
    return (document.documentElement.classList.contains('dark') ? 'dark' : 'light') as EmojiTheme
  } catch {
    return 'light' as EmojiTheme
  }
}
export function MessageComposer({ onSend, onTyping, conversationId, replyTo, onCancelReply, disabled }: {
  onSend: (content: string, attachmentIds?: number[], type?: string, voiceDuration?: number, opts?: { view_once?: boolean }) => void,
  onTyping: (isTyping: boolean) => void,
  conversationId: number,
  replyTo?: { id: number; content: string; sender: string } | null,
  onCancelReply: () => void,
  disabled?: boolean,
}) {
  const [text, setText] = useState('')
  const [viewOnce, setViewOnce] = useState(false)
  const [effect, setEffect] = useState<EffectKind | null>(null)
  const [showEffects, setShowEffects] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [showGames, setShowGames] = useState(false)
  const [showGifs, setShowGifs] = useState(false)
  const [showLive, setShowLive] = useState(false)
  const [sharingLive, setSharingLive] = useState(false)
  const [memeFile, setMemeFile] = useState<File | null>(null)
  const memeFileRef = useRef<HTMLInputElement>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [showVideoNote, setShowVideoNote] = useState(false)
  const { user } = useAuthStore()

  const sendChallenge = (kind: 'ttt' | 'rps' | 'c4') => {
    const name = user?.display_name || user?.username || 'Someone'
    if (kind === 'rps') {
      onSend(`🎮RPS:new\n${name} started rock-paper-scissors — tap your throw!`, undefined, 'text')
    } else if (kind === 'c4') {
      onSend(`🎮C4:new\n${name} started Connect Four — tap a column to drop!`, undefined, 'text')
    } else {
      onSend(`🎮TTT:new\n${name} started tic-tac-toe — tap a square to join as O!`, undefined, 'text')
    }
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
      {/* Send-with-effect picker */}
      <div className="relative">
        <button
            onClick={() => { setShowEffects(v => !v); setShowEmoji(false); setShowStickers(false); setShowGames(false); setShowGifs(false) }}
          className="composer-action-btn"
          aria-label="Send with effect"
          title={effect ? `Effect: ${effect} (tap to change)` : 'Send with effect'}
          style={effect ? { color: 'var(--accent-secondary)', background: 'var(--accent-subtle)' } : undefined}
        >
          <Sparkles className="w-5 h-5" />
        </button>
        {showEffects && (
          <div className="absolute bottom-12 right-0 z-30 w-44 rounded-2xl border bg-card p-1.5 shadow-xl">
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
        <div className="relative">
          <button
            onClick={() => { setShowGames(v => !v); setShowEmoji(false); setShowStickers(false); setShowEffects(false); setShowGifs(false); setShowLive(false) }}
            className="composer-action-btn"
            aria-label="Start a game"
            title="Challenge chat to a game"
          >
            <Gamepad2 className="w-5 h-5" />
          </button>
          {showGames && (
            <div className="absolute bottom-12 right-0 z-30 w-52 rounded-2xl border bg-card p-1.5 shadow-xl">
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
            </div>
          )}
        </div>
      <button onClick={() => memeFileRef.current?.click()} className="composer-action-btn" aria-label="Make a meme" title="Make a meme">
        <Laugh className="w-5 h-5" />
      </button>
      <button onClick={() => { setShowStickers(!showStickers); setShowEmoji(false); setShowEffects(false); setShowMore(false); setShowGames(false); setShowGifs(false); setShowLive(false) }} className="composer-action-btn" aria-label="Stickers">
        <Image className="w-5 h-5" />
      </button>
      <button onClick={() => { setShowGifs((v) => !v); setShowEmoji(false); setShowStickers(false); setShowEffects(false); setShowMore(false); setShowGames(false); setShowLive(false) }} className="composer-action-btn" aria-label="GIFs" title="Send a GIF">
        <span className="text-[11px] font-black tracking-tight">GIF</span>
      </button>
      <button onClick={handleLocationShare} className="composer-action-btn" aria-label="Share location" title="Share current location">
        <MapPin className="w-5 h-5" />
      </button>
      <div className="relative">
        <button
          onClick={() => { setShowLive(v => !v); setShowEmoji(false); setShowStickers(false); setShowEffects(false); setShowGames(false); setShowGifs(false) }}
          className="composer-action-btn"
          aria-label="Share live location"
          title="Share live location (updates in real time)"
          style={sharingLive ? { color: 'var(--accent-secondary)', background: 'var(--accent-subtle)' } : undefined}
        >
          <Navigation className="w-5 h-5" />
        </button>
        {showLive && (
          <div className="absolute bottom-12 right-0 z-30 w-52 rounded-2xl border bg-card p-1.5 shadow-xl">
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
      <button onClick={() => { setShowCamera(true); setShowEmoji(false); setShowStickers(false); setShowEffects(false); setShowMore(false); setShowGames(false); setShowGifs(false) }} className="composer-action-btn" aria-label="Take a photo" title="Take a photo">
        <Camera className="w-5 h-5" />
      </button>
      <button onClick={() => { setShowVideoNote(true); setShowEmoji(false); setShowStickers(false); setShowEffects(false); setShowMore(false); setShowGames(false); setShowGifs(false) }} className="composer-action-btn" aria-label="Record video message" title="Record video message (up to 1:00)">
        <Video className="w-5 h-5" />
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
    const fx = effect
    setViewOnce(false)
    setEffect(null)
    setShowEffects(false)
    setText('')
    writeDraft(conversationId, '')
    onCancelReply()
    lastTyping.current = false
    emitTyping(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    // Call onSend and reset sending state after a delay (onSend is void, not async).
    // A chosen effect rides along as a marker tag so the RECEIVER celebrates
    // too; it still plays locally for the sender right away.
    onSend(fx ? withFxMarker(body, fx) : body, undefined, 'text', undefined, vo ? { view_once: true } : undefined)
    if (fx) setTimeout(() => fireEffect(fx), 250)
    setTimeout(() => { sendingRef.current = false; setSending(false) }, 1500)
  }

  const handleEmoji = (e: EmojiClickData) => {
    setText(prev => prev + e.emoji)
  }

  const handleSticker = (url: string) => {
    onSend(url, undefined, 'text')
    setShowStickers(false)
  }

  const handleGif = (url: string) => {
    onSend(url, undefined, 'text')
    setShowGifs(false)
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

  const handleLocationShare = () => {
    if (!('geolocation' in navigator)) {
      setUploadError('Geolocation not supported in this browser')
      return
    }
    setUploadError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(5)
        const lon = pos.coords.longitude.toFixed(5)
        onSend(`📍 Location\nhttps://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`, undefined, 'text')
      },
      () => setUploadError('Location unavailable — allow location access and retry'),
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (enterToSend) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    } else {
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleSend() }
    }
    if (e.key === 'Escape') { onCancelReply(); setShowEmoji(false); setShowStickers(false); setShowEffects(false); setShowMore(false); setShowGames(false); setShowGifs(false); setShowCamera(false); setShowVideoNote(false) }
  }

  return (
    <div className="composer-wrapper" style={{ background: 'rgba(6,6,14,0.97)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', borderTop: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 -4px 24px rgba(0,0,0,0.4)' }}>
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

      {/* Main input row */}
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
        <input
          ref={memeFileRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (memeFileRef.current) memeFileRef.current.value = ''
            if (f) setMemeFile(f)
          }}
        />

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
        <button onClick={() => { setShowEmoji(!showEmoji); setShowStickers(false); setShowEffects(false); setShowMore(false); setShowGames(false); setShowGifs(false) }} className="composer-action-btn" aria-label="Emoji">
          <Smile className="w-5 h-5" />
        </button>
        {/* Extra actions: inline on desktop… */}
        <div className="hidden sm:flex sm:items-center">{renderExtras()}</div>
        {/* …behind ＋ on mobile: attach, typing, emoji, voice stay in the row */}
        <div className="sm:hidden relative">
          <button onClick={() => { setShowMore(v => !v); setShowEmoji(false); setShowStickers(false); setShowEffects(false); setShowGames(false); setShowGifs(false) }} className="composer-action-btn" aria-label="More actions" title="More actions">
            <Plus className="w-5 h-5" />
          </button>
          {showMore && (
            <div className="absolute bottom-12 left-2 right-2 z-30 rounded-2xl border bg-card p-2 shadow-xl flex flex-wrap items-center gap-1">
              {renderExtras()}
            </div>
          )}
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

      {/* Emoji picker */}
      {showEmoji && (
        <div className="composer-picker">
          <Suspense fallback={<div className="h-[280px] skeleton" aria-label="Loading emoji" />}>
            <EmojiPicker onEmojiClick={handleEmoji} height={280} width="100%" theme={pickEmojiTheme()} />
          </Suspense>
        </div>
      )}

      {/* Sticker picker */}
      {showStickers && (
        <div className="composer-picker">
          <StickerPicker onSelect={handleSticker} />
        </div>
      )}

      {/* GIF picker */}
      {showGifs && (
        <div className="composer-picker max-h-[340px] overflow-hidden flex flex-col">
          <GifPicker onSelect={handleGif} />
        </div>
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
    </div>
  )
}
