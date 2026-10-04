import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns'

export function formatTime(iso?: string | null) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isToday(d)) return format(d, 'h:mm a')
    if (isYesterday(d)) return 'Yesterday ' + format(d, 'h:mm a')
    return format(d, 'MMM d, h:mm a')
  } catch { return iso || '' }
}

export function formatLastSeen(iso?: string | null, isOnline?: boolean) {
  if (isOnline) return 'Online'
  if (!iso) return 'Offline'
  try {
    return 'Last seen ' + formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch { return 'Offline' }
}

export function initials(name?: string | null) {
  if (!name) return '?'
  return name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()
}

/** "1 group" / "5 groups" — single shared pluralizer, no copies. */
export function plural(n: number | null | undefined, one: string, many?: string) {
  const v = n ?? 0
  return `${v} ${v === 1 ? one : many ?? `${one}s`}`
}

/** 128421 -> "128K", 2_400_000 -> "2.4M". */
export function compact(n: number | null | undefined) {
  const v = n ?? 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return `${v}`
}

/** "128K followers" / "1 follower" — compact number, correct plural. */
export function compactPlural(n: number | null | undefined, one: string, many?: string) {
  const v = n ?? 0
  return `${compact(v)} ${v === 1 ? one : many ?? `${one}s`}`
}

export function getFileIcon(mime: string) {
  if (mime.startsWith('image/')) return 'image'
  if (mime.includes('pdf')) return 'pdf'
  return 'file'
}
