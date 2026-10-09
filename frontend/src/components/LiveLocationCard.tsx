import { useEffect, useState } from 'react'
import { MapPin, Navigation, Square } from 'lucide-react'
import wsService from '../services/websocket'
import { liveLocationApi } from '../services/api'
import {
  osmEmbedUrl,
  isTrackingLive,
  startLiveTracking,
  stopLiveTracking,
} from '../utils/liveLocation'

export type LiveSession = {
  id: number
  conversation_id: number
  user_id: number
  username?: string | null
  display_name?: string | null
  avatar_url?: string | null
  lat: number
  lon: number
  accuracy?: number | null
  expires_at?: string | null
  stopped_at?: string | null
  active: boolean
}

function remainingLabel(expiresAt?: string | null): string {
  if (!expiresAt) return ''
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'ended'
  const m = Math.floor(ms / 60000)
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m left`
  return `${m}m left`
}

/** Live-updating map card for a `live_location` message. Subscribes to
 * `location.live.update/stop` WS events; polls every 20s as fallback. */
export function LiveLocationCard({
  sessionId,
  isOwn,
  sharerName,
  sharerId,
  myId,
}: {
  sessionId: number
  isOwn: boolean
  sharerName?: string | null
  sharerId?: number | null
  myId?: number | null
}) {
  const [session, setSession] = useState<LiveSession | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [, setTick] = useState(0)
  const mine = isOwn || (myId != null && sharerId != null && myId === sharerId)
  const tracking = isTrackingLive(sessionId)

  useEffect(() => {
    let cancelled = false
    liveLocationApi
      .get(sessionId)
      .then((r: any) => {
        if (!cancelled && r?.success) setSession(r.data)
        else if (!cancelled) setLoadError(true)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    const onUpdate = (p: any) => {
      if (p?.id === sessionId) setSession(p)
    }
    const onStop = (p: any) => {
      if (p?.id === sessionId) {
        setSession(p)
        stopLiveTracking(sessionId)
      }
    }
    const off1 = wsService.on('location.live.update', onUpdate)
    const off2 = wsService.on('location.live.stop', onStop)
    const off3 = wsService.on('location.live.start', onUpdate)
    const poll = setInterval(() => {
      liveLocationApi
        .get(sessionId)
        .then((r: any) => {
          if (!cancelled && r?.success) setSession(r.data)
        })
        .catch(() => {})
    }, 20000)
    const clock = setInterval(() => setTick((t) => t + 1), 15000)
    return () => {
      cancelled = true
      off1()
      off2()
      off3()
      clearInterval(poll)
      clearInterval(clock)
    }
  }, [sessionId])

  const handleStop = async () => {
    if (stopping) return
    setStopping(true)
    try {
      const r = await liveLocationApi.stop(sessionId)
      if (r?.success) setSession(r.data)
    } catch {}
    stopLiveTracking(sessionId)
    setStopping(false)
  }

  const handleResume = () => {
    if (session?.expires_at) startLiveTracking(sessionId, session.expires_at)
    setTick((t) => t + 1)
  }

  if (loadError && !session) {
    return (
      <p className="text-xs italic opacity-70 min-w-[210px] max-w-[260px]">
        📍 Live location (unavailable)
      </p>
    )
  }
  if (!session) {
    return (
      <div className="min-w-[230px] max-w-[280px] rounded-xl overflow-hidden border border-current/20 animate-pulse">
        <div className="h-36 bg-muted" />
        <p className="text-xs px-2.5 py-2 opacity-60">Loading live location…</p>
      </div>
    )
  }

  const live = !!session.active
  const url = `https://www.openstreetmap.org/?mlat=${session.lat}&mlon=${session.lon}#map=16/${session.lat}/${session.lon}`
  const dirs = `https://www.google.com/maps/dir/?api=1&destination=${session.lat}%2C${session.lon}`

  return (
    <div
      className="mb-1 rounded-xl overflow-hidden border border-current/20 min-w-[230px] max-w-[280px]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold ${isOwn ? 'bg-white/15' : 'bg-muted'}`}>
        {live ? (
          <span className="flex items-center gap-1 text-red-500">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            LIVE
          </span>
        ) : (
          <span className="flex items-center gap-1 opacity-70">
            <MapPin className="w-3.5 h-3.5" /> Ended
          </span>
        )}
        <span className="truncate font-normal opacity-80">
          {mine ? 'You' : sharerName || session.display_name || session.username || 'Someone'}
          {' sharing'}
        </span>
        {live && (
          <span className="ml-auto font-normal opacity-70 tabular-nums shrink-0">
            {remainingLabel(session.expires_at)}
          </span>
        )}
      </div>
      <a href={url} target="_blank" rel="noreferrer" className="block bg-black/20">
        <iframe
          title={`Live map ${session.lat},${session.lon}`}
          src={osmEmbedUrl(session.lat, session.lon)}
          loading="lazy"
          className={`w-full h-36 ${live ? '' : 'pointer-events-none grayscale-[35%]'}`}
        />
      </a>
      <div className="flex gap-1.5 p-1.5">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex-1 text-center text-xs font-medium px-2 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          Open map
        </a>
        <a
          href={dirs}
          target="_blank"
          rel="noreferrer"
          className="flex-1 text-center text-xs font-medium px-2 py-1.5 rounded-lg bg-muted hover:bg-accent transition-colors flex items-center justify-center gap-1"
        >
          <Navigation className="w-3 h-3" /> Directions
        </a>
      </div>
      {mine && live && (
        <div className="px-1.5 pb-1.5">
          <button
            onClick={handleStop}
            disabled={stopping}
            className="w-full py-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1"
          >
            <Square className="w-3 h-3" /> {stopping ? 'Stopping…' : 'Stop sharing'}
          </button>
          {!tracking && (
            <button
              onClick={handleResume}
              className="w-full mt-1 py-1.5 rounded-lg bg-muted hover:bg-accent text-xs font-medium"
              title="This device stopped sending updates (e.g. after a reload)"
            >
              Resume live updates
            </button>
          )}
        </div>
      )}
    </div>
  )
}
