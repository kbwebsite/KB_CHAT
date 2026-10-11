import { useState, useEffect, useRef } from 'react'
import { pollApi, aiApi, uploadApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import { BarChart3, Plus, X, Check, Sparkles, Dices, Image as ImageIcon, Loader2 } from 'lucide-react'
import { randomDilemma, dilemmaToPoll } from '../utils/wouldYouRather'

interface PollOption {
  id: number
  text: string
  position: number
  vote_count: number
  voter_ids: number[]
}

interface Poll {
  id: number
  question: string
  is_multiple_choice: boolean
  closes_at: string | null
  correct_option_id: number | null
  total_votes: number
  options: PollOption[]
  creator_id: number | null
  creator_name: string
}

const IMAGE_URL_RE = /(https?:\/\/[^\s)]+)/gi
const IMAGE_EXT_RE = /\.(jpg|jpeg|png|gif|webp|bmp|avif)(\?|#|$)/i

/** Split an option into an optional photo URL + caption text.
 * Photo polls are frontend-only: the backend stores plain option text, and
 * any image URL inside it renders as a photo (same convention as channel
 * posts). No schema change needed. */
export function splitOptionMedia(text: unknown): { img: string | null; text: string } {
  if (typeof text !== 'string' || !text) return { img: null, text: '' }
  const m = text.match(IMAGE_URL_RE) || []
  const img = m.find((u) => /\/image\/upload\//i.test(u) || IMAGE_EXT_RE.test(u)) || null
  const rest = img ? text.split(img).join(' ').replace(/\s+/g, ' ').trim() : text.trim()
  return { img, text: rest }
}

/** True when this vote hit the quiz answer (no quiz = always celebrate). */
export function quizHit(pollData: any, optionIds: number[]): boolean {
  const correct = pollData?.correct_option_id
  if (correct == null) return true
  return optionIds.includes(correct)
}

export interface PollSuggestion {
  question?: string
  options: string[]
}

/**
 * Parse an AI poll suggestion: the model is asked for raw JSON, but free
 * text may surround it — extract the first {...} block and validate strictly.
 * Returns null when unusable (caller shows an honest error, never fake data).
 */
export function parsePollSuggestion(text: unknown): PollSuggestion | null {
  if (typeof text !== 'string') return null
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let obj: any
  try {
    obj = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const options = Array.isArray(obj.options)
    ? obj.options.filter((o: any) => typeof o === 'string' && o.trim()).slice(0, 10)
    : []
  if (options.length < 2) return null
  const out: PollSuggestion = { options }
  if (typeof obj.question === 'string' && obj.question.trim()) {
    out.question = obj.question.trim().slice(0, 200)
  }
  return out
}

export function PollPanel({ conversationId, onClose }: { conversationId: number, onClose: () => void }) {
  const { user } = useAuthStore()
  const [polls, setPolls] = useState<Poll[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [isMultiple, setIsMultiple] = useState(false)
  const [isQuiz, setIsQuiz] = useState(false)
  const [correctPos, setCorrectPos] = useState(0)
  const [loading, setLoading] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  // Ref guard: two taps in one render batch must not double-fire.
  const suggestingRef = useRef(false)
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement | null>(null)
  const photoTarget = useRef(0)

  useEffect(() => { loadPolls() }, [conversationId])

  const loadPolls = async () => {
    const res = await pollApi.list(conversationId)
    if (res.success) setPolls(res.data)
  }

  const handleCreate = async () => {
    const clean = options.filter(o => o.trim())
    if (!question.trim() || clean.length < 2) return
    setLoading(true)
    try {
      const safePos = Math.min(correctPos, clean.length - 1)
      const res = await pollApi.create(conversationId, {
        question: question.trim(),
        options: clean,
        is_multiple_choice: isMultiple,
        ...(isQuiz ? { correct_position: safePos } : {}),
      })
      if (res.success) {
        setPolls([res.data, ...polls])
        setQuestion('')
        setOptions(['', ''])
        setIsQuiz(false)
        setCorrectPos(0)
        setShowCreate(false)
      }
    } finally { setLoading(false) }
  }

  const handleSuggest = async () => {
    const topic = question.trim()
    if (!topic || suggestingRef.current) return
    suggestingRef.current = true
    setSuggesting(true)
    setSuggestError(null)
    try {
      const r: any = await aiApi.chat(
        `Suggest a group poll about: "${topic}". Reply with ONLY raw JSON, no other text: {"question": "a short poll question", "options": ["3 to 5 short distinct options"]}`,
      )
      const reply = String(r?.data?.reply ?? r?.reply ?? '')
      const parsed = parsePollSuggestion(reply)
      if (!parsed) {
        setSuggestError('AI could not suggest options — try rephrasing the topic.')
        return
      }
      if (parsed.question) setQuestion(parsed.question)
      setOptions(parsed.options)
      setCorrectPos(0)
    } catch {
      setSuggestError('Suggestion failed — check connection and retry.')
    } finally {
      suggestingRef.current = false
      setSuggesting(false)
    }
  }

  const handleSurprise = () => {
    const draft = dilemmaToPoll(randomDilemma())
    setQuestion(draft.question)
    setOptions(draft.options)
    setCorrectPos(0)
    setSuggestError(null)
  }

  const pickPhoto = (i: number) => {
    photoTarget.current = i
    photoRef.current?.click()
  }

  const handlePhoto = async (f: File | undefined) => {
    if (!f || uploadingIdx != null) return
    const i = photoTarget.current
    if (!f.type.startsWith('image/')) {
      setPhotoError('Only image files work as option photos.')
      return
    }
    setUploadingIdx(i)
    setPhotoError(null)
    try {
      const r: any = await uploadApi.upload(f)
      let url = r?.data?.cloudinary_url || r?.data?.url || r?.cloudinary_url || r?.url
      if (url && url.startsWith('/')) url = `${window.location.origin}${url}`
      if (!url) throw new Error('no url')
      setOptions((prev) => {
        const n = [...prev]
        n[i] = `${(n[i] || '').trim()} ${url}`.trim().slice(0, 500)
        return n
      })
    } catch {
      setPhotoError('Photo upload failed — try again.')
    } finally {
      setUploadingIdx(null)
      if (photoRef.current) photoRef.current.value = ''
    }
  }

  const handleVote = async (pollId: number, optionIds: number[]) => {
    const res = await pollApi.vote(pollId, optionIds)
    if (res.success) {
      setPolls(polls.map(p => p.id === pollId ? res.data : p))
    }
  }

  const handleDelete = async (pollId: number) => {
    const res = await pollApi.delete(pollId)
    if (res.success) setPolls(polls.filter(p => p.id !== pollId))
  }

  const handleClose = async (pollId: number) => {
    if (!confirm('Close this poll? No more votes will be accepted.')) return
    try {
      const res = await pollApi.close(pollId)
      if (res.success) setPolls(polls.map(p => p.id === pollId ? res.data : p))
    } catch {}
  }

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Polls</h3>
        <div className="flex gap-1">
          <button onClick={() => setShowCreate(!showCreate)} className="p-1.5 rounded-lg hover:bg-muted"><Plus className="w-4 h-4" /></button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {showCreate && (
          <div className="p-3 rounded-xl border bg-background space-y-3">
            <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask a question... or a topic for AI ideas" className="w-full px-3 py-2 rounded-lg bg-muted text-sm outline-none focus:ring-1 focus:ring-primary" />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSuggest}
                disabled={!question.trim() || suggesting}
                aria-label="Suggest poll options with AI"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition disabled:opacity-40 min-h-[44px]"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                {suggesting ? 'Thinking…' : 'Suggest with AI'}
              </button>
              {suggestError && <p className="text-xs text-destructive flex-1" role="alert">{suggestError}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSurprise}
                aria-label="Surprise me with a Would You Rather poll"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-xs font-semibold hover:bg-accent transition min-h-[44px]"
              >
                <Dices className="w-3.5 h-3.5" aria-hidden="true" />
                Surprise me
              </button>
              <p className="text-[11px] text-muted-foreground flex-1">Random dilemma — edit anything, then Create.</p>
            </div>
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input value={opt} onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n) }} placeholder={`Option ${i + 1}`} className="flex-1 px-3 py-2 rounded-lg bg-muted text-sm outline-none min-w-0" />
                <button
                  onClick={() => pickPhoto(i)}
                  disabled={uploadingIdx != null}
                  aria-label={`Add photo to option ${i + 1}`}
                  title="Add a photo to this option"
                  className="px-2.5 rounded-lg bg-muted text-muted-foreground hover:text-primary hover:bg-accent transition disabled:opacity-40 shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  {uploadingIdx === i ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                </button>
                {options.length > 2 && <button onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`} className="text-muted-foreground hover:text-destructive px-1 min-h-[44px]"><X className="w-4 h-4" /></button>}
              </div>
            ))}
            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e.target.files?.[0])} />
            {photoError && <p className="text-xs text-destructive" role="alert">{photoError}</p>}
            {options.length < 10 && <button onClick={() => setOptions([...options, ''])} className="text-xs text-primary hover:underline">+ Add option</button>}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={isMultiple} onChange={e => setIsMultiple(e.target.checked)} className="rounded" />
                Allow multiple choices
              </label>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={isQuiz} onChange={e => setIsQuiz(e.target.checked)} className="rounded" />
                Quiz mode (one correct answer)
              </label>
            </div>
            {isQuiz && (
              <label className="block text-xs">
                <span className="text-muted-foreground">Correct answer</span>
                <select
                  value={Math.min(correctPos, Math.max(options.length - 1, 0))}
                  onChange={e => setCorrectPos(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-muted text-sm outline-none"
                >
                  {options.map((t, i) => {
                    const m = splitOptionMedia(t)
                    return <option key={i} value={i}>{(m.text || (m.img ? `Photo ${i + 1}` : `Option ${i + 1}`))}</option>
                  })}
                </select>
              </label>
            )}
            <button onClick={handleCreate} disabled={!question.trim() || loading} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Create Poll</button>
          </div>
        )}
        {polls.length === 0 && !showCreate && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No polls yet. Create one to get started.
          </div>
        )}
        {polls.map(poll => (
          <PollCard key={poll.id} poll={poll} userId={user?.id} onVote={handleVote} onDelete={handleDelete} onClosePoll={handleClose} />
        ))}
      </div>
    </div>
  )
}

export function PollCard({ poll, userId, onVote, onDelete, onClosePoll }: { poll: Poll, userId?: number, onVote: (id: number, opts: number[]) => void, onDelete: (id: number) => void, onClosePoll?: (id: number) => void }) {
  const pollOptions = Array.isArray(poll.options) ? poll.options : []
  const myVotes = pollOptions.filter(o => (o.voter_ids || []).includes(userId!)).map(o => o.id)
  const [selected, setSelected] = useState<number[]>(myVotes)
  const hasVoted = myVotes.length > 0
  const isClosed = poll.closes_at && new Date(poll.closes_at) < new Date()
  const isQuiz = poll.correct_option_id != null
  const revealed = (hasVoted || !!isClosed) && isQuiz
  const iWasRight = revealed && myVotes.includes(poll.correct_option_id!)

  const toggleOption = (optId: number) => {
    if (hasVoted || isClosed) return
    if (poll.is_multiple_choice) {
      setSelected(s => s.includes(optId) ? s.filter(x => x !== optId) : [...s, optId])
    } else {
      setSelected([optId])
    }
  }

  const submitVote = () => { if (selected.length > 0) onVote(poll.id, selected) }

  return (
    <div className="p-3 rounded-xl border bg-background space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{poll.question}</p>
        <span className="flex items-center gap-1.5 shrink-0">
          {userId && pollOptions.some(o => (o.voter_ids || []).includes(userId)) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Voted</span>
          )}
          {!isClosed && userId != null && poll.creator_id === userId && onClosePoll && (
            <button onClick={() => onClosePoll(poll.id)} className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground transition" title="Close poll">
              Close
            </button>
          )}
          {isClosed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Closed</span>
          )}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">{poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''}{poll.is_multiple_choice ? ' • Multiple choice' : ''}</p>
      <div className="space-y-1.5">
        {pollOptions.map(opt => {
          const pct = poll.total_votes > 0 ? Math.round((opt.vote_count / poll.total_votes) * 100) : 0
          const isSelected = selected.includes(opt.id)
          const isMyVote = myVotes.includes(opt.id)
          const media = splitOptionMedia(opt.text)
          const label = media.text || 'Photo'
          return (
            <button key={opt.id} onClick={() => toggleOption(opt.id)} className={`w-full relative rounded-lg p-2.5 text-left text-sm border transition ${isSelected && !hasVoted ? 'border-primary bg-primary/5' : isMyVote ? 'border-primary bg-primary/10' : 'border-muted hover:border-primary/50'}`}>
              {(hasVoted || isClosed) && (
                <div className="absolute inset-0 rounded-lg overflow-hidden">
                  <div className={`h-full transition-[width] duration-700 ease-out ${isMyVote ? 'bg-primary/15' : 'bg-muted/50'}`} style={{ width: `${pct}%` }} />
                </div>
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  {(hasVoted || isClosed) && isMyVote && <Check className="w-3 h-3 text-primary shrink-0" />}
                  {media.img && (
                    <img src={media.img} alt="" loading="lazy" className="w-12 h-12 rounded-lg object-cover shrink-0 border border-border/60" />
                  )}
                  <span className="truncate">{label}</span>
                  {revealed && poll.correct_option_id === opt.id && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 font-semibold shrink-0">✓ Correct</span>
                  )}
                </span>
                {(hasVoted || isClosed) && <span className="text-xs text-muted-foreground shrink-0">{opt.vote_count} ({pct}%)</span>}
              </span>
            </button>
          )
        })}
      </div>
      {!hasVoted && !isClosed && selected.length > 0 && (
        <button onClick={submitVote} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium">Submit Vote</button>
      )}
      {revealed && (
        <p className={`text-xs font-medium ${iWasRight ? 'text-emerald-500' : 'text-muted-foreground'}`}>
          {iWasRight ? 'Correct!' : 'Not quite — answer revealed above'}
        </p>
      )}
      {userId && pollOptions.some(o => (o.voter_ids || []).includes(userId)) && (
        <div className="text-[11px] text-muted-foreground">Your votes: {pollOptions.filter(o => (o.voter_ids || []).includes(userId!)).map(o => { const m = splitOptionMedia(o.text); return m.text || 'Photo' }).join(', ')}</div>
      )}
    </div>
  )
}
