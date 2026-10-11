import React from 'react'

/** WhatsApp-style text formatting: *bold* _italic_ ~strike~ `code`.
 * URLs are never formatted (underscores in links stay intact). */

export type FormatToken =
  | { t: 'text'; s: string }
  | { t: 'bold'; s: string }
  | { t: 'italic'; s: string }
  | { t: 'strike'; s: string }
  | { t: 'code'; s: string }
  | { t: 'url'; s: string }

const URL_RE = /(https?:\/\/[^\s)]+)/gi
// NOTE: no /g flag — String.split with a global regex resumes from the
// regex's sticky lastIndex across calls and silently mis-splits.
const MARK_RE = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/

function formatSegment(seg: string): FormatToken[] {
  // Code spans first (contents stay literal), then inline markers.
  // (No /g flags anywhere: split() with a global regex resumes from the
  // regex's sticky lastIndex across calls and silently mis-splits.)
  const out: FormatToken[] = []
  const parts = seg.split(/(`[^`\n]+`)/)
  for (const p of parts) {
    if (p.startsWith('`') && p.endsWith('`') && p.length >= 2) {
      out.push({ t: 'code', s: p.slice(1, -1) })
      continue
    }
    const sub = p.split(MARK_RE)
    for (const q of sub) {
      if (!q) continue
      // Classify by full match (a lone "*a\nb*" that split left intact
      // must stay text — first/last-char checks alone would misfire).
      if (/^\*[^*\n]+\*$/.test(q)) out.push({ t: 'bold', s: q.slice(1, -1) })
      else if (/^_[^_\n]+_$/.test(q)) out.push({ t: 'italic', s: q.slice(1, -1) })
      else if (/^~[^~\n]+~$/.test(q)) out.push({ t: 'strike', s: q.slice(1, -1) })
      else out.push({ t: 'text', s: q })
    }
  }
  return out
}

export function tokenizeFormatted(text: string): FormatToken[] {
  if (!text) return []
  const out: FormatToken[] = []
  URL_RE.lastIndex = 0
  let last = 0
  let m: RegExpExecArray | null
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) out.push(...formatSegment(text.slice(last, m.index)))
    out.push({ t: 'url', s: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(...formatSegment(text.slice(last)))
  return out
}

/** Plain-text version (sidebar previews, notifications): markers stripped. */
export function stripFormatting(text: string): string {
  return tokenizeFormatted(text)
    .map((t) => t.s)
    .join('')
}

export function renderFormattedText(text: string): React.ReactNode[] {
  return tokenizeFormatted(text).map((t, i) => {
    if (t.t === 'bold') return <strong key={i}>{t.s}</strong>
    if (t.t === 'italic') return <em key={i}>{t.s}</em>
    if (t.t === 'strike') return <del key={i}>{t.s}</del>
    if (t.t === 'code')
      return (
        <code key={i} className="px-1 py-0.5 rounded bg-black/30 font-mono text-[13px]">
          {t.s}
        </code>
      )
    if (t.t === 'url')
      return (
        <a
          key={i}
          href={t.s}
          target="_blank"
          rel="noreferrer"
          className="underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {t.s}
        </a>
      )
    return <span key={i}>{t.s}</span>
  })
}
