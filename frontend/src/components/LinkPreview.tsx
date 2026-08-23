import { useState, useEffect } from 'react'
import { linkPreviewApi } from '../services/api'
import { ExternalLink } from 'lucide-react'

interface LinkPreviewData {
  url: string
  domain: string
  title: string
  description: string
  image: string | null
}

export function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<LinkPreviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    linkPreviewApi.fetch(url).then(res => {
      if (!cancelled && res.success && res.data.title !== url) setData(res.data)
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [url])

  if (loading || !data) return null

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1.5 block rounded-xl border overflow-hidden hover:bg-muted/50 transition group max-w-sm">
      {data.image && <div className="h-32 bg-muted overflow-hidden"><img src={data.image} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} /></div>}
      <div className="p-2.5">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{data.domain}</p>
        <p className="text-xs font-medium line-clamp-2 mt-0.5 group-hover:text-primary transition">{data.title}</p>
        {data.description && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{data.description}</p>}
      </div>
    </a>
  )
}

export function hasUrl(text: string): boolean {
  return /https?:\/\/[^\s]+/.test(text)
}

export function extractUrls(text: string): string[] {
  return (text.match(/https?:\/\/[^\s]+/g) || []).slice(0, 3)
}
