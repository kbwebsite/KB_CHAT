import { liveLocationApi } from '../services/api'

/** Extract the live session id from a live-location message body
 * (`"📍 Live location\n[live:123]"`). Null when absent/invalid. */
export function parseLiveSessionId(text: unknown): number | null {
  if (typeof text !== 'string') return null
  const m = /\[live:(\d+)\]/.exec(text)
  if (!m) return null
  const id = Number(m[1])
  return Number.isInteger(id) && id > 0 ? id : null
}

/** OSM embed URL for a lat/lon marker. Shared by static + live cards. */
export function osmEmbedUrl(lat: number, lon: number, delta = 0.008): string {
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lon - delta}%2C${lat - delta}%2C${lon + delta}%2C${lat + delta}&layer=mapnik&marker=${lat}%2C${lon}`
}

type Track = {
  watchId: number
  lastSent: number
  pending: { lat: number; lon: number; acc: number | null } | null
  flushTimer: ReturnType<typeof setInterval>
  expiryTimer: ReturnType<typeof setTimeout> | null
}

const tracks = new Map<number, Track>()

/** Live position tracking for sessions owned by this device.
 * Throttled to one server update per 10s (server enforces 5s). Tracking
 * is in-memory: a reload stops updates (the session stays live server-side
 * until expiry; the owner can resume from the card). */
export function isTrackingLive(sessionId: number): boolean {
  return tracks.has(sessionId)
}

export function startLiveTracking(sessionId: number, expiresAt?: string | null): boolean {
  if (tracks.has(sessionId) || !('geolocation' in navigator)) return false
  const send = async (lat: number, lon: number, acc: number | null) => {
    try {
      await liveLocationApi.update(sessionId, { lat, lon, accuracy: acc })
    } catch {}
  }
  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const t = tracks.get(sessionId)
      if (!t) return
      const point = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        acc: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null,
      }
      const now = Date.now()
      if (now - t.lastSent < 10000) {
        t.pending = point
        return
      }
      t.lastSent = now
      void send(point.lat, point.lon, point.acc)
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  )
  const flushTimer = setInterval(() => {
    const t = tracks.get(sessionId)
    if (!t) return
    if (t.pending && Date.now() - t.lastSent >= 10000) {
      const p = t.pending
      t.pending = null
      t.lastSent = Date.now()
      void send(p.lat, p.lon, p.acc)
    }
  }, 5000)
  let expiryTimer: ReturnType<typeof setTimeout> | null = null
  if (expiresAt) {
    const ms = new Date(expiresAt).getTime() - Date.now()
    if (ms > 0 && ms < 2_147_483_647) {
      expiryTimer = setTimeout(() => stopLiveTracking(sessionId), ms)
    }
  }
  tracks.set(sessionId, { watchId, lastSent: 0, pending: null, flushTimer, expiryTimer })
  return true
}

export function stopLiveTracking(sessionId: number): void {
  const t = tracks.get(sessionId)
  if (!t) return
  try {
    navigator.geolocation.clearWatch(t.watchId)
  } catch {}
  clearInterval(t.flushTimer)
  if (t.expiryTimer) clearTimeout(t.expiryTimer)
  tracks.delete(sessionId)
}
