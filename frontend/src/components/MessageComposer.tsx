import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Smile, Paperclip, X, Image } from 'lucide-react'
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react'
import wsService from '../services/websocket'
import { VoiceRecorder } from './VoiceRecorder'
import { uploadApi } from '../services/api'
import { useSettingsStore } from '../store/settings'
import StickerPicker from './StickerPicker'

export function MessageComposer({ onSend, onTyping, conversationId, replyTo, onCancelReply, disabled }: {
  onSend: (content: string, attachmentIds?: number[], type?: string) => void,
  onTyping: (isTyping: boolean) => void,
  conversationId: number,
  replyTo?: { id: number; content: string; sender: string } | null,
  onCancelReply: () => void,
  disabled?: boolean
}) {
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const typingTimeout = useRef<any>(null)
  const lastTyping = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const enterToSend = useSettingsStore(s => s.enter_to_send)

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxH = 120
    el.style.height = Math.min(el.scrollHeight, maxH) + 'px'
  }, [])

  useEffect(() => { autoResize() }, [text, autoResize])

  const handleChange = (v: string) => {
    setText(v)
    const isTyping = v.length > 0
    if (isTyping !== lastTyping.current) {
      lastTyping.current = isTyping
      onTyping(isTyping)
      wsService.sendTyping(conversationId, isTyping)
    }
    if (typingTimeout.current) clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => {
      if (lastTyping.current) {
        lastTyping.current = false
        onTyping(false)
        wsService.sendTyping(conversationId, false)
      }
    }, 2000)
  }

  const handleSend = () => {
    if (!text.trim()) return
    setSending(true)
    setText('')
    onCancelReply()
    lastTyping.current = false
    onTyping(false)
    wsService.sendTyping(conversationId, false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    // Call onSend and reset sending state after a delay (onSend is void, not async)
    onSend(text.trim(), undefined, 'text')
    setTimeout(() => setSending(false), 1500)
  }

  const handleEmoji = (e: EmojiClickData) => {
    setText(prev => prev + e.emoji)
  }

  const handleSticker = (url: string) => {
    onSend(url, undefined, 'text')
    setShowStickers(false)
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
          const fallback = isImage ? (text || 'Image') : isVoice ? `Voice ${Math.round(att.file_size / 1024)}KB` : `File: ${att.original_filename}`
          onSend(fallback, [att.id], type as any)
          setText('')
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

  const handleVoiceSend = async (blob: Blob, duration: number) => {
    const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' })
    setUploading(true)
    setProgress(0)
    try {
      const res = await uploadApi.upload(file, (p) => setProgress(p))
      if (res.success) {
        const att = res.data
        onSend(`Voice ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`, [att.id], 'voice' as any)
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
    if (e.key === 'Escape') { onCancelReply(); setShowEmoji(false); setShowStickers(false) }
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
        <input ref={fileRef} type="file" className="hidden" onChange={handleFile} accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.mp4,.mp3,.webm" multiple />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="composer-textarea"
          style={{ background: 'rgba(20,20,42,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, color: '#f0f0ff', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 2px 8px rgba(0,0,0,0.2)' }}
          disabled={disabled || uploading}
        />

        {/* Right side buttons */}
        <button onClick={() => { setShowEmoji(!showEmoji); setShowStickers(false) }} className="composer-action-btn" aria-label="Emoji">
          <Smile className="w-5 h-5" />
        </button>
        <button onClick={() => { setShowStickers(!showStickers); setShowEmoji(false) }} className="composer-action-btn" aria-label="Stickers">
          <Image className="w-5 h-5" />
        </button>

        {/* Voice recorder - shown when empty, send when has text */}
        {text.trim() ? (
          <button
            onClick={handleSend}
            disabled={uploading || sending}
            className="composer-send-btn"
            style={{ background: 'linear-gradient(135deg, #7c5cfc, #a855f7)', boxShadow: '0 4px 20px rgba(124,92,252,0.5), 0 0 0 1px rgba(124,92,252,0.2)' }}
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
          <EmojiPicker onEmojiClick={handleEmoji} height={280} width="100%" />
        </div>
      )}

      {/* Sticker picker */}
      {showStickers && (
        <div className="composer-picker">
          <StickerPicker onSelect={handleSticker} />
        </div>
      )}
    </div>
  )
}
