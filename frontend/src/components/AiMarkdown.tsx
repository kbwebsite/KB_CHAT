import { memo, useState, Children, isValidElement } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { Check, Copy } from 'lucide-react'

/**
 * Shared AI-response renderer: headings, lists (nested), tables, quotes,
 * inline code, fenced code (copy button, own horizontal scroll), hr, links.
 * No raw HTML is ever rendered (no rehype-raw), so AI output can't inject
 * markup. Tables/code scroll *inside* their wrapper — never the page.
 */
function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — leave the button as-is */
    }
  }
  return (
    <div className="my-2 min-w-0 max-w-full rounded-xl border border-border/60 bg-black/40 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40">
        <span className="text-[11px] font-medium text-muted-foreground">{lang || 'code'}</span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Copy code"
        >
          {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="m-0 p-3 overflow-x-auto text-xs leading-relaxed overscroll-contain">
        <code className="font-mono whitespace-pre">{code}</code>
      </pre>
    </div>
  )
}

const components = {
  h1: ({ children }: any) => (
    <h1 className="text-base font-bold mt-3 mb-1.5 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-[15px] font-bold mt-3 mb-1.5 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-sm font-semibold mt-2.5 mb-1 first:mt-0">{children}</h3>
  ),
  h4: ({ children }: any) => (
    <h4 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h4>
  ),
  p: ({ children }: any) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }: any) => (
    <ul className="my-1.5 ml-4 list-disc space-y-1 marker:text-primary">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="my-1.5 ml-4 list-decimal space-y-1 marker:text-primary">{children}</ol>
  ),
  li: ({ children }: any) => <li className="pl-0.5 [&>ul]:mt-1 [&>ol]:mt-1">{children}</li>,
  a: ({ href, children }: any) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 break-all"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="my-2 border-l-2 border-primary/50 pl-3 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  table: ({ children }: any) => (
    <div className="my-2 -mx-1 px-1 min-w-0 max-w-full overflow-x-auto overscroll-contain">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-primary/10">{children}</thead>,
  th: ({ children }: any) => (
    <th className="border border-border/60 px-2.5 py-1.5 text-left font-semibold whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="border border-border/40 px-2.5 py-1.5 align-top">{children}</td>
  ),
  // Inline code only — fenced blocks are handled by `pre` below.
  code: ({ className, children }: any) => (
    <code className="rounded bg-primary/15 px-1 py-0.5 font-mono text-[12px] break-words">
      {children}
    </code>
  ),
  pre: ({ children }: any) => {
    const child = Children.count(children) === 1 ? (Children.toArray(children)[0] as any) : null
    const props = isValidElement(child) ? (child.props as any) : {}
    const lang = (/language-([\w+-]+)/.exec(props.className || '') || [])[1] || ''
    const code = Array.isArray(props.children)
      ? props.children.map((c: any) => (typeof c === 'string' ? c : '')).join('')
      : typeof props.children === 'string'
        ? props.children
        : ''
    return <CodeBlock code={code.replace(/\n$/, '')} lang={lang} />
  },
}

function AiMarkdownBase({ text, className }: { text: string; className?: string }) {
  return (
    <div className={`ai-markdown min-w-0 max-w-full break-words text-sm leading-relaxed ${className || ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

const AiMarkdown = memo(AiMarkdownBase)
export default AiMarkdown
