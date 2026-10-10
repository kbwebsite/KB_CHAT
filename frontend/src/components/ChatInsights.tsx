import { useState, useEffect } from 'react'
import { insightsApi } from '../services/api'

interface Insights {
  total_messages: number
  my_messages: number
  images: number
  videos: number
  files: number
  audio: number
  shared_days: number
  total_media_bytes: number
  top_chatters?: { user_id: number; display_name?: string | null; username?: string | null; count: number; is_me: boolean }[]
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function ChatInsights({ convId }: { convId: number }) {
  const [data, setData] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    insightsApi.chat(convId).then(r => { setData(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [convId])

  if (loading) return <div className="p-4 text-sm text-gray-400">Loading insights...</div>
  if (!data) return <div className="p-4 text-sm text-gray-400">No data</div>

  const stats = [
    { label: 'Messages', value: data.total_messages, icon: '💬' },
    { label: 'My Messages', value: data.my_messages, icon: '✍️' },
    { label: 'Images', value: data.images, icon: '🖼️' },
    { label: 'Videos', value: data.videos, icon: '🎬' },
    { label: 'Files', value: data.files, icon: '📄' },
    { label: 'Audio', value: data.audio, icon: '🎵' },
    { label: 'Shared Days', value: data.shared_days, icon: '📅' },
    { label: 'Total Media', value: formatBytes(data.total_media_bytes), icon: '💾' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-[var(--border)]">
        <h3 className="font-semibold text-sm">Chat Insights</h3>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        {stats.map(s => (
          <div key={s.label} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-center">
            <div className="text-lg">{s.icon}</div>
            <div className="font-bold text-lg">{s.value}</div>
            <div className="text-xs text-gray-400">{s.label}</div>
          </div>
        ))}
      </div>
      {(data.top_chatters || []).length > 0 && (
        <div className="px-3 pb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">🏆 Top chatters</p>
          <div className="space-y-1.5">
            {data.top_chatters!.map((t, i) => (
              <div key={t.user_id} className="flex items-center gap-2.5 p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
                <span className="text-base w-6 text-center">{['🥇', '🥈', '🥉'][i] || '🏅'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {t.is_me ? 'You' : t.display_name || t.username || 'Someone'}
                  </p>
                </div>
                <span className="text-xs text-gray-400 tabular-nums">{t.count} msgs</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
