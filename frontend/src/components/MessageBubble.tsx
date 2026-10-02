import { Message } from '../types'
import { formatTime } from '../utils/format'
import { Check, CheckCheck, Clock, Reply, Trash2, Edit3, Copy, Forward, Bookmark, MoreHorizontal, Flag, Pin, Sparkles, Languages, FileText, Mic, Play, Pause, RotateCcw, AlertTriangle, Download, Sunrise, SmilePlus } from 'lucide-react'
import EmojiPicker from 'emoji-picker-react'
import { useState, useRef, useEffect } from 'react'
import { LinkPreview, hasUrl, extractUrls } from './LinkPreview'
import { aiApi, msgApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import { useSettingsStore } from '../store/settings'
import api from '../services/api'
import { useLegacyDecrypted, loadStoredPrivateKey, openSealed } from '../utils/legacyE2ee'
import { fireEffect, fireEmojiBurst, prettyPreview } from '../utils/messageEffects'
import { scheduleMessageReminder, formatFireAt } from '../utils/reminders'
import { useToastStore } from '../store/toast'
import { TicTacToeGame, isTTTChallenge } from './TicTacToeGame'
import { RpsGame, isRpsChallenge, type RpsChoice } from './RockPaperScissors'
import { ConnectFourGame, isC4Challenge } from './ConnectFour'

const REACTIONS = ['👍','❤️','😂','😮','😢','😡']

const fmtDur = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

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

  // Waveform peaks decoded once per voice note (cached per mount).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext
        if (!AC) return
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
          if (!cancelled && out.some((v) => v > 0)) setPeaks(out)
        } finally {
          ctx.close().catch(() => {})
        }
      } catch {}
    })()
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

export function MessageBubble({ msg, isOwn, isGroup, showAvatar, onReply, onEdit, onDelete, onReact, onCopy, onForward, onSave, onSelect, isSelected, onImageClick, savedIds, onPin, onAIAction, onTranslateAction, onMobileMore, onRetry, gameMsgs, onGameMove, onGameRematch, onRpsThrow, onC4Move, convTitle }: {
  msg: Message, isOwn:boolean, isGroup:boolean, showAvatar:boolean,
  onReply:(m:Message)=>void, onEdit:(m:Message)=>void, onDelete:(m:Message)=>void, onReact:(id:number, e:string)=>void,
  onCopy?:(t:string)=>void, onForward?:(m:Message)=>void, onSave?:(m:Message)=>void, onSelect?:(m:Message)=>void, isSelected?:boolean,
  onImageClick?:(url:string, name:string, all:{url:string,name:string,type?:string}[], idx:number)=>void,
  savedIds?:Set<number>, onPin?:(m:Message)=>void,
  onAIAction?:(msg:Message, action:string)=>void,
  onTranslateAction?:(msg:Message)=>void,
  onMobileMore?:(msg:Message)=>void,
  onRetry?:(msg:Message)=>void,
  gameMsgs?:any[], onGameMove?:(challenge:any, pos:number)=>void, onGameRematch?:(kind: 'ttt' | 'rps' | 'c4')=>void,
  onRpsThrow?:(challenge:any, choice:RpsChoice)=>void, onC4Move?:(challenge:any, col:number)=>void,
  convTitle?:string
}) {
  const content = msg.is_deleted ? 'Message deleted' : prettyPreview(msg.content)
  const isChallenge = !msg.is_deleted && isTTTChallenge(msg.content)
  const isRps = !msg.is_deleted && isRpsChallenge(msg.content)
  const isC4 = !msg.is_deleted && isC4Challenge(msg.content)
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
  const [showCustomReact, setShowCustomReact]=useState(false)
  const safeCopy = onCopy || ((t:string)=> navigator.clipboard.writeText(t))
  const toast = useToastStore((s) => s.push)
  const remind = (when: 'hour' | 'morning') => {
    scheduleMessageReminder(
      { convId: (msg as any).conversation_id ?? null, convTitle: convTitle || 'Chat', msg },
      when,
    )
      .then((r) => toast(`Remind set for ${formatFireAt(r.fireAt)}`, 'success'))
      .catch(() => toast('Could not set reminder', 'error'))
  }
  const safeForward = onForward || (()=>{})
  const safeSave = onSave || (()=>{})
  const safeSelect = onSelect || (()=>{})
  const safeImageClick = onImageClick || ((url:string, name:string)=> window.open(url, '_blank'))
  const isVoice = msg.message_type === 'voice'
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
    <div className={`flex ${isOwn?'justify-end':'justify-start'} group px-2 sm:px-4 py-1 min-w-0 max-w-full overflow-hidden ${isSelected ? 'bg-primary/5' : ''} msg-enter`}>
      <div className="flex items-center mr-1 shrink-0">
        {onSelect && <input type="checkbox" checked={!!isSelected} onChange={()=> safeSelect(msg)} className={`w-4 h-4 rounded border ${isSelected ? 'block' : 'hidden sm:group-hover:block'}`} />}
      </div>
      <div className={`max-w-[85%] sm:max-w-[78%] md:max-w-[68%] lg:max-w-[62%] xl:max-w-[60%] relative min-w-0 ${isOwn?'items-end':'items-start'} flex flex-col`}>
        {isGroup && !isOwn && showAvatar && (
          <span className="text-[11px] font-semibold text-primary mb-1 ml-1 flex items-center gap-1.5">
            {(msg as any).sender_avatar ? <img src={(msg as any).sender_avatar} alt="" className="w-5 h-5 rounded-full object-cover kryzen-avatar-tiny" /> : null}
            {msg.sender_display_name}
          </span>
        )}
        {msg.reply_to_content && (
          <div className={`text-xs px-3 py-1.5 rounded-t-xl border-l-2 -mb-1 mx-1 kryzen-reply-bar ${isOwn?'bg-primary/10 border-primary text-muted-foreground':'bg-muted border-muted-foreground'}`}>
            <span className="line-clamp-1 italic">↳ {msg.reply_to_content}</span>
          </div>
        )}
        <div className={`msg-text relative px-3.5 py-2.5 text-sm leading-relaxed break-words break-all sm:break-words min-w-0 max-w-full overflow-hidden ${msg.is_deleted ? 'bg-muted text-muted-foreground italic border border-dashed rounded-2xl' : isOwn ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md'}`} style={msg.is_deleted ? undefined : isOwn ? { background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', color: 'var(--accent-contrast)', boxShadow: '0 4px 20px var(--accent-glow), 0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)' } : { background: 'rgba(20,20,42,0.92)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)', color: '#f0f0ff' }} onClick={()=>{ if (onMobileMore && !msg.is_deleted) onMobileMore(msg) }} onDoubleClick={(e)=>{ e.stopPropagation(); if (!msg.is_deleted) fireEffect('hearts') }}>
          {imgAtts.length>0 && !msg.is_deleted && !mediaGated && (
            <div className={`grid gap-1 mb-2 -mx-1 min-w-0 max-w-full overflow-hidden ${imgAtts.length>1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {imgAtts.map((img,i)=> {
                const url = resolveAttUrl(img)
                return <img key={img.id} src={url} alt={img.original_filename} loading="lazy" decoding="async" className="rounded-xl max-h-64 w-full max-w-full min-w-0 object-cover cursor-pointer" onClick={()=> safeImageClick(url, img.original_filename, allViewerMedia, i)} />
              })}
            </div>
          )}
          {videoAtts.length>0 && !msg.is_deleted && !mediaGated && (
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
          ) : loneImageUrl ? (
            <img
              src={loneImageUrl}
              alt="sticker"
              loading="lazy"
              className="rounded-xl max-h-44 w-auto max-w-full object-contain cursor-pointer sticker-pop"
              onClick={() => safeImageClick(loneImageUrl, 'sticker', [{ url: loneImageUrl, name: 'sticker' }], 0)}
            />
          ) : (
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] selectable">{content}</p>
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
          {showLinkPreviews && !msg.is_deleted && !loneImageUrl && content && hasUrl(content) && extractUrls(content).map((url, i) => <LinkPreview key={i} url={url} />)}
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
          </div>
          <div className={`absolute ${isOwn?'left-0 -translate-x-full':'right-0 translate-x-full'} top-1/2 -translate-y-1/2 hidden sm:group-hover:flex items-center gap-1 p-1 rounded-full kryzen-msg-actions z-10`}>
            {REACTIONS.slice(0,3).map(e=> (
              <button key={e} onClick={()=>{ onReact(msg.id,e); fireEmojiBurst([e]) }} className="p-1.5 hover:bg-muted rounded-full text-xs">{e}</button>
            ))}
            <button onClick={()=>setShowCustomReact(v=>!v)} className="p-1.5 hover:bg-muted rounded-full" title="Custom reaction"><SmilePlus className="w-3.5 h-3.5"/></button>
            {showCustomReact && (
              <div className="absolute bottom-full mb-2 right-0 z-30 shadow-xl rounded-2xl overflow-hidden" onClick={(e)=> e.stopPropagation()}>
                <EmojiPicker
                  onEmojiClick={(e)=>{ onReact(msg.id, e.emoji); fireEmojiBurst([e.emoji]); setShowCustomReact(false) }}
                  height={320}
                  width={300}
                  skinTonesDisabled
                  searchDisabled
                />
              </div>
            )}
            <div className="w-px h-5 bg-border mx-1"/>
            <button onClick={()=>onReply(msg)} className="p-1.5 hover:bg-muted rounded-full" title="Reply"><Reply className="w-3.5 h-3.5"/></button>
            <button onClick={()=>setShowMenu(!showMenu)} className="p-1.5 hover:bg-muted rounded-full" title="More"><MoreHorizontal className="w-3.5 h-3.5"/></button>
            {isOwn && !msg.is_deleted && !(msg as any).view_once && <>
              <button onClick={()=>onEdit(msg)} className="p-1.5 hover:bg-muted rounded-full" title="Edit"><Edit3 className="w-3.5 h-3.5"/></button>
              <button onClick={()=>onDelete(msg)} className="p-1.5 hover:bg-muted rounded-full text-destructive" title="Delete"><Trash2 className="w-3.5 h-3.5"/></button>
            </>}
          </div>
          {showMenu && (
            <div className={`absolute ${isOwn?'left-0' : 'right-0'} top-full mt-2 w-44 rounded-xl kryzen-dropdown-glass py-1 z-20 text-sm`}>
              <button onClick={()=>{ safeCopy(content || ''); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Copy className="w-3.5 h-3.5"/> Copy</button>
              <button onClick={()=>{ safeForward(msg); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Forward className="w-3.5 h-3.5"/> Forward</button>
              <button onClick={()=>{ safeSave(msg); setShowMenu(false)}} className={`w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 ${isSaved? 'text-primary' : ''}`}><Bookmark className="w-3.5 h-3.5"/> {isSaved? 'Unsave':'Save'}</button>
              {onPin && <button onClick={()=>{ onPin(msg); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Pin className="w-3.5 h-3.5"/> {(msg as any).is_pinned ? 'Unpin' : 'Pin'}</button>}
              <button onClick={()=>{ safeSelect(msg); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Flag className="w-3.5 h-3.5"/> Select</button>
              <button onClick={()=>{ fireEffect('hearts'); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><span className="w-3.5 h-3.5 text-center">💕</span> Blast</button>
              <button onClick={()=>{ remind('hour'); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Clock className="w-3.5 h-3.5"/> In 1 hour</button>
              <button onClick={()=>{ remind('morning'); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Sunrise className="w-3.5 h-3.5"/> At 9 AM</button>
              {onAIAction && actionMsg && content && !msg.is_deleted && (
                <>
                  <div className="border-t my-1"/>
                  <button onClick={()=>{ onAIAction(actionMsg, 'summarize'); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-primary"><Sparkles className="w-3.5 h-3.5"/> Summarize</button>
                  <button onClick={()=>{ onTranslateAction?.(actionMsg); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-primary"><Languages className="w-3.5 h-3.5"/> Translate</button>
                  <button onClick={()=>{ onAIAction(actionMsg, 'explain'); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-primary"><FileText className="w-3.5 h-3.5"/> Explain</button>
                </>
              )}
              <div className="border-t my-1"/>
              <div className="px-3 py-1 flex gap-1">
                {REACTIONS.map(e=> <button key={e} onClick={()=>{onReact(msg.id,e); fireEmojiBurst([e]); setShowMenu(false)}} className="flex-1 p-1 hover:bg-muted rounded text-xs">{e}</button>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
