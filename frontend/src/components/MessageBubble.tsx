import { Message } from '../types'
import { formatTime } from '../utils/format'
import { Check, CheckCheck, Clock, Trash2, Edit3, Copy, Forward, Bookmark, MoreHorizontal, Flag, Pin, Sparkles, Languages, FileText, Mic, Play, Pause, RotateCcw, AlertTriangle, Download, Smile, SmilePlus, Info, MapPin, Navigation, Volume2, VolumeX } from 'lucide-react'
import { MessageInfo } from './MessageInfo'
import type { Theme as EmojiTheme } from 'emoji-picker-react'
import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { LinkPreview, hasUrl, extractUrls } from './LinkPreview'
import { aiApi, msgApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import { useSettingsStore } from '../store/settings'
import api from '../services/api'
import { useLegacyDecrypted, loadStoredPrivateKey, openSealed } from '../utils/legacyE2ee'
import { prettyPreview, isGameCardMsg, isMediaMsg } from '../utils/messageEffects'
import { speakText, stopSpeak, speechSupported } from '../utils/speech'
import { useToastStore } from '../store/toast'
import { parseContactCard } from '../utils/messageEffects'
import { renderFormattedText } from '../utils/formattedText'
import { parseLiveSessionId } from '../utils/liveLocation'
import { LiveLocationCard } from './LiveLocationCard'
import { TicTacToeGame, isTTTChallenge } from './TicTacToeGame'
import { RpsGame, isRpsChallenge, type RpsChoice } from './RockPaperScissors'
import { ConnectFourGame, isC4Challenge } from './ConnectFour'
import { EmojiMovieGame, isEmojiChallenge } from './EmojiMovieGame'
import { ChessGame, isChessChallenge } from './ChessGame'
import { TruthOrDareGame, isTodChallenge } from './TruthOrDareGame'
import { WordChainGame, isWordChainChallenge } from './WordChainGame'
import { WatchTogether } from './WatchTogether'
import { isWTChallenge } from '../utils/watchTogether'
import { MysteryGame } from './MysteryGame'
import { isMysChallenge } from '../utils/mystery'
import { TreasureHunt } from './TreasureHunt'
import { isTHChallenge } from '../utils/treasureHunt'

// Heavy picker loads on first open, never with the chat bundle.
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

const REACTIONS = ['👍','❤️','😂','😮','😢','😡']

/** Auto-translation cache: message id -> translated text. */
const transCache = new Map<number, string>()

/** Shared location links (MessageComposer "Share location") arrive as plain
 * text with an openstreetmap mlat/mlon URL. Render them as a rich map card
 * instead of a bare link. Pure parse — no backend change. */
export function parseLocationCard(text: string | null | undefined): { lat: number; lon: number; url: string } | null {
  if (!text) return null
  const m = /openstreetmap\.org\/\?mlat=(-?\d+(?:\.\d+)?)&mlon=(-?\d+(?:\.\d+)?)/i.exec(text)
  if (!m) return null
  const lat = Number(m[1])
  const lon = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`
  return { lat, lon, url }
}

function LocationCard({ lat, lon, url, isOwn }: { lat: number; lon: number; url: string; isOwn: boolean }) {
  const d = 0.008
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d}%2C${lat - d}%2C${lon + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lon}`
  const dirs = `https://www.google.com/maps/dir/?api=1&destination=${lat}%2C${lon}`
  return (
    <div className="mb-2 rounded-xl overflow-hidden border border-current/20 min-w-[230px] max-w-[280px]" onClick={(e) => e.stopPropagation()}>
      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold ${isOwn ? 'bg-white/15' : 'bg-muted'}`}>
        <MapPin className="w-3.5 h-3.5" />
        <span className="truncate">Shared location</span>
        <span className="ml-auto font-normal opacity-70 tabular-nums">{lat.toFixed(4)}, {lon.toFixed(4)}</span>
      </div>
      <a href={url} target="_blank" rel="noreferrer" className="block bg-black/20">
        <iframe
          title={`Map ${lat},${lon}`}
          src={embed}
          loading="lazy"
          className="w-full h-36 pointer-events-none"
        />
      </a>
      <div className="flex gap-1.5 p-1.5">
        <a href={url} target="_blank" rel="noreferrer" className="flex-1 text-center text-xs font-medium px-2 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
          Open map
        </a>
        <a href={dirs} target="_blank" rel="noreferrer" className="flex-1 text-center text-xs font-medium px-2 py-1.5 rounded-lg bg-muted hover:bg-accent transition-colors flex items-center justify-center gap-1">
          <Navigation className="w-3 h-3" /> Directions
        </a>
      </div>
    </div>
  )
}

const fmtDur = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

// Wave 4B: bounded waveform cache keyed by audio URL. Scrolling through a
// chat remounts bubbles constantly; without this every mount refetches +
// decodes the full clip. In-flight decodes are shared; failures are not
// cached. Cap 50 entries (peaks are 36 numbers — tiny).
const peaksCache = new Map<string, number[]>()
const peaksInflight = new Map<string, Promise<number[] | null>>()

function peaksForUrl(src: string): Promise<number[] | null> {
  const hit = peaksCache.get(src)
  if (hit) return Promise.resolve(hit)
  const running = peaksInflight.get(src)
  if (running) return running
  const p: Promise<number[] | null> = (async () => {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      if (!AC) return null
      const blob = await fetch(src).then((r) => r.blob())
      const buf = await blob.arrayBuffer()
      const ctx = new AC()
      try {
        const audio = await ctx.decodeAudioData(buf)
        const ch = audio.getChannelData(0)
        const N = 36
        const step = Math.max(1, Math.floor(ch.length / N))
        const out: number[] = []
        for (let i = 0; i < N; i++) {
          let max = 0
          const start = i * step
          for (let j = start; j < Math.min(start + step, ch.length); j += 7) {
            const v = Math.abs(ch[j])
            if (v > max) max = v
          }
          out.push(max)
        }
        if (!out.some((v) => v > 0)) return null
        if (peaksCache.size >= 50) {
          const oldest = peaksCache.keys().next()
          if (!oldest.done) peaksCache.delete(oldest.value)
        }
        peaksCache.set(src, out)
        return out
      } finally {
        ctx.close().catch(() => {})
      }
    } catch {
      return null
    }
  })().finally(() => {
    peaksInflight.delete(src)
  })
  peaksInflight.set(src, p)
  return p
}

// Test seam for the cache contract (no DOM harness needed).
export function clearPeaksCache() {
  peaksCache.clear()
  peaksInflight.clear()
}
export { peaksForUrl }

function VoicePlayer({ src, duration, isOwn, fileName }: { src: string; duration?: number | null; isOwn: boolean; fileName?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [total, setTotal] = useState(duration ?? 0)
  const [loadError, setLoadError] = useState(false)
  const [peaks, setPeaks] = useState<number[]>([])
  const [rate, setRate] = useState(1)
  const SPEEDS = [1, 1.25, 1.5, 2]

  const cycleRate = () => {
    setRate((r) => {
      const next = SPEEDS[(SPEEDS.indexOf(r) + 1) % SPEEDS.length]
      if (audioRef.current) audioRef.current.playbackRate = next
      return next
    })
  }

  const toggle = () => {
    const el = audioRef.current
    if (!el || loadError) return
    if (playing) el.pause()
    else el.play().catch(() => setLoadError(true))
  }

  // Waveform peaks decoded once per voice note URL (cached across mounts).
  useEffect(() => {
    let cancelled = false
    peaksForUrl(src).then((out) => {
      if (!cancelled && out) setPeaks(out)
    })
    return () => {
      cancelled = true
    }
  }, [src])

  const seekToFraction = (f: number) => {
    const el = audioRef.current
    if (!el || !Number.isFinite(total) || total <= 0) return
    const v = Math.min(Math.max(f, 0), 1) * total
    el.currentTime = v
    setCurrent(v)
  }

  if (loadError) {
    return (
      <div className="flex items-center gap-2 py-1 min-w-[200px] max-w-[260px]">
        <span className="text-xs opacity-70">Couldn't load audio.</span>
        <a href={src} target="_blank" rel="noreferrer" className="text-xs underline font-medium" onClick={(e) => e.stopPropagation()}>
          Download{fileName ? ` ${fileName}` : ''}
        </a>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-1 min-w-[200px] max-w-[260px]" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={toggle}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-full transition-transform active:scale-95 ${isOwn ? 'bg-white/25 hover:bg-white/35 text-white' : 'bg-primary/20 hover:bg-primary/30 text-primary'}`}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        {peaks.length > 0 ? (
          <div
            className="flex items-center gap-[2px] h-8 cursor-pointer"
            role="slider"
            aria-label="Seek voice message"
            aria-valuemin={0}
            aria-valuemax={Math.round(total)}
            aria-valuenow={Math.round(current)}
            onClick={(e) => {
              e.stopPropagation()
              const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
              seekToFraction((e.clientX - r.left) / Math.max(r.width, 1))
            }}
          >
            {peaks.map((p, i) => {
              const played = total > 0 && (i + 0.5) / peaks.length <= current / total
              return (
                <span
                  key={i}
                  className="flex-1 rounded-full min-w-[2px]"
                  style={{
                    height: `${Math.max(12, Math.round(p * 100))}%`,
                    background: played ? 'var(--accent-primary)' : 'currentColor',
                    opacity: played ? 1 : 0.35,
                  }}
                />
              )
            })}
          </div>
        ) : (
          <input
            type="range"
            min={0}
            max={Math.max(total, 0.1)}
            step={0.1}
            value={Math.min(current, total || 0)}
            onChange={(e) => {
              const el = audioRef.current
              const v = Number(e.target.value)
              if (el && Number.isFinite(v)) { el.currentTime = v; setCurrent(v) }
            }}
            aria-label="Seek voice message"
            className="w-full h-1 cursor-pointer accent-[var(--accent-primary)]"
          />
        )}
        <div className={`text-[11px] tabular-nums flex items-center justify-between gap-2 ${isOwn ? 'text-white/80' : 'text-muted-foreground'}`}>
          <span>{fmtDur(current)} / {fmtDur(total)}</span>
          <button
            onClick={(e) => { e.stopPropagation(); cycleRate() }}
            className="px-1.5 py-0.5 rounded-md font-bold hover:bg-black/10 dark:hover:bg-white/10 transition"
            title="Playback speed"
            aria-label="Playback speed"
          >
            {rate}x
          </button>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onError={() => { setLoadError(true); setPlaying(false) }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0) }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          if (Number.isFinite(d) && d > 0) setTotal(d)
        }}
      />
    </div>
  )
}

/** Round video-note player: autoplay muted loop, tap to pause, speaker to
 * unmute, duration badge. Telegram-style circle. */
function VideoNotePlayer({ src, duration }: { src: string; duration?: number | null }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(true)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    ref.current?.play().catch(() => setPlaying(false))
  }, [src])
  const toggle = () => {
    const v = ref.current
    if (!v) return
    if (v.paused) {
      v.play().catch(() => {})
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }
  const secs = typeof duration === 'number' && Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : null
  if (failed) {
    return (
      <a href={src} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs underline opacity-80">
        Open video
      </a>
    )
  }
  return (
    <div className="relative w-44 h-44 rounded-full overflow-hidden bg-black cursor-pointer shrink-0" onClick={(e) => { e.stopPropagation(); toggle() }} title={playing ? 'Pause' : 'Play'}>
      <video
        ref={ref}
        src={src}
        autoPlay
        muted={muted}
        loop
        playsInline
        preload="metadata"
        className="w-full h-full object-cover"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
      />
      {!playing && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-11 h-11 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="w-5 h-5 text-white ml-0.5" />
          </span>
        </span>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); setMuted((m) => !m) }}
        aria-label={muted ? 'Unmute video message' : 'Mute video message'}
        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
      >
        {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
      </button>
      {secs != null && (
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] tabular-nums px-2 py-0.5 rounded-full bg-black/60 text-white">
          🎥 {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
        </span>
      )}
    </div>
  )
}

export function MessageBubble({ msg, isOwn, isGroup, showAvatar, onReply, onEdit, onDelete, onReact, onCopy, onForward, onSave, onSelect, isSelected, onReport, onImageClick, savedIds, onPin, onAIAction, onTranslateAction, onMobileMore, onRetry, onPassportJourney, gameMsgs, onGameMove, onGameRematch, onRpsThrow, onC4Move, onChessMove, onTodSpin, onTodDone, onWordChain, onWTState, onMysClue, onMysAccuse, onMysDone, onTHFound, onTHDone, onEmojiGuess, onContactChat, convTitle, autoTranslateLang }: {
  msg: Message, isOwn:boolean, isGroup:boolean, showAvatar:boolean,
  onReply:(m:Message)=>void, onEdit:(m:Message)=>void, onDelete:(m:Message)=>void, onReact:(id:number, e:string)=>void,
  onCopy?:(t:string)=>void, onForward?:(m:Message)=>void, onSave?:(m:Message)=>void, onSelect?:(m:Message)=>void, isSelected?:boolean, onReport?:(m:Message)=>void,
  onImageClick?:(url:string, name:string, all:{url:string,name:string,type?:string}[], idx:number)=>void,
  savedIds?:Set<number>, onPin?:(m:Message)=>void,
  onAIAction?:(msg:Message, action:string)=>void,
  onTranslateAction?:(msg:Message)=>void,
  onMobileMore?:(msg:Message)=>void,
  onRetry?:(msg:Message)=>void,
  onPassportJourney?:(msg:Message)=>void,
  gameMsgs?:any[], onGameMove?:(challenge:any, pos:number)=>void, onGameRematch?:(kind: 'ttt' | 'rps' | 'c4' | 'emoji' | 'chess' | 'tod' | 'wc' | 'mys' | 'th')=>void,
  onRpsThrow?:(challenge:any, choice:RpsChoice)=>void, onC4Move?:(challenge:any, col:number)=>void,
  onChessMove?:(challenge:any, from:number, to:number)=>void,
  onTodSpin?:(challenge:any, kind:'truth'|'dare', index:number)=>void,
  onTodDone?:(challenge:any)=>void,
  onWordChain?:(challenge:any, word:string)=>void,
  onWTState?:(challenge:any, action:'play'|'pause'|'seek', pos:number)=>void,
  onMysClue?:(challenge:any, n:number)=>void,
  onMysAccuse?:(challenge:any, suspect:number)=>void,
  onMysDone?:(challenge:any)=>void,
  onTHFound?:(challenge:any, n:number)=>void,
  onTHDone?:(challenge:any)=>void,
  onEmojiGuess?:(challenge:any, guess:string)=>void,
  onContactChat?:(u:{id?:number, username?:string, display_name?:string, avatar_url?:string|null})=>void,
  convTitle?:string,
  autoTranslateLang?: string | null
}) {
  const content = msg.is_deleted ? 'Message deleted' : prettyPreview(msg.content)
  const contact = (msg as any).message_type === 'contact' && !msg.is_deleted ? parseContactCard(msg.content) : null
  const liveSessionId = (msg as any).message_type === 'live_location' && !msg.is_deleted ? parseLiveSessionId(content) : null
  const location = !msg.is_deleted && liveSessionId == null ? parseLocationCard(content) : null
  const isChallenge = !msg.is_deleted && isTTTChallenge(msg.content)
  const isRps = !msg.is_deleted && isRpsChallenge(msg.content)
  const isC4 = !msg.is_deleted && isC4Challenge(msg.content)
  const isEmoji = !msg.is_deleted && isEmojiChallenge(msg.content)
  const isChess = !msg.is_deleted && isChessChallenge(msg.content)
  const isTod = !msg.is_deleted && isTodChallenge(msg.content)
  const isWc = !msg.is_deleted && isWordChainChallenge(msg.content)
  const isWt = !msg.is_deleted && isWTChallenge(msg.content)
  const isMys = !msg.is_deleted && isMysChallenge(msg.content)
  const isTH = !msg.is_deleted && isTHChallenge(msg.content)
  // Game cards carry their own inline play UI — row actions only disturb.
  // Exception: deleting your OWN game card stays available (nothing else).
  const isGameCard = isGameCardMsg(msg)
  const canManageGame = isGameCard && isOwn && !msg.is_deleted && !(msg as any).view_once
  // Photo/video messages get a slim dedicated menu (no text/AI actions).
  const isMedia = isMediaMsg(msg)
  // Legacy sealed rows (pre-E2EE-removal): try opening with this device's
  // stored key; otherwise show a placeholder instead of base64.
  const legacySealed = !!msg.is_encrypted && msg.message_type === 'text' && !msg.is_deleted
  const legacy = useLegacyDecrypted(msg)
  const meId = useAuthStore(s => s.user?.id)
  // View-once reveal state (recipient side only; the server burns on read).
  const [voText, setVoText] = useState<string | null>(null)
  const [voBusy, setVoBusy] = useState(false)
  const [voBurned, setVoBurned] = useState(false)
  const voShell = !!msg.view_once && !isOwn && !msg.is_deleted && !msg.viewed_once && !voBurned && voText == null
  const voGoneUi = !!msg.view_once && !isOwn && !msg.is_deleted && (voBurned || (!!msg.viewed_once && voText == null))
  const revealOnce = async () => {
    if (voBusy || !voShell || meId == null) return
    setVoBusy(true)
    try {
      const d = (await msgApi.viewOnce(msg.id))?.data
      if (!d || d.content == null) { setVoBurned(true); return }
      if (d.is_encrypted) {
        // Legacy sealed view-once: open with this device's stored key.
        // The server already burned it, so failure means it is gone.
        let text: string | null = null
        try {
          const sk = meId != null ? loadStoredPrivateKey(meId) : null
          const peerB64 =
            sk && msg.sender_id != null
              ? (await api.get(`/api/users/keys/${msg.sender_id}`))?.data?.data
                  ?.identity_pubkey ?? null
              : null
          text = sk ? openSealed(d.content, d.nonce, sk, peerB64) : null
        } catch {}
        if (text == null) { setVoBurned(true); return }
        setVoText(text)
        return
      }
      setVoText(d.content as string)
    } catch (e: any) {
      if (e?.response?.status === 410) setVoBurned(true)
    } finally {
      setVoBusy(false)
    }
  }
  // AI actions (summarize/translate/explain) operate on message content.
  const actionMsg = msg
  const attachments = (msg.attachments || []).filter(Boolean)
  // mime_type/file_path can be NULL on legacy rows (the API passes them
  // through as null) — never let one bad attachment crash the whole view.
  const mimeOf = (a: any) => (typeof a?.mime_type === 'string' ? a.mime_type : '')
  const imgAtts = attachments.filter(a=> mimeOf(a).startsWith('image/'))
  const audioAtts = attachments.filter(a=> mimeOf(a).startsWith('audio/'))
  const videoAtts = attachments.filter(a=> mimeOf(a).startsWith('video/'))
  const fileAtts = attachments.filter(a=> !mimeOf(a).startsWith('image/') && !mimeOf(a).startsWith('audio/') && !mimeOf(a).startsWith('video/'))

  const isPdf = (a: { mime_type?: string | null; filename?: string | null; original_filename?: string | null }) =>
    mimeOf(a).includes('pdf') || /\.pdf$/i.test(a?.original_filename || a?.filename || '')

  const resolveAttUrl = (a: { filename?: string | null; file_path?: string | null; cloudinary_url?: string | null; url?: string }) =>
    a?.cloudinary_url || (a as any)?.url || ((typeof a?.file_path === 'string' && a.file_path.startsWith('/api')) ? a.file_path : `/api/uploads/file/${a?.filename || ''}`)
  const isSaved = savedIds?.has(msg.id)
  const [showMenu, setShowMenu]=useState(false)
  const [showInfo, setShowInfo]=useState(false)
  // WhatsApp-style interactions: single tap opens the sheet, double-tap
  // opens reactions, right-swipe replies. The tap timer lets a second tap
  // pre-empt the sheet.
  const [showReactPicker, setShowReactPicker]=useState(false)
  const [showCustomEmoji, setShowCustomEmoji]=useState(false)
  const tapTimer = useRef<any>(null)
  const lastTap = useRef(0)
  const swipeStart = useRef<{x:number,y:number}|null>(null)
  const reactBtnRef = useRef<HTMLButtonElement | null>(null)
  const [pickerPos, setPickerPos] = useState<{ bottom: number; left: number } | null>(null)
  useEffect(() => () => { if (tapTimer.current) clearTimeout(tapTimer.current) }, [])

  // Reaction picker floats in a portal: ancestor overflow-hidden (bubble
  // row) and backdrop-filter (tinted bubbles) would clip or trap it.
  const openPicker = () => {
    let pos: { bottom: number; left: number } | null = null
    try {
      const r = reactBtnRef.current?.getBoundingClientRect()
      if (r && typeof window !== 'undefined') {
        pos = {
          bottom: Math.max(8, window.innerHeight - r.top + 8),
          left: Math.max(8, Math.min(r.left, window.innerWidth - 316)),
        }
      }
    } catch {}
    setPickerPos(pos)
    setShowCustomEmoji(false)
    setShowReactPicker(true)
  }
  const closePicker = () => {
    setShowReactPicker(false)
    setShowCustomEmoji(false)
  }
  const safeCopy = onCopy || ((t:string)=> navigator.clipboard.writeText(t))
  const toast = useToastStore((s) => s.push)
  const safeForward = onForward || (()=>{})
  const safeSave = onSave || (()=>{})
  const safeSelect = onSelect || (()=>{})
  const safeReport = onReport || (()=>{})
  const safeImageClick = onImageClick || ((url:string, name:string)=> window.open(url, '_blank'))
  const sheetAllowed = !!onMobileMore && !msg.is_deleted && (!isGameCard || canManageGame)

  const inInteractive = (t: HTMLElement | null) =>
    !!t && typeof t.closest === 'function' && !!t.closest('input,textarea,select,button,a,video,audio,iframe,[role="slider"]')

  // Single tap opens the sheet (slightly delayed); a second tap within
  // 300ms cancels it and opens the reaction picker instead (WhatsApp-style).
  const handleTap = (e: React.SyntheticEvent) => {
    const t = e.target as HTMLElement | null
    if (inInteractive(t)) return
    if (!sheetAllowed) return
    const now = Date.now()
    if (lastTap.current && now - lastTap.current < 300) {
      lastTap.current = 0
      if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null }
      if (!msg.is_deleted && !isGameCard) openPicker()
      return
    }
    lastTap.current = now
    if (tapTimer.current) clearTimeout(tapTimer.current)
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null
      if (sheetAllowed) onMobileMore!(msg)
    }, 300)
  }

  // WhatsApp-style swipe-right to reply. Touch + mouse drag; text selection
  // and interactive children never trigger it.
  const swipeOkTarget = (e: { target: unknown }) => !inInteractive(e.target as HTMLElement | null)
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    if (t) swipeStart.current = { x: t.clientX, y: t.clientY }
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const s = swipeStart.current
    swipeStart.current = null
    if (!s || msg.is_deleted || isGameCard || !swipeOkTarget(e)) return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (dx > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onReply(msg)
  }
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    swipeStart.current = { x: e.clientX, y: e.clientY }
  }
  const handleMouseUp = (e: React.MouseEvent) => {
    const s = swipeStart.current
    swipeStart.current = null
    if (!s || msg.is_deleted || isGameCard || !swipeOkTarget(e)) return
    try {
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed) return
    } catch {}
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (dx > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onReply(msg)
  }
  const isVoice = msg.message_type === 'voice'
  const isAi = (msg as any).message_type === 'ai' && !msg.is_deleted
  const isVideoNote = (msg as any).message_type === 'video_note' && !msg.is_deleted
  const [speaking, setSpeaking] = useState(false)
  const [translated, setTranslated] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)
  const [showOrig, setShowOrig] = useState(false)

  // Auto-translate: per-chat target language (ChatView prop). Cached per
  // message; own/secret/non-text messages are never sent anywhere.
  useEffect(() => {
    setTranslated(null)
    setShowOrig(false)
    if (!autoTranslateLang || isOwn || msg.is_deleted || msg.is_encrypted || (msg as any).view_once) return
    if (msg.message_type !== 'text') return
    const body = (content || '').trim()
    if (!body) return
    const hit = transCache.get(msg.id)
    if (hit) {
      setTranslated(hit)
      return
    }
    let cancelled = false
    setTranslating(true)
    aiApi
      .translate(body.slice(0, 1000), autoTranslateLang)
      .then((r: any) => {
        const t = r?.data?.translation || r?.data?.result || r?.data?.reply || null
        if (!cancelled && t) {
          transCache.set(msg.id, t)
          setTranslated(t)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTranslating(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg.id, autoTranslateLang])

  const listen = () => {
    if (speaking) {
      stopSpeak()
      setSpeaking(false)
      setShowMenu(false)
      return
    }
    const said = speakText(content || '', () => setSpeaking(false))
    if (said) setSpeaking(true)
    else toast('Read-aloud is not supported in this browser', 'error')
    setShowMenu(false)
  }
  const [transcription, setTranscription] = useState<string|null>(null)
  const [transcribing, setTranscribing] = useState(false)

  const allImages = imgAtts.map(a=> ({ url: resolveAttUrl(a), name: a.original_filename }))
  // Full viewer list: images first, then videos (indices stay stable for images).
  const allViewerMedia = [
    ...imgAtts.map(a=> ({ url: resolveAttUrl(a), name: a.original_filename, type: a.mime_type })),
    ...videoAtts.map(a=> ({ url: resolveAttUrl(a), name: a.original_filename, type: a.mime_type })),
  ]

  // Stickers (and pasted single-image links) arrive as a lone image URL in
  // the text body — render them as a sticker image, not as link text.
  const trimmedContent = (content || '').trim()
  const loneImageUrl = !msg.is_deleted && /^https?:\/\/[^\s]+\.(png|jpe?g|gif|webp)(\?[^\s]*)?$/i.test(trimmedContent)
    ? trimmedContent
    : null

  // Media auto-download: off => heavy inline media stays unloaded behind a
  // tap-to-load placeholder (files were always manual; voice streams on play).
  const autoDownload = useSettingsStore(s => s.media_auto_download)
  const showLinkPreviews = useSettingsStore(s => s.link_previews)
  const [mediaRevealed, setMediaRevealed] = useState(false)
  const mediaGated = !autoDownload && !mediaRevealed && !msg.is_deleted
    && (imgAtts.length > 0 || videoAtts.length > 0 || !!loneImageUrl)

  return (
    <div className={`flex ${isOwn?'justify-end':'justify-start'} group px-2 sm:px-4 py-1 min-w-0 max-w-full overflow-hidden ${isSelected ? 'bg-primary/5' : ''} msg-enter`} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}>
      <div className="flex items-center mr-1 shrink-0">
        {onSelect && <input type="checkbox" checked={!!isSelected} onChange={()=> safeSelect(msg)} className={`w-4 h-4 rounded border ${isSelected ? 'block' : 'hidden sm:group-hover:block'}`} />}
      </div>
      <div className={`max-w-[85%] sm:max-w-[78%] md:max-w-[68%] lg:max-w-[62%] xl:max-w-[60%] relative min-w-0 ${isOwn?'items-end':'items-start'} flex flex-col`}>
        {isGroup && !isOwn && showAvatar && (
          <span className="text-[11px] font-semibold text-primary mb-1 ml-1 flex items-center gap-1.5">
            {(msg as any).sender_avatar ? <img src={(msg as any).sender_avatar} alt="" className="w-5 h-5 rounded-full object-cover kryzen-avatar-tiny" /> : null}
            {isAi ? `🤖 ${msg.sender_display_name || 'Kryzen AI'}` : msg.sender_display_name}
          </span>
        )}
        {msg.reply_to_content && (
          <div className={`text-xs px-3 py-1.5 rounded-t-xl border-l-2 -mb-1 mx-1 kryzen-reply-bar ${isOwn?'bg-primary/10 border-primary text-muted-foreground':'bg-muted border-muted-foreground'}`}>
            <span className="line-clamp-1 italic">↳ {msg.reply_to_content}</span>
          </div>
        )}
        <div className={`msg-text relative px-3.5 py-2.5 text-sm leading-relaxed break-words break-all sm:break-words min-w-0 max-w-full overflow-hidden ${msg.is_deleted ? 'bg-muted text-muted-foreground italic border border-dashed rounded-2xl' : isAi ? 'rounded-2xl rounded-bl-md ring-1 ring-violet-400/50' : isOwn ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md'}`} style={msg.is_deleted ? undefined : isAi ? { background: 'linear-gradient(135deg, rgba(124,92,252,0.28), rgba(34,211,238,0.16))', backdropFilter: 'blur(12px)', border: '1px solid rgba(124,92,252,0.45)', boxShadow: '0 4px 20px rgba(124,92,252,0.25), inset 0 1px 0 rgba(255,255,255,0.08)', color: '#f0f0ff' } : isOwn ? { background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', color: 'var(--accent-contrast)', boxShadow: '0 4px 20px var(--accent-glow), 0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)' } : { background: 'rgba(20,20,42,0.92)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)', color: '#f0f0ff' }} onClick={handleTap}>
          {imgAtts.length>0 && !msg.is_deleted && !mediaGated && (
            <div className={`grid gap-1 mb-2 -mx-1 min-w-0 max-w-full overflow-hidden ${imgAtts.length>1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {imgAtts.map((img,i)=> {
                const url = resolveAttUrl(img)
                return <img key={img.id} src={url} alt={img.original_filename} loading="lazy" decoding="async" className="rounded-xl max-h-64 w-full max-w-full min-w-0 object-cover cursor-pointer" onClick={()=> safeImageClick(url, img.original_filename, allViewerMedia, i)} />
              })}
            </div>
          )}
          {isVideoNote && videoAtts.length>0 && !mediaGated && (
            <div className="flex flex-col items-center gap-1 mb-2 -mx-1 min-w-0 max-w-full overflow-hidden">
              {videoAtts.map((v) => {
                const url = resolveAttUrl(v)
                return <VideoNotePlayer key={v.id} src={url} duration={(msg as any).voice_duration} />
              })}
            </div>
          )}
          {!isVideoNote && videoAtts.length>0 && !msg.is_deleted && !mediaGated && (
            <div className="flex flex-col gap-1 mb-2 -mx-1 min-w-0 max-w-full overflow-hidden">
              {videoAtts.map((v, vi) => {
                const url = resolveAttUrl(v)
                return (
                  <video
                    key={v.id}
                    src={url}
                    controls
                    playsInline
                    preload="metadata"
                    className="rounded-xl max-h-64 w-full max-w-full min-w-0 bg-black object-contain cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); safeImageClick(url, v.original_filename, allViewerMedia, imgAtts.length + vi) }}
                  />
                )
              })}
            </div>
          )}
          {fileAtts.map(f=> {
            const href = resolveAttUrl(f)
            const pdf = isPdf(f)
            return (
              <div key={f.id} className={`flex items-center gap-2 p-2 rounded-xl mb-2 min-w-0 w-full max-w-full overflow-hidden ${isOwn?'bg-white/15':'bg-muted'}`}>
                <div className="w-8 h-8 shrink-0 rounded-lg bg-background flex items-center justify-center text-xs">{pdf ? '📕' : '📄'}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate block max-w-full">{f.original_filename}</p>
                  <p className="text-[11px] opacity-70 truncate block max-w-full">{(f.file_size/1024).toFixed(1)} KB • {pdf ? 'PDF document' : 'Document'}</p>
                  <div className="flex items-center gap-3 mt-1" onClick={(e) => e.stopPropagation()}>
                    <a href={href} target="_blank" rel="noreferrer" className="text-[11px] underline font-medium" onClick={(e) => e.stopPropagation()}>
                      Download
                    </a>
                    {pdf && !msg.is_deleted && (
                      <button
                        type="button"
                        onClick={() => safeImageClick(href, f.original_filename, [{ url: href, name: f.original_filename, type: 'application/pdf' }], 0)}
                        className="text-[11px] underline font-medium"
                      >
                        Preview
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {!msg.is_deleted && audioAtts.length > 0 && (
            <div className="flex flex-col gap-1 mb-1 -mx-1 min-w-0 max-w-full overflow-hidden">
              {audioAtts.map(a => (
                <VoicePlayer
                  key={a.id}
                  src={a.cloudinary_url || (msg as any).voice_cloudinary_url || resolveAttUrl(a)}
                  duration={(msg as any).voice_duration}
                  isOwn={isOwn}
                  fileName={a.original_filename}
                />
              ))}
            </div>
          )}
          {voGoneUi ? (
            <p className="italic opacity-70 text-xs">👁 Opened — this message is gone</p>
          ) : voShell ? (
            <button onClick={(e) => { e.stopPropagation(); revealOnce() }} disabled={voBusy} className="flex flex-col items-center gap-1 py-3 px-6 disabled:opacity-60">
              <span className="text-2xl">👁</span>
              <span className="text-sm font-medium">{voBusy ? 'Opening…' : 'Tap to view'}</span>
              <span className="text-[11px] opacity-70">Deletes after viewing</span>
            </button>
          ) : voText != null ? (
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] selectable">{voText}</p>
          ) : legacySealed ? (
            legacy.s === 'open' ? (
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] selectable">{legacy.text}</p>
            ) : legacy.s === 'failed' ? (
              <p className="italic opacity-70 text-xs">🔒 Encrypted message</p>
            ) : (
              <p className="opacity-60 text-xs">🔒 Decrypting…</p>
            )
          ) : mediaGated ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setMediaRevealed(true) }}
                className="flex items-center gap-2.5 py-3 px-4 my-1 rounded-xl border border-dashed border-current opacity-80 hover:opacity-100 transition-opacity"
              >
                <Download className="w-5 h-5 shrink-0" />
                <span className="text-left">
                  <span className="block text-sm font-medium">
                    {imgAtts.length + videoAtts.length + (loneImageUrl ? 1 : 0)} media file{(imgAtts.length + videoAtts.length + (loneImageUrl ? 1 : 0)) === 1 ? '' : 's'}
                  </span>
                  <span className="block text-xs opacity-70">Auto-download off — tap to load</span>
                </span>
              </button>
              {!loneImageUrl && !!content && (
                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] selectable">{content}</p>
              )}
            </>
          ) : isChallenge ? (
            <TicTacToeGame
              challenge={msg}
              msgs={gameMsgs || []}
              meId={meId}
              onMove={(c, pos) => onGameMove?.(c, pos)}
              onRematch={() => onGameRematch?.('ttt')}
            />
          ) : isRps ? (
            <RpsGame
              challenge={msg}
              msgs={gameMsgs || []}
              meId={meId}
              onThrow={(c, choice) => onRpsThrow?.(c, choice)}
              onRematch={() => onGameRematch?.('rps')}
            />
          ) : isC4 ? (
            <ConnectFourGame
              challenge={msg}
              msgs={gameMsgs || []}
              meId={meId}
              onMove={(c, col) => onC4Move?.(c, col)}
              onRematch={() => onGameRematch?.('c4')}
            />
          ) : isEmoji ? (
            <EmojiMovieGame
              challenge={msg}
              msgs={gameMsgs || []}
              onGuess={(c, guess) => onEmojiGuess?.(c, guess)}
              onRematch={() => onGameRematch?.('emoji')}
            />
          ) : isChess ? (
            <ChessGame
              challenge={msg}
              msgs={gameMsgs || []}
              meId={meId}
              onMove={(c, from, to) => onChessMove?.(c, from, to)}
              onRematch={() => onGameRematch?.('chess')}
            />
          ) : isTod ? (
            <TruthOrDareGame
              challenge={msg}
              msgs={gameMsgs || []}
              onSpin={(c, kind, index) => onTodSpin?.(c, kind, index)}
              onDone={(c) => onTodDone?.(c)}
              onRematch={() => onGameRematch?.('tod')}
            />
          ) : isWc ? (
            <WordChainGame
              challenge={msg}
              msgs={gameMsgs || []}
              onWord={(c, word) => onWordChain?.(c, word)}
              onRematch={() => onGameRematch?.('wc')}
            />
          ) : isWt ? (
            <WatchTogether
              challenge={msg}
              msgs={gameMsgs || []}
              meId={meId}
              onState={(c, action, pos) => onWTState?.(c, action, pos)}
            />
          ) : isMys ? (
            <MysteryGame
              challenge={msg}
              msgs={gameMsgs || []}
              meId={meId}
              onClue={(c, n) => onMysClue?.(c, n)}
              onAccuse={(c, s) => onMysAccuse?.(c, s)}
              onDone={(c) => onMysDone?.(c)}
              onRematch={() => onGameRematch?.('mys')}
            />
          ) : isTH ? (
            <TreasureHunt
              challenge={msg}
              msgs={gameMsgs || []}
              onFound={(c, n) => onTHFound?.(c, n)}
              onDone={(c) => onTHDone?.(c)}
              onRematch={() => onGameRematch?.('th')}
            />
          ) : contact ? (
            <div className="flex items-center gap-3 min-w-[210px] max-w-[260px]">
              <div className="w-11 h-11 rounded-full kryzen-accent-gradient text-white flex items-center justify-center text-sm font-bold overflow-hidden shrink-0">
                {contact.avatar_url ? <img src={contact.avatar_url} alt="" className="w-full h-full object-cover" /> : (contact.display_name || contact.username || '?')[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{contact.display_name || contact.username}</p>
                <p className="text-xs opacity-70 truncate">{contact.username ? `@${contact.username}` : 'Contact'}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onContactChat?.(contact) }}
                className="px-3 py-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-medium shrink-0 transition"
              >
                Chat
              </button>
            </div>
          ) : liveSessionId ? (
            <LiveLocationCard
              sessionId={liveSessionId}
              isOwn={isOwn}
              sharerName={msg.sender_display_name || (msg as any).sender_username}
              sharerId={(msg as any).sender_id}
              myId={meId}
            />
          ) : location ? (
            <LocationCard lat={location.lat} lon={location.lon} url={location.url} isOwn={isOwn} />
          ) : loneImageUrl ? (
            <img
              src={loneImageUrl}
              alt="sticker"
              loading="lazy"
              className="rounded-xl max-h-44 w-auto max-w-full object-contain cursor-pointer sticker-pop"
              onClick={() => safeImageClick(loneImageUrl, 'sticker', [{ url: loneImageUrl, name: 'sticker' }], 0)}
            />
          ) : (
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] selectable">{renderFormattedText(translated && !showOrig ? translated : content)}</p>
          )}
          {(msg as any).is_passport && !msg.is_deleted && (
            <button
              onClick={(e) => { e.stopPropagation(); onPassportJourney?.(msg) }}
              className="mt-1.5 flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/15 text-sky-300 text-[11px] font-semibold hover:bg-sky-500/25 transition"
              title="See every hand this message passed through"
            >
              ✈️ Passport — tap to see journey
            </button>
          )}
          {canManageGame && (
            <div className="mt-1.5 flex gap-1.5" onClick={(e)=>e.stopPropagation()}>
              <button
                onClick={(e)=>{ e.stopPropagation(); onDelete(msg) }}
                className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-black/25 hover:bg-black/40 text-[11px] font-semibold text-white/90 transition min-h-[36px]"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete game
              </button>
            </div>
          )}
          {translated && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowOrig((v) => !v) }}
              className="mt-1 text-[11px] opacity-70 hover:opacity-100 underline underline-offset-2"
            >
              🌐 {showOrig ? 'Show translation' : 'Translated — show original'}
            </button>
          )}
          {!translated && translating && !!autoTranslateLang && (
            <p className="mt-1 text-[11px] opacity-50 animate-pulse">Translating…</p>
          )}
          {isVoice && !transcription && (
            <button onClick={async ()=>{
              setTranscribing(true)
              try {
                const att = (msg.attachments || [])[0]
                if (att) {
                  const url = resolveAttUrl(att)
                  const blob = await fetch(url).then(r=> r.blob())
                  const file = new File([blob], att.filename, { type: att.mime_type })
                  const res = await aiApi.transcribe(file)
                  setTranscription(res.data?.transcription || 'No transcription available')
                }
              } catch { setTranscription('Transcription failed') }
              setTranscribing(false)
            }} disabled={transcribing}
              className="mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs hover:bg-primary/20 disabled:opacity-50 transition-colors">
              <Mic className="w-3 h-3"/> {transcribing ? 'Transcribing...' : 'Transcribe'}
            </button>
          )}
          {transcription && (
            <div className="mt-2 p-2 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary">
              <span className="font-medium">Transcription:</span> {transcription}
            </div>
          )}
          {showLinkPreviews && !msg.is_deleted && !loneImageUrl && !location && content && hasUrl(content) && extractUrls(content).map((url, i) => <LinkPreview key={i} url={url} />)}
          {(msg as any).is_pinned && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-primary/70"><Pin className="w-3 h-3" /> Pinned</div>
          )}
          {(msg.reactions || []).length>0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {Object.entries((msg.reactions || []).reduce((acc:any, r)=>{
                acc[r.emoji]=(acc[r.emoji]||0)+1
                return acc
              }, {})).map(([emoji, count]:any)=>(
                <span key={emoji} className="px-1.5 py-0.5 rounded-full bg-background border text-xs shadow-sm">{emoji} {count as number}</span>
              ))}
            </div>
          )}
          <div className={`flex items-center gap-1 mt-1 text-[11px] ${isOwn?'text-primary-foreground/70 justify-end':'text-muted-foreground'}`}>
            <span>{formatTime(msg.created_at)}</span>
            {msg.is_edited && !msg.is_deleted && <span className="italic">• edited</span>}
            {(msg as any).status === 'failed' && !msg.is_deleted ? (
              <button
                onClick={(e) => { e.stopPropagation(); onRetry?.(msg) }}
                className={`ml-1 flex items-center gap-1 font-semibold ${isOwn ? 'text-red-200 hover:text-white' : 'text-red-400 hover:text-red-300'}`}
                title="Message not delivered — tap to retry"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Not sent
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            ) : isOwn && !msg.is_deleted && (
              <span className="ml-1" title={msg.status === 'sending' ? 'Sending…' : msg.status}>
                {msg.status==='read' ? <CheckCheck className="w-3.5 h-3.5 text-sky-300" style={{ filter: 'drop-shadow(0 0 3px rgba(125,211,252,0.8))' }}/> : msg.status==='delivered' ? <CheckCheck className="w-3.5 h-3.5 opacity-70"/> : msg.status==='sending' ? <Clock className="w-3.5 h-3.5 opacity-70 animate-pulse"/> : <Check className="w-3.5 h-3.5 opacity-70"/>}
              </span>
            )}
            {!isGameCard && !msg.is_deleted && (
              <button
                ref={reactBtnRef}
                aria-label="React to message"
                title="React"
                onClick={(e)=>{ e.stopPropagation(); if (showReactPicker) closePicker(); else openPicker() }}
                className="ml-auto p-1 rounded-full opacity-60 hover:opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
              >
                <Smile className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {!isGameCard ? (
          <div className={`absolute ${isOwn?'left-0 -translate-x-full':'right-0 translate-x-full'} top-1/2 -translate-y-1/2 hidden sm:group-hover:flex items-center gap-1 p-1 rounded-full kryzen-msg-actions z-10`}>
            <button onClick={()=>setShowMenu(!showMenu)} className="p-1.5 hover:bg-muted rounded-full" title="More"><MoreHorizontal className="w-3.5 h-3.5"/></button>
            {isOwn && !msg.is_deleted && !(msg as any).view_once && <>
              <button onClick={()=>onEdit(msg)} className="p-1.5 hover:bg-muted rounded-full" title="Edit"><Edit3 className="w-3.5 h-3.5"/></button>
              <button onClick={()=>onDelete(msg)} className="p-1.5 hover:bg-muted rounded-full text-destructive" title="Delete"><Trash2 className="w-3.5 h-3.5"/></button>
            </>}
          </div>
          ) : null}
          {showMenu && !isGameCard && (
            <div className={`absolute ${isOwn?'left-0' : 'right-0'} top-full mt-2 w-44 rounded-xl kryzen-dropdown-glass py-1 z-20 text-sm`}>
              {!isMedia && (
              <button onClick={()=>{ safeCopy(content || ''); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Copy className="w-3.5 h-3.5"/> Copy</button>
              )}
              {speechSupported() && !msg.is_deleted && !isMedia && !!content?.trim() && (
                <button onClick={listen} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Volume2 className="w-3.5 h-3.5"/> {speaking ? 'Stop' : 'Listen'}</button>
              )}
              <button onClick={()=>{ safeForward(msg); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Forward className="w-3.5 h-3.5"/> Forward</button>
              <button onClick={()=>{ safeSave(msg); setShowMenu(false)}} className={`w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 ${isSaved? 'text-primary' : ''}`}><Bookmark className="w-3.5 h-3.5"/> {isSaved? 'Unsave':'Save'}</button>
              {onPin && !isMedia && <button onClick={()=>{ onPin(msg); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Pin className="w-3.5 h-3.5"/> {(msg as any).is_pinned ? 'Unpin' : 'Pin'}</button>}
              <button onClick={()=>{ safeSelect(msg); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Flag className="w-3.5 h-3.5"/> Select</button>
              {!isOwn && onReport && !msg.is_deleted && (
                <button onClick={()=>{ safeReport(msg); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-amber-500"><Flag className="w-3.5 h-3.5"/> Report</button>
              )}
              {isOwn && !msg.is_deleted && (
                <button onClick={()=>{ setShowInfo(true); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Info className="w-3.5 h-3.5"/> Info</button>
              )}
              {onAIAction && actionMsg && content && !msg.is_deleted && !isMedia && (
                <>
                  <div className="border-t my-1"/>
                  <button onClick={()=>{ onAIAction(actionMsg, 'summarize'); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-primary"><Sparkles className="w-3.5 h-3.5"/> Summarize</button>
                  <button onClick={()=>{ onTranslateAction?.(actionMsg); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-primary"><Languages className="w-3.5 h-3.5"/> Translate</button>
                  <button onClick={()=>{ onAIAction(actionMsg, 'explain'); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-primary"><FileText className="w-3.5 h-3.5"/> Explain</button>
                </>
              )}
            </div>
          )}
        </div>
        {showReactPicker && !isGameCard && !msg.is_deleted && createPortal(
          <>
            <button
              aria-label="Close reactions"
              onClick={(e)=>{ e.stopPropagation(); closePicker() }}
              className="fixed inset-0 z-[70] bg-transparent border-0 p-0 cursor-default"
            />
            <div role="dialog" aria-label="Choose a reaction" className="fixed z-[71] shadow-xl" style={pickerPos ?? { bottom: 96, left: 16 }} onClick={(e)=> e.stopPropagation()}>
              <div className="flex items-center gap-0.5 p-1.5 rounded-2xl border bg-card">
                {REACTIONS.map(e=> (
                  <button key={e} aria-label={`React ${e}`} onClick={()=>{ onReact(msg.id, e); closePicker() }} className="p-1.5 rounded-full text-lg hover:bg-muted transition-transform active:scale-90">{e}</button>
                ))}
                <button aria-label="More reactions" title="More reactions" onClick={()=> setShowCustomEmoji(v=>!v)} className="p-1.5 rounded-full hover:bg-muted">
                  <SmilePlus className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              {showCustomEmoji && (
                <div className="mt-1 rounded-2xl overflow-hidden border bg-card shadow-xl">
                  <Suspense fallback={<div className="h-[320px] w-[300px] skeleton" aria-label="Loading emoji" />}>
                    <EmojiPicker
                      onEmojiClick={(e)=>{ onReact(msg.id, e.emoji); closePicker() }}
                      height={320}
                      width={300}
                      skinTonesDisabled
                      searchDisabled
                      theme={pickEmojiTheme()}
                    />
                  </Suspense>
                </div>
              )}
            </div>
          </>,
          document.body,
        )}
      </div>
      {showInfo && isOwn && !msg.is_deleted && (
        <MessageInfo msgId={msg.id} onClose={() => setShowInfo(false)} />
      )}
    </div>
  )
}
