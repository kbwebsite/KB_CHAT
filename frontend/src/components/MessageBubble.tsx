import { Message } from '../types'
import { formatTime } from '../utils/format'
import { Check, CheckCheck, Reply, Trash2, Edit3, Copy, Forward, Bookmark, MoreHorizontal, Flag, Pin, Sparkles, Languages, FileText, Mic, Play, Pause } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { LinkPreview, hasUrl, extractUrls } from './LinkPreview'
import { aiApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import { openMessage } from '../utils/e2ee'

const REACTIONS = ['👍','❤️','😂','😮','😢','😡']

type DecState = { s: 'plain' } | { s: 'loading' } | { s: 'failed' } | { s: 'open'; text: string }

/** Resolve displayable text for E2EE v1 messages (async device-side open). */
function useDecrypted(msg: Message): DecState {
  const meId = useAuthStore(s => s.user?.id)
  const [st, setSt] = useState<DecState>(msg.is_encrypted ? { s: 'loading' } : { s: 'plain' })
  useEffect(() => {
    if (!msg.is_encrypted || msg.message_type !== 'text') { setSt({ s: 'plain' }); return }
    if (meId == null) { setSt({ s: 'failed' }); return }
    let live = true
    setSt({ s: 'loading' })
    openMessage(msg, meId).then(t => {
      if (!live) return
      setSt(t == null ? { s: 'failed' } : { s: 'open', text: t })
    })
    return () => { live = false }
  }, [msg.id, (msg as any).nonce, meId])
  return st
}

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

  const toggle = () => {
    const el = audioRef.current
    if (!el || loadError) return
    if (playing) el.pause()
    else el.play().catch(() => setLoadError(true))
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
        className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-full transition-transform active:scale-95 ${isOwn ? 'bg-white/25 hover:bg-white/35 text-white' : 'bg-violet-500/20 hover:bg-violet-500/30 text-violet-300'}`}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
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
          className="w-full h-1 cursor-pointer accent-violet-400"
        />
        <div className={`text-[11px] tabular-nums ${isOwn ? 'text-white/80' : 'text-muted-foreground'}`}>
          {fmtDur(current)} / {fmtDur(total)}
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

export function MessageBubble({ msg, isOwn, isGroup, showAvatar, onReply, onEdit, onDelete, onReact, onCopy, onForward, onSave, onSelect, isSelected, onImageClick, savedIds, onPin, onAIAction, onTranslateAction, onMobileMore }: {
  msg: Message, isOwn:boolean, isGroup:boolean, showAvatar:boolean,
  onReply:(m:Message)=>void, onEdit:(m:Message)=>void, onDelete:(m:Message)=>void, onReact:(id:number, e:string)=>void,
  onCopy?:(t:string)=>void, onForward?:(m:Message)=>void, onSave?:(m:Message)=>void, onSelect?:(m:Message)=>void, isSelected?:boolean,
  onImageClick?:(url:string, name:string, all:{url:string,name:string}[], idx:number)=>void,
  savedIds?:Set<number>, onPin?:(m:Message)=>void,
  onAIAction?:(msg:Message, action:string)=>void,
  onTranslateAction?:(msg:Message)=>void,
  onMobileMore?:(msg:Message)=>void
}) {
  const content = msg.is_deleted ? 'Message deleted' : msg.content
  const dec = useDecrypted(msg)
  const locked = !!msg.is_encrypted && msg.message_type === 'text' && !msg.is_deleted
  const shownText = locked ? (dec.s === 'open' ? dec.text : null) : content
  const imgAtts = msg.attachments.filter(a=> a.mime_type.startsWith('image/'))
  const audioAtts = msg.attachments.filter(a=> a.mime_type.startsWith('audio/'))
  const fileAtts = msg.attachments.filter(a=> !a.mime_type.startsWith('image/') && !a.mime_type.startsWith('audio/'))

  const resolveAttUrl = (a: { filename: string; file_path: string; cloudinary_url?: string | null; url?: string }) =>
    a.cloudinary_url || a.url || (a.file_path.startsWith('/api') ? a.file_path : `/api/uploads/file/${a.filename}`)
  const isSaved = savedIds?.has(msg.id)
  const [showMenu, setShowMenu]=useState(false)
  const safeCopy = onCopy || ((t:string)=> navigator.clipboard.writeText(t))
  const safeForward = onForward || (()=>{})
  const safeSave = onSave || (()=>{})
  const safeSelect = onSelect || (()=>{})
  const safeImageClick = onImageClick || ((url:string, name:string)=> window.open(url, '_blank'))
  const isVoice = msg.message_type === 'voice'
  const [transcription, setTranscription] = useState<string|null>(null)
  const [transcribing, setTranscribing] = useState(false)

  const allImages = imgAtts.map(a=> ({ url: a.file_path.startsWith('/api') ? a.file_path : `/api/uploads/file/${a.filename}`, name: a.original_filename }))

  // Stickers (and pasted single-image links) arrive as a lone image URL in
  // the text body — render them as a sticker image, not as link text.
  // Encrypted bodies are ciphertext: never treat them as links/images.
  const trimmedContent = (!locked ? (content || '') : '').trim()
  const loneImageUrl = !msg.is_deleted && /^https?:\/\/[^\s]+\.(png|jpe?g|gif|webp)(\?[^\s]*)?$/i.test(trimmedContent)
    ? trimmedContent
    : null

  return (
    <div className={`flex ${isOwn?'justify-end':'justify-start'} group px-2 sm:px-4 py-1 overflow-hidden ${isSelected ? 'bg-primary/5' : ''} msg-enter`}>
      <div className="flex items-center mr-1 shrink-0">
        {onSelect && <input type="checkbox" checked={!!isSelected} onChange={()=> safeSelect(msg)} className={`w-4 h-4 rounded border ${isSelected ? 'block' : 'hidden sm:group-hover:block'}`} />}
      </div>
      <div className={`max-w-[85%] sm:max-w-[78%] md:max-w-[68%] lg:max-w-[62%] xl:max-w-[60%] relative min-w-0 ${isOwn?'items-end':'items-start'} flex flex-col`}>
        {isGroup && !isOwn && showAvatar && (
          <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 mb-1 ml-1 flex items-center gap-1.5">
            {(msg as any).sender_avatar ? <img src={(msg as any).sender_avatar} alt="" className="w-5 h-5 rounded-full object-cover kryzen-avatar-tiny" /> : null}
            {msg.sender_display_name}
          </span>
        )}
        {msg.reply_to_content && (
          <div className={`text-xs px-3 py-1.5 rounded-t-xl border-l-2 -mb-1 mx-1 kryzen-reply-bar ${isOwn?'bg-primary/10 border-primary text-muted-foreground':'bg-muted border-muted-foreground'}`}>
            <span className="line-clamp-1 italic">↳ {msg.reply_to_content}</span>
          </div>
        )}
        <div className={`relative px-3.5 py-2.5 text-sm leading-relaxed break-words break-all sm:break-words overflow-hidden ${msg.is_deleted ? 'bg-muted text-muted-foreground italic border border-dashed rounded-2xl' : isOwn ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md'}`} style={msg.is_deleted ? undefined : isOwn ? { background: 'linear-gradient(135deg, #7c5cfc, #a855f7)', color: 'white', boxShadow: '0 4px 20px rgba(124,92,252,0.4), 0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)' } : { background: 'rgba(20,20,42,0.92)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)', color: '#f0f0ff' }} onClick={()=>{ if (onMobileMore && !msg.is_deleted) onMobileMore(msg) }}>
          {imgAtts.length>0 && !msg.is_deleted && (
            <div className={`grid gap-1 mb-2 -mx-1 ${imgAtts.length>1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {imgAtts.map((img,i)=> {
                const url = img.file_path.startsWith('/api') ? img.file_path : `/api/uploads/file/${img.filename}`
                return <img key={img.id} src={url} alt={img.original_filename} className="rounded-xl max-h-64 w-full object-cover cursor-pointer" onClick={()=> safeImageClick(url, img.original_filename, allImages, i)} />
              })}
            </div>
          )}
          {fileAtts.map(f=> {
            const href = f.file_path.startsWith('/api') ? f.file_path : `/api/uploads/file/${f.filename}`
            return (
              <a key={f.id} href={href} target="_blank" rel="noreferrer" className={`flex items-center gap-2 p-2 rounded-xl mb-2 ${isOwn?'bg-white/15':'bg-muted'}`}>
                <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center text-xs">📄</div>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{f.original_filename}</p>
                  <p className="text-[11px] opacity-70">{(f.file_size/1024).toFixed(1)} KB • <span className="underline">Download</span></p>
                </div>
              </a>
            )
          })}
          {!msg.is_deleted && audioAtts.length > 0 && (
            <div className="flex flex-col gap-1 mb-1 -mx-1">
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
          {locked ? (
            dec.s === 'open' ? (
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] selectable"><span aria-label="End-to-end encrypted">🔒</span> {dec.text}</p>
            ) : dec.s === 'failed' ? (
              <p className="italic opacity-70 text-xs">🔒 Encrypted message — can't decrypt on this device</p>
            ) : (
              <p className="opacity-60 text-xs">🔒 Decrypting…</p>
            )
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
                const att = msg.attachments[0]
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
              className="mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 text-xs hover:bg-violet-500/20 disabled:opacity-50 transition-colors">
              <Mic className="w-3 h-3"/> {transcribing ? 'Transcribing...' : 'Transcribe'}
            </button>
          )}
          {transcription && (
            <div className="mt-2 p-2 rounded-lg bg-violet-500/5 border border-violet-500/20 text-xs text-violet-700 dark:text-violet-300">
              <span className="font-medium">Transcription:</span> {transcription}
            </div>
          )}
          {!msg.is_deleted && !loneImageUrl && content && hasUrl(content) && extractUrls(content).map((url, i) => <LinkPreview key={i} url={url} />)}
          {(msg as any).is_pinned && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-primary/70"><Pin className="w-3 h-3" /> Pinned</div>
          )}
          {msg.reactions.length>0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {Object.entries(msg.reactions.reduce((acc:any, r)=>{
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
            {isOwn && !msg.is_deleted && (
              <span className="ml-1">
                {msg.status==='read' ? <CheckCheck className="w-3.5 h-3.5 text-sky-300" style={{ filter: 'drop-shadow(0 0 3px rgba(125,211,252,0.8))' }}/> : msg.status==='delivered' ? <CheckCheck className="w-3.5 h-3.5 opacity-70"/> : <Check className="w-3.5 h-3.5 opacity-70"/>}
              </span>
            )}
          </div>
          <div className={`absolute ${isOwn?'left-0 -translate-x-full':'right-0 translate-x-full'} top-1/2 -translate-y-1/2 hidden sm:group-hover:flex items-center gap-1 p-1 rounded-full kryzen-msg-actions z-10`}>
            {REACTIONS.slice(0,3).map(e=> (
              <button key={e} onClick={()=>onReact(msg.id,e)} className="p-1.5 hover:bg-muted rounded-full text-xs">{e}</button>
            ))}
            <div className="w-px h-5 bg-border mx-1"/>
            <button onClick={()=>onReply(msg)} className="p-1.5 hover:bg-muted rounded-full" title="Reply"><Reply className="w-3.5 h-3.5"/></button>
            <button onClick={()=>setShowMenu(!showMenu)} className="p-1.5 hover:bg-muted rounded-full" title="More"><MoreHorizontal className="w-3.5 h-3.5"/></button>
            {isOwn && !msg.is_deleted && <>
              <button onClick={()=>onEdit(msg)} className="p-1.5 hover:bg-muted rounded-full" title="Edit"><Edit3 className="w-3.5 h-3.5"/></button>
              <button onClick={()=>onDelete(msg)} className="p-1.5 hover:bg-muted rounded-full text-destructive" title="Delete"><Trash2 className="w-3.5 h-3.5"/></button>
            </>}
          </div>
          {showMenu && (
            <div className={`absolute ${isOwn?'left-0' : 'right-0'} top-full mt-2 w-44 rounded-xl kryzen-dropdown-glass py-1 z-20 text-sm`}>
              <button onClick={()=>{ safeCopy((locked && dec.s === 'open' ? dec.text : content) || ''); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Copy className="w-3.5 h-3.5"/> Copy</button>
              <button onClick={()=>{ safeForward(msg); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Forward className="w-3.5 h-3.5"/> Forward</button>
              <button onClick={()=>{ safeSave(msg); setShowMenu(false)}} className={`w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 ${isSaved? 'text-primary' : ''}`}><Bookmark className="w-3.5 h-3.5"/> {isSaved? 'Unsave':'Save'}</button>
              {onPin && <button onClick={()=>{ onPin(msg); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Pin className="w-3.5 h-3.5"/> {(msg as any).is_pinned ? 'Unpin' : 'Pin'}</button>}
              <button onClick={()=>{ safeSelect(msg); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Flag className="w-3.5 h-3.5"/> Select</button>
              {onAIAction && content && !msg.is_deleted && (
                <>
                  <div className="border-t my-1"/>
                  <button onClick={()=>{ onAIAction(msg, 'summarize'); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-violet-600 dark:text-violet-400"><Sparkles className="w-3.5 h-3.5"/> Summarize</button>
                  <button onClick={()=>{ onTranslateAction?.(msg); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-violet-600 dark:text-violet-400"><Languages className="w-3.5 h-3.5"/> Translate</button>
                  <button onClick={()=>{ onAIAction(msg, 'explain'); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-violet-600 dark:text-violet-400"><FileText className="w-3.5 h-3.5"/> Explain</button>
                </>
              )}
              <div className="border-t my-1"/>
              <div className="px-3 py-1 flex gap-1">
                {REACTIONS.map(e=> <button key={e} onClick={()=>{onReact(msg.id,e); setShowMenu(false)}} className="flex-1 p-1 hover:bg-muted rounded text-xs">{e}</button>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
