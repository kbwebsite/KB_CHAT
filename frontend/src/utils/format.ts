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

export function getFileIcon(mime: string) {
  if (mime.startsWith('image/')) return 'image'
  if (mime.includes('pdf')) return 'pdf'
  return 'file'
}
