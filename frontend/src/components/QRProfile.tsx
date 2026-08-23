import { useState } from 'react'
import { Download, Share2, Copy, Check } from 'lucide-react'

export default function QRProfile({ username, displayName }: { username: string; displayName?: string }) {
  const [copied, setCopied] = useState(false)
  const profileUrl = `${window.location.origin}/u/${username}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(profileUrl)}&bgcolor=ffffff&color=000000&margin=10`

  const handleCopy = () => {
    navigator.clipboard.writeText(profileUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${displayName || username}'s Profile`, url: profileUrl })
      } catch {}
    } else {
      handleCopy()
    }
  }

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = qrUrl
    a.download = `kb-chat-${username}-qr.png`
    a.click()
  }

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <div className="bg-white p-3 rounded-xl shadow-lg">
        <img src={qrUrl} alt={`QR code for ${username}`} className="w-48 h-48" />
      </div>
      <p className="text-sm font-medium">{displayName || username}</p>
      <p className="text-xs text-muted-foreground text-center break-all">{profileUrl}</p>
      <div className="flex gap-2 w-full">
        <button onClick={handleCopy} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted hover:bg-accent text-xs font-medium transition">
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
        <button onClick={handleShare} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted hover:bg-accent text-xs font-medium transition">
          <Share2 className="w-3.5 h-3.5" /> Share
        </button>
        <button onClick={handleDownload} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted hover:bg-accent text-xs font-medium transition">
          <Download className="w-3.5 h-3.5" /> Save QR
        </button>
      </div>
    </div>
  )
}
