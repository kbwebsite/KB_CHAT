import { useState, useEffect } from 'react'
import { storageApi } from '../services/api'

interface StorageData {
  images: number
  videos: number
  files: number
  audio: number
  total: number
  items?: { id: number; filename: string; mime_type: string; file_size: number }[]
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function StorageDashboard() {
  const [data, setData] = useState<StorageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    storageApi.dashboard().then(r => { setData(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-4 text-sm text-gray-400">Loading...</div>
  if (!data) return <div className="p-4 text-sm text-gray-400">No data</div>

  const cats = [
    { label: 'Images', bytes: data.images, icon: '🖼️', color: 'bg-blue-500' },
    { label: 'Videos', bytes: data.videos, icon: '🎬', color: 'bg-purple-500' },
    { label: 'Audio', bytes: data.audio, icon: '🎵', color: 'bg-green-500' },
    { label: 'Files', bytes: data.files, icon: '📄', color: 'bg-amber-500' },
  ]
  const maxBytes = Math.max(...cats.map(c => c.bytes), 1)

  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold text-sm">Storage</h3>
      <div className="text-center">
        <div className="text-3xl font-bold">{formatBytes(data.total)}</div>
        <div className="text-xs text-gray-400">Total storage used</div>
      </div>
      <div className="space-y-2">
        {cats.map(c => (
          <div key={c.label} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>{c.icon} {c.label}</span>
              <span>{formatBytes(c.bytes)}</span>
            </div>
            <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
              <div className={`h-full ${c.color} rounded-full transition-all`} style={{ width: `${(c.bytes / maxBytes) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
