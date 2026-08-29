import { useState, useRef } from 'react'
import { Send, Smile, Paperclip, X, Mic, Image } from 'lucide-react'
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
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const typingTimeout = useRef<any>(null)
  const lastTyping = useRef(false)
  const enterToSend = useSettingsStore(s => s.enter_to_send)

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
    onSend(text.trim(), undefined, 'text')
    setText('')
    onCancelReply()
    lastTyping.current = false
    onTyping(false)
    wsService.sendTyping(conversationId, false)
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
    } catch (err: any) {
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
    <div className="px-3 pb-3 pt-1 shrink-0">
      <div className="composer">
        {replyTo && (
          <div className="absolute bottom-full left-0 right-0 mb-2">
            <div className="flex items-center justify-between rounded-xl px-3 py-2 text-xs glass-subtle border border-border">
              <div className="min-w-0">
                <p className="font-semibold gradient-text">Replying to {replyTo.sender}</p>
                <p className="truncate text-muted-foreground">{replyTo.content}</p>
              </div>
              <button onClick={onCancelReply} className="icon-btn w-7 h-7"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}
        {uploading && (
          <div className="absolute bottom-full left-0 right-0 mb-2">
            <div className="rounded-xl glass-subtle p-2 border border-border">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full gradient-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                <span>Uploading {progress}%</span>
                <button onClick={() => abortRef.current?.abort()} className="text-destructive hover:underline">Cancel</button>
              </div>
            </div>
          </div>
        )}
        {uploadError && (
          <div className="absolute bottom-full left-0 right-0 mb-2">
            <div className="p-2 rounded-xl bg-destructive/10 text-destructive text-xs flex justify-between border border-destructive/20">
              <span>{uploadError}</span>
              <button onClick={() => setUploadError(null)} className="ml-2 underline">Dismiss</button>
            </div>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="composer-btn text-muted-foreground hover:text-foreground disabled:opacity-50 shrink-0" title="Attach file">
            <Paperclip className="w-5 h-5" />
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={handleFile} accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.mp4,.mp3,.webm" multiple />
          <div className="flex-1 relative min-w-0">
            <textarea
              value={text}
              onChange={e => handleChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="composer-input w-full max-h-32 min-h-[44px] py-3 px-0 bg-transparent border-none outline-none resize-none text-sm leading-5 placeholder:text-muted-foreground"
              disabled={disabled || uploading}
            />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setShowEmoji(!showEmoji)} className="composer-btn text-muted-foreground hover:text-foreground" title="Emoji">
              <Smile className="w-5 h-5" />
            </button>
            <button onClick={() => { setShowStickers(!showStickers); setShowEmoji(false) }} className="composer-btn text-muted-foreground hover:text-foreground" title="Stickers">
              <Image className="w-5 h-5" />
            </button>
            <div className="hidden sm:block">
              <VoiceRecorder onSend={handleVoiceSend} />
            </div>
            <div className="sm:hidden flex items-center">
              <VoiceRecorder onSend={handleVoiceSend} />
            </div>
            <button
              onClick={handleSend}
              disabled={!text.trim() || uploading}
              className="composer-btn composer-btn-send disabled:opacity-40"
              title="Send"
            >
              <Send className="w-5 h-5 ml-0.5" />
            </button>
          </div>
        </div>
        {showEmoji && (
          <div className="mt-3">
            <EmojiPicker onEmojiClick={handleEmoji} height={320} />
          </div>
        )}
        {showStickers && (
          <div className="mt-3 flex justify-center">
            <StickerPicker onSelect={handleSticker} />
          </div>
        )}
      </div>
    </div>
  )
}
