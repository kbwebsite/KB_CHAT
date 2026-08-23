import { useState, useEffect } from 'react'
import { scheduledApi } from '../services/api'

interface ScheduledItem {
  id: number
  content: string
  scheduled_at: string
  sent: boolean
}

export default function ScheduleMessage({ convId }: { convId: number }) {
  const [items, setItems] = useState<ScheduledItem[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)

  const load = async () => {
    try {
      const res = await scheduledApi.list(convId)
      setItems(res.data || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [convId])

  const handleSend = async () => {
    if (!content.trim() || !scheduledAt) return
    try {
      if (editingId) {
        await scheduledApi.update(editingId, { content, scheduled_at: scheduledAt })
        setEditingId(null)
      } else {
        await scheduledApi.create(convId, { content, scheduled_at: scheduledAt })
      }
      setContent(''); setScheduledAt('')
      load()
    } catch {}
  }

  const handleCancel = async (id: number) => {
    try {
      await scheduledApi.cancel(id)
      load()
    } catch {}
  }

  const handleEdit = (item: ScheduledItem) => {
    setContent(item.content)
    setScheduledAt(item.scheduled_at)
    setEditingId(item.id)
  }

  if (loading) return <div className="p-4 text-sm text-gray-400">Loading...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-[var(--border)]">
        <h3 className="font-semibold text-sm">Scheduled Messages</h3>
      </div>
      <div className="p-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] space-y-2">
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Message content" className="input w-full text-sm resize-none h-16" />
        <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="input w-full text-sm" />
        <div className="flex gap-2">
          <button onClick={handleSend} className="text-xs px-3 py-1 rounded bg-[var(--primary)] text-white">
            {editingId ? 'Update' : 'Schedule'}
          </button>
          {editingId && <button onClick={() => { setEditingId(null); setContent(''); setScheduledAt('') }} className="text-xs px-3 py-1 rounded border border-[var(--border)]">Cancel Edit</button>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No scheduled messages</p>}
        {items.map(item => (
          <div key={item.id} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
            <p className="text-sm">{item.content}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-400">📅 {new Date(item.scheduled_at).toLocaleString()}</span>
              <div className="flex gap-1">
                {!item.sent && (
                  <>
                    <button onClick={() => handleEdit(item)} className="text-xs px-2 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--bg-tertiary)]">Edit</button>
                    <button onClick={() => handleCancel(item.id)} className="text-xs px-2 py-0.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10">Cancel</button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
