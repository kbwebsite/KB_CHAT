import { useEffect, useMemo, useState } from 'react'
import { X, Trophy, Plus, Check } from 'lucide-react'
import { predictionsApi } from '../services/api'
import { useChatStore } from '../store/chat'

type Pred = {
  id: number
  conversation_id: number
  question: string
  options: string[]
  vote_counts: number[]
  total_votes: number
  my_vote: number | null
  creator_name?: string | null
  is_mine: boolean
  status: string
  result_index: number | null
  closes_at?: string | null
}

/** Friendly wagers: predict outcomes, vote, resolve, standings. */
export function PredictionsPanel({ onClose }: { onClose: () => void }) {
  const conversations = useChatStore((s: any) => s.conversations)
  const convs = useMemo(
    () =>
      [...(conversations || [])].sort((a: any, b: any) =>
        b.is_group === a.is_group ? 0 : b.is_group ? 1 : -1,
      ),
    [conversations],
  )
  const [convId, setConvId] = useState<number | null>(null)
  const [tab, setTab] = useState<'active' | 'standings' | 'create'>('active')
  const [items, setItems] = useState<Pred[]>([])
  const [loading, setLoading] = useState(false)
  const [standings, setStandings] = useState<any>(null)
  const [msg, setMsg] = useState<string | null>(null)
  // create form
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState<string[]>(['', ''])
  const [closes, setCloses] = useState('')
  const [creating, setCreating] = useState(false)
  const [resolving, setResolving] = useState<number | null>(null)

  useEffect(() => {
    if (convId == null && convs.length > 0) setConvId(convs[0].id)
  }, [convs, convId])

  const load = async (cid: number) => {
    setLoading(true)
    try {
      const r = await predictionsApi.list(cid)
      if (r?.success) setItems(r.data || [])
      const s = await predictionsApi.standings(cid).catch(() => null)
      if (s?.success) setStandings(s.data)
    } catch {}
    finally { setLoading(false) }
  }
  useEffect(() => {
    if (convId != null) void load(convId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId])

  const create = async () => {
    if (convId == null || creating) return
    const question = q.trim()
    const options = opts.map((o) => o.trim()).filter(Boolean)
    if (!question || options.length < 2) {
      setMsg('Question + at least 2 options needed')
      return
    }
    setCreating(true)
    try {
      const r = await predictionsApi.create({
        conversation_id: convId,
        question,
        options,
        closes_at: closes ? new Date(closes).toISOString() : null,
      })
      if (r?.success) {
        setItems((l) => [r.data, ...l])
        setQ('')
        setOpts(['', ''])
        setCloses('')
        setTab('active')
        setMsg('Prediction live 🔮')
      } else setMsg(r?.message || 'Failed')
    } catch (e: any) {
      setMsg(e.response?.data?.detail || 'Failed')
    } finally {
      setCreating(false)
    }
  }

  const vote = async (p: Pred, idx: number) => {
    try {
      const r = await predictionsApi.vote(p.id, idx)
      if (r?.success) setItems((l) => l.map((x) => (x.id === p.id ? r.data : x)))
      else setMsg(r?.message || 'Vote failed')
    } catch (e: any) {
      setMsg(e.response?.data?.detail || 'Vote failed')
    }
  }

  const resolve = async (p: Pred, idx: number) => {
    if (!confirm(`Lock in "${p.options[idx]}" as the answer?`)) return
    setResolving(p.id)
    try {
      const r = await predictionsApi.resolve(p.id, idx)
      if (r?.success) {
        setItems((l) => l.map((x) => (x.id === p.id ? r.data : x)))
        if (convId != null) {
          const s = await predictionsApi.standings(convId).catch(() => null)
          if (s?.success) setStandings(s.data)
        }
      } else setMsg(r?.message || 'Failed')
    } catch (e: any) {
      setMsg(e.response?.data?.detail || 'Failed')
    } finally {
      setResolving(null)
    }
  }

  const open = items.filter((p) => p.status === 'open')
  const done = items.filter((p) => p.status !== 'open')

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold flex items-center gap-2">
          <Trophy className="w-4 h-4" /> Predictions
        </h2>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-muted" aria-label="Close predictions">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-4 pt-3 space-y-3 shrink-0">
        <select
          value={convId ?? ''}
          onChange={(e) => setConvId(Number(e.target.value))}
          className="w-full px-3 py-2 rounded-xl bg-muted outline-none text-sm"
          aria-label="Choose chat"
        >
          {convs.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.is_group ? '👥 ' : ''}{c.title || 'Chat'}
            </option>
          ))}
        </select>
        <div className="flex rounded-full bg-muted p-1">
          {(['active', 'standings', 'create'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${tab === t ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground'}`}
            >
              {t}
            </button>
          ))}
        </div>
        {msg && <p className="text-xs text-center bg-muted py-1.5 rounded-lg">{msg}</p>}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
        ) : tab === 'create' ? (
          <div className="space-y-2.5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Who wins Sunday?"
              maxLength={200}
              className="w-full px-3 py-2 rounded-xl bg-muted outline-none text-sm"
            />
            {opts.map((o, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={o}
                  onChange={(e) => setOpts((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`Option ${i + 1}`}
                  maxLength={60}
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-muted outline-none text-sm"
                />
                {opts.length > 2 && (
                  <button onClick={() => setOpts((l) => l.filter((_, j) => j !== i))} className="px-2.5 rounded-xl bg-muted text-destructive text-sm" aria-label="Remove option">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {opts.length < 4 && (
              <button onClick={() => setOpts((l) => [...l, ''])} className="w-full py-2 rounded-xl bg-muted text-xs font-medium flex items-center justify-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add option
              </button>
            )}
            <input
              type="datetime-local"
              value={closes}
              onChange={(e) => setCloses(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-muted outline-none text-sm"
              aria-label="Closes at (optional)"
            />
            <button onClick={create} disabled={creating} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              {creating ? 'Posting…' : 'Post prediction 🔮'}
            </button>
          </div>
        ) : tab === 'standings' ? (
          standings && standings.standings?.length > 0 ? (
            <div className="space-y-1.5">
              {standings.standings.map((s: any, i: number) => (
                <div key={s.user_id} className="flex items-center gap-2.5 p-2.5 rounded-xl border">
                  <span className="text-base w-6 text-center">{['🥇', '🥈', '🥉'][i] || '🏅'}</span>
                  <p className="text-sm font-medium truncate flex-1">{s.is_me ? 'You' : s.display_name || 'Someone'}</p>
                  <span className="text-xs text-muted-foreground tabular-nums">{s.correct}/{s.total} right</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">No resolved predictions yet — resolve one to start the board.</p>
          )
        ) : open.length === 0 && done.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">No predictions here yet — create the first one.</p>
        ) : (
          <>
            {open.map((p) => (
              <PredictionCard key={p.id} p={p} onVote={vote} onResolve={resolve} resolving={resolving === p.id} />
            ))}
            {done.length > 0 && <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pt-1">Resolved</p>}
            {done.map((p) => (
              <PredictionCard key={p.id} p={p} onVote={vote} onResolve={resolve} resolving={resolving === p.id} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function PredictionCard({ p, onVote, onResolve, resolving }: {
  p: {
    id: number; question: string; options: string[]; vote_counts: number[];
    total_votes: number; my_vote: number | null; creator_name?: string | null;
    is_mine: boolean; status: string; result_index: number | null;
  }
  onVote: (p: any, idx: number) => void
  onResolve: (p: any, idx: number) => void
  resolving: boolean
}) {
  const closed = p.status !== 'open'
  return (
    <div className="rounded-2xl border p-3.5 space-y-2">
      <p className="text-sm font-semibold">🔮 {p.question}</p>
      <div className="space-y-1.5">
        {p.options.map((o, i) => {
          const pct = p.total_votes > 0 ? Math.round(((p.vote_counts[i] || 0) / p.total_votes) * 100) : 0
          const mine = p.my_vote === i
          const won = closed && p.result_index === i
          return (
            <button
              key={i}
              onClick={() => !closed && onVote(p, i)}
              disabled={closed}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all disabled:cursor-default ${won ? 'bg-emerald-500/15 border border-emerald-500/40' : mine ? 'bg-primary/10 border border-primary/30' : 'bg-muted hover:bg-accent'}`}
            >
              <span className="flex items-center gap-1.5">
                {won && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                <span className="flex-1 truncate">{o}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{pct}% · {p.vote_counts[i] || 0}</span>
              </span>
              <span className="block h-1 mt-1.5 rounded-full bg-black/20 overflow-hidden">
                <span className={`block h-full rounded-full ${won ? 'bg-emerald-500' : 'bg-primary/60'}`} style={{ width: `${pct}%` }} />
              </span>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {p.total_votes} votes{p.creator_name ? ` • by ${p.creator_name}` : ''}
        {closed && p.result_index != null ? ` • Answer: ${p.options[p.result_index]}` : ''}
      </p>
      {p.is_mine && !closed && (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Resolve:</span>
          {p.options.map((o, i) => (
            <button
              key={i}
              onClick={() => onResolve(p, i)}
              disabled={resolving}
              className="px-2 py-1 rounded-full bg-muted hover:bg-accent text-[11px] font-medium disabled:opacity-50"
            >
              {o.length > 12 ? `${o.slice(0, 12)}…` : o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
