import { useState, useEffect } from 'react'
import { eventApi } from '../services/api'

interface Event {
  id: number
  title: string
  description?: string
  event_date?: string
  location?: string
  creator_name: string
  going_count: number
  maybe_count: number
  cant_go_count: number
  going: number[]
  maybe: number[]
  cant_go: number[]
}

export default function EventPanel({ convId, userId }: { convId: number; userId: number }) {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location, setLocation] = useState('')

  const load = async () => {
    try {
      const res = await eventApi.list(convId)
      setEvents(res.data || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [convId])

  const handleCreate = async () => {
    if (!title.trim()) return
    try {
      await eventApi.create(convId, { title, description, event_date: eventDate || undefined, location: location || undefined })
      setTitle(''); setDescription(''); setEventDate(''); setLocation('')
      setShowCreate(false)
      load()
    } catch {}
  }

  const handleRespond = async (eid: number, response: string) => {
    try {
      await eventApi.respond(eid, response)
      load()
    } catch {}
  }

  if (loading) return <div className="p-4 text-sm text-gray-400">Loading events...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
        <h3 className="font-semibold text-sm">Events</h3>
        <button onClick={() => setShowCreate(!showCreate)} className="text-xs px-2 py-1 rounded bg-[var(--primary)] text-white">+ New</button>
      </div>
      {showCreate && (
        <div className="p-3 border-b border-[var(--border)] space-y-2 bg-[var(--bg-secondary)]">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" className="input w-full text-sm" />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" className="input w-full text-sm resize-none h-16" />
          <div className="grid grid-cols-2 gap-2">
            <input type="datetime-local" value={eventDate} onChange={e => setEventDate(e.target.value)} className="input text-sm" />
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Location" className="input text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="text-xs px-3 py-1 rounded bg-[var(--primary)] text-white">Create</button>
            <button onClick={() => setShowCreate(false)} className="text-xs px-3 py-1 rounded border border-[var(--border)]">Cancel</button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {events.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No events yet</p>}
        {events.map(ev => (
          <div key={ev.id} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
            <div className="font-medium text-sm">{ev.title}</div>
            {ev.description && <div className="text-xs text-gray-400 mt-1">{ev.description}</div>}
            <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-400">
              {ev.event_date && <span>📅 {new Date(ev.event_date).toLocaleString()}</span>}
              {ev.location && <span>📍 {ev.location}</span>}
            </div>
            <div className="text-xs text-gray-400 mt-1">Created by {ev.creator_name}</div>
            <div className="flex gap-1 mt-2">
              {(['going', 'maybe', 'cant_go'] as const).map(r => {
                const labels = { going: '✅ Going', maybe: '🤔 Maybe', cant_go: '❌ Can\'t' }
                const count = r === 'going' ? ev.going_count : r === 'maybe' ? ev.maybe_count : ev.cant_go_count
                const selected = r === 'going' ? ev.going : r === 'maybe' ? ev.maybe : ev.cant_go
                const isMe = selected.includes(userId)
                return (
                  <button key={r} onClick={() => handleRespond(ev.id, r)}
                    className={`text-xs px-2 py-1 rounded-full border transition-colors ${isMe ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-[var(--border)] hover:border-[var(--primary)]'}`}>
                    {labels[r]} {count > 0 && `(${count})`}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
