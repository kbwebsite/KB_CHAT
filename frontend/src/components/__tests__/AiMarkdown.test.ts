/**
 * Acceptance: AI responses render as formatted content — never raw Markdown.
 * Rendered server-side to static markup (no DOM needed) and asserted on.
 */
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AiMarkdown from '../AiMarkdown'

const SAMPLE = [
  '## Health & Well-Being',
  '',
  '**2-minute stretch break** and *breathe deeply*.',
  '',
  'Every hour, stand up and stretch.',
  '',
  '- Point one',
  '  - Nested point',
  '- Point three',
  '',
  '1. First step',
  '2. Second step',
  '',
  '| Action | Duration |',
  '|---|---|',
  '| Stretch | 2 min |',
  '| Walk | 5 min |',
  '',
  '> Stay consistent and track progress.',
  '',
  'Use `inline code` and see https://example.com for more.',
  '',
  '```javascript',
  'const message = "Hello";',
  'console.log(message);',
  '```',
  '',
  '---',
].join('\n')

function html(text: string = SAMPLE) {
  return renderToStaticMarkup(createElement(AiMarkdown, { text }))
}

describe('AiMarkdown', () => {
  it('renders headings, bold, italic, lists without raw syntax', () => {
    const out = html()
    expect(out).toContain('<h2')
    expect(out).toContain('Health &amp; Well-Being')
    expect(out).toContain('<strong>2-minute stretch break</strong>')
    expect(out).toContain('<em>breathe deeply</em>')
    expect(out).toContain('<ul')
    expect(out).toContain('<ol')
    expect(out).toContain('Nested point')
    expect(out).not.toContain('## Health')
    expect(out).not.toContain('**2-minute')
    expect(out).not.toContain('*breathe')
  })

  it('renders tables without pipes and blockquotes without >', () => {
    const out = html()
    expect(out).toContain('<table')
    expect(out).toContain('<th')
    expect(out).toContain('<td')
    expect(out).toContain('Stretch')
    expect(out).toContain('<blockquote')
    expect(out).not.toContain('| Action |')
    expect(out).not.toContain('|---|')
  })

  it('renders code blocks with language label, copy button, no fences', () => {
    const out = html()
    expect(out).toContain('javascript')
    expect(out).toContain('Copy')
    expect(out).toContain('console.log')
    expect(out).not.toContain('```')
  })

  it('renders inline code, links, hr without syntax', () => {
    const out = html()
    expect(out).toContain('<code')
    expect(out).toContain('inline code')
    expect(out).toContain('<a ')
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('<hr')
  })

  it('never renders raw HTML from AI output (XSS-safe)', () => {
    const out = html('Hello <script>alert(1)</script> <img src=x onerror=y> world')
    expect(out).not.toContain('<script>')
    expect(out).not.toContain('<img')
    // escaped text remnants are harmless — they render as visible text
    expect(out).toContain('&lt;script&gt;')
  })

  it('keeps tables/code inside their own scroll wrappers', () => {
    const out = html()
    expect(out).toContain('overflow-x-auto')
  })

  it('handles empty and plain text', () => {
    expect(html('').trim()).not.toContain('##')
    const plain = html('Just a plain sentence.')
    expect(plain).toContain('Just a plain sentence.')
  })
})
