import { useEffect, useRef, useState } from 'react'
import { Clapperboard } from 'lucide-react'
import {
  collectWTState,
  isDirectMediaUrl,
  needsSeek,
  parseWTUrl,
  parseYouTubeId,
  type WTAction,
} from '../utils/watchTogether'

declare global {
  interface Window {
    YT?: any
    onYouTubeIframeAPIReady?: () => void
  }
}

let ytApiPromise: Promise<boolean> | null = null

/** Load the YouTube IFrame API once; resolves false when unavailable. */
function loadYouTubeApi(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (window.YT?.Player) return Promise.resolve(true)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve) => {
    try {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        try {
          prev?.()
        } catch {}
        resolve(true)
      }
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      tag.async = true
      tag.onerror = () => resolve(false)
      document.head.appendChild(tag)
      // Never hang the card if the API is blocked (offline/adblock/tests).
      setTimeout(() => resolve(!!window.YT?.Player), 8000)
    } catch {
      resolve(false)
    }
  })
  return ytApiPromise
}

export function WatchTogether({
  challenge,
  msgs,
  meId,
  onState,
}: {
  challenge: any
  msgs: any[]
  meId?: number | null
  onState: (challenge: any, action: WTAction, pos: number) => void
}) {
  const roomId = challenge.id ?? 0
  const settingUp = !(roomId > 0)
  const url = parseWTUrl(challenge.content)
  const ytId = url ? parseYouTubeId(url) : null
  const direct = url && !ytId ? isDirectMediaUrl(url) : false
  const isHost = meId != null && challenge.sender_id === meId && !settingUp
  const hostName = challenge.sender_display_name || challenge.sender_username || 'Someone'

  const state = collectWTState(roomId, msgs)

  const ytHostRef = useRef<HTMLDivElement | null>(null)
  const ytPlayer = useRef<any>(null)
  const [ytReady, setYtReady] = useState(false)
  const [ytFailed, setYtFailed] = useState(false)
  const emitRef = useRef(onState)
  emitRef.current = onState
  const challengeRef = useRef(challenge)
  challengeRef.current = challenge

  // Host: broadcast discrete player events (never continuous ticks).
  useEffect(() => {
    if (!ytId || ytFailed) return
    let disposed = false
    loadYouTubeApi().then((ok) => {
      if (disposed || !ok || !ytHostRef.current) {
        if (!ok) setYtFailed(true)
        return
      }
      try {
        const player = new window.YT.Player(ytHostRef.current, {
          videoId: ytId,
          width: '100%',
          playerVars: { rel: 0, modestbranding: 1 },
          events: {
            onReady: () => {
              if (!disposed) setYtReady(true)
            },
            onStateChange: (e: any) => {
              if (disposed) return
              // Only the host drives the room; viewers watch freely.
              if (challengeRef.current.sender_id !== meId) return
              const YTState = window.YT?.PlayerState
              const pos = Math.floor(player.getCurrentTime?.() || 0)
              if (e?.data === YTState?.PLAYING) emitRef.current(challengeRef.current, 'play', pos)
              else if (e?.data === YTState?.PAUSED) emitRef.current(challengeRef.current, 'pause', pos)
            },
          },
        })
        ytPlayer.current = player
      } catch {
        setYtFailed(true)
      }
    })
    return () => {
      disposed = true
      try {
        ytPlayer.current?.destroy?.()
      } catch {}
      ytPlayer.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytId, ytFailed])

  // Viewers: follow the host (drift-tolerant, so no seek fights).
  useEffect(() => {
    if (!state || !ytReady || !ytPlayer.current) return
    if (challenge.sender_id === meId) return
    try {
      const p = ytPlayer.current
      const cur = Number(p.getCurrentTime?.() || 0)
      if (state.action === 'play') {
        if (needsSeek(cur, state.pos)) p.seekTo?.(state.pos, true)
        p.playVideo?.()
      } else if (state.action === 'pause') {
        if (needsSeek(cur, state.pos)) p.seekTo?.(state.pos, true)
        p.pauseVideo?.()
      } else if (needsSeek(cur, state.pos)) {
        p.seekTo?.(state.pos, true)
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.action, state?.pos, state?.id, ytReady])

  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Viewers (direct file): follow the host on each new sync marker.
  useEffect(() => {
    if (!state || !direct || !videoRef.current) return
    if (challenge.sender_id === meId) return
    const v = videoRef.current
    try {
      if (needsSeek(v.currentTime || 0, state.pos)) v.currentTime = state.pos
      if (state.action === 'play' && v.paused) void v.play().catch(() => {})
      else if (state.action === 'pause' && !v.paused) v.pause()
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.action, state?.pos, state?.id])

  return (
    <div className="w-full max-w-[300px] min-w-0 overflow-hidden">
      <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
        <Clapperboard className="w-3.5 h-3.5" /> Watch together
      </p>
      {!url ? (
        <p className="text-xs opacity-70">That link didn't look playable — YouTube or mp4 links work.</p>
      ) : ytId ? (
        ytFailed ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${ytId}?rel=0`}
            title="Watch together"
            className="w-full aspect-video rounded-xl bg-black"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div ref={ytHostRef} className="w-full aspect-video rounded-xl overflow-hidden bg-black" />
        )
      ) : direct ? (
        <video
          ref={videoRef}
          src={url}
          controls
          playsInline
          preload="metadata"
          className="w-full aspect-video rounded-xl bg-black"
          onPlay={(e) => {
            if (!isHost) return
            onState(challenge, 'play', Math.floor(e.currentTarget.currentTime || 0))
          }}
          onPause={(e) => {
            if (!isHost) return
            onState(challenge, 'pause', Math.floor(e.currentTarget.currentTime || 0))
          }}
          onSeeked={(e) => {
            if (!isHost) return
            onState(challenge, 'seek', Math.floor(e.currentTarget.currentTime || 0))
          }}
        />
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="block text-xs underline underline-offset-2 break-all"
        >
          {url}
        </a>
      )}
      <p className="text-[11px] opacity-70 mt-1.5">
        {isHost ? 'You host — everyone follows your play / pause.' : `Hosted by ${hostName} — your player follows along.`}
        {state && (
          <span className="ml-1.5 font-semibold text-primary">
            {state.action === 'play' ? '▶ playing' : state.action === 'pause' ? '⏸ paused' : '⏩ synced'}
          </span>
        )}
      </p>
    </div>
  )
}
