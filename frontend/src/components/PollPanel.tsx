import { useState, useEffect } from 'react'
import { pollApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import { BarChart3, Plus, X, Check } from 'lucide-react'

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
  total_votes: number
  options: PollOption[]
  creator_name: string
}

export function PollPanel({ conversationId, onClose }: { conversationId: number, onClose: () => void }) {
  const { user } = useAuthStore()
  const [polls, setPolls] = useState<Poll[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [isMultiple, setIsMultiple] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadPolls() }, [conversationId])

  const loadPolls = async () => {
    const res = await pollApi.list(conversationId)
    if (res.success) setPolls(res.data)
  }

  const handleCreate = async () => {
    if (!question.trim() || options.filter(o => o.trim()).length < 2) return
    setLoading(true)
    try {
      const res = await pollApi.create(conversationId, { question: question.trim(), options: options.filter(o => o.trim()), is_multiple_choice: isMultiple })
      if (res.success) { setPolls([res.data, ...polls]); setQuestion(''); setOptions(['', '']); setShowCreate(false) }
    } finally { setLoading(false) }
  }

  const handleVote = async (pollId: number, optionIds: number[]) => {
    const res = await pollApi.vote(pollId, optionIds)
    if (res.success) setPolls(polls.map(p => p.id === pollId ? res.data : p))
  }

  const handleDelete = async (pollId: number) => {
    const res = await pollApi.delete(pollId)
    if (res.success) setPolls(polls.filter(p => p.id !== pollId))
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
            <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask a question..." className="w-full px-3 py-2 rounded-lg bg-muted text-sm outline-none focus:ring-1 focus:ring-primary" />
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input value={opt} onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n) }} placeholder={`Option ${i + 1}`} className="flex-1 px-3 py-2 rounded-lg bg-muted text-sm outline-none" />
                {options.length > 2 && <button onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>}
              </div>
            ))}
            {options.length < 10 && <button onClick={() => setOptions([...options, ''])} className="text-xs text-primary hover:underline">+ Add option</button>}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={isMultiple} onChange={e => setIsMultiple(e.target.checked)} className="rounded" />
                Allow multiple choices
              </label>
            </div>
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
          <PollCard key={poll.id} poll={poll} userId={user?.id} onVote={handleVote} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  )
}

function PollCard({ poll, userId, onVote, onDelete }: { poll: Poll, userId?: number, onVote: (id: number, opts: number[]) => void, onDelete: (id: number) => void }) {
  const myVotes = poll.options.filter(o => o.voter_ids.includes(userId!)).map(o => o.id)
  const [selected, setSelected] = useState<number[]>(myVotes)
  const hasVoted = myVotes.length > 0
  const isClosed = poll.closes_at && new Date(poll.closes_at) < new Date()

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
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium">{poll.question}</p>
        {userId && poll.options.some(o => o.voter_ids.includes(userId)) && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Voted</span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''}{poll.is_multiple_choice ? ' • Multiple choice' : ''}</p>
      <div className="space-y-1.5">
        {poll.options.map(opt => {
          const pct = poll.total_votes > 0 ? Math.round((opt.vote_count / poll.total_votes) * 100) : 0
          const isSelected = selected.includes(opt.id)
          const isMyVote = myVotes.includes(opt.id)
          return (
            <button key={opt.id} onClick={() => toggleOption(opt.id)} className={`w-full relative rounded-lg p-2.5 text-left text-sm border transition ${isSelected && !hasVoted ? 'border-primary bg-primary/5' : isMyVote ? 'border-primary bg-primary/10' : 'border-muted hover:border-primary/50'}`}>
              {(hasVoted || isClosed) && (
                <div className="absolute inset-0 rounded-lg overflow-hidden">
                  <div className={`h-full ${isMyVote ? 'bg-primary/15' : 'bg-muted/50'}`} style={{ width: `${pct}%` }} />
                </div>
              )}
              <span className="relative flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {(hasVoted || isClosed) && isMyVote && <Check className="w-3 h-3 text-primary" />}
                  {opt.text}
                </span>
                {(hasVoted || isClosed) && <span className="text-xs text-muted-foreground">{opt.vote_count} ({pct}%)</span>}
              </span>
            </button>
          )
        })}
      </div>
      {!hasVoted && !isClosed && selected.length > 0 && (
        <button onClick={submitVote} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium">Submit Vote</button>
      )}
      {userId && poll.options.some(o => o.voter_ids.includes(userId)) && (
        <div className="text-[11px] text-muted-foreground">Your votes: {poll.options.filter(o => o.voter_ids.includes(userId!)).map(o => o.text).join(', ')}</div>
      )}
    </div>
  )
}
