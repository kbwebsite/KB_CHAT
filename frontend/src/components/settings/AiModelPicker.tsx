import { useEffect, useState } from 'react'
import { Bot } from 'lucide-react'
import { aiApi } from '../../services/api'

type ProviderInfo = { name: string; label: string; default_model: string }

const CURATED_MODELS: Record<string, string[]> = {
  groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
  openrouter: ['liquid/lfm-2.5-2.6b:free', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'],
  ollama: ['gemma4:31b-cloud', 'gpt-oss:20b'],
}

const KEY = 'kb_ai_model'

function readSel(): { provider?: string; model?: string } {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** In-app AI model picker. Server default (Auto) unless the user picks a
 * configured backend; the choice rides along on chat/summarize/translate. */
export function AiModelPicker() {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [sel, setSel] = useState<{ provider?: string; model?: string }>(readSel)
  const [custom, setCustom] = useState(false)

  useEffect(() => {
    aiApi
      .providers()
      .then((r: any) => {
        if (r?.success) setProviders(r.data || [])
      })
      .catch(() => {})
  }, [])

  const save = (next: { provider?: string; model?: string }) => {
    setSel(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {}
  }

  const models = sel.provider ? CURATED_MODELS[sel.provider] || [] : []

  return (
    <div className="mt-1 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            save({})
            setCustom(false)
          }}
          className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 justify-center ${
            !sel.provider ? 'bg-primary text-primary-foreground border-transparent' : 'bg-background border-[var(--k-border)]'
          }`}
        >
          <Bot className="w-3.5 h-3.5" /> Auto (server)
        </button>
        {providers.map((p) => (
          <button
            key={p.name}
            onClick={() => {
              save({ provider: p.name, model: p.default_model })
              setCustom(false)
            }}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold ${
              sel.provider === p.name
                ? 'bg-primary text-primary-foreground border-transparent'
                : 'bg-background border-[var(--k-border)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {providers.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No extra models configured on this server — Auto uses the server default (or offline guide).
        </p>
      )}
      {sel.provider && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {models.map((m) => (
              <button
                key={m}
                onClick={() => save({ provider: sel.provider, model: m })}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border ${
                  sel.model === m && !custom
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-background border-[var(--k-border)] text-muted-foreground'
                }`}
              >
                {m}
              </button>
            ))}
            <button
              onClick={() => setCustom((v) => !v)}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border bg-background border-[var(--k-border)] text-muted-foreground"
            >
              Custom…
            </button>
          </div>
          {custom && (
            <input
              defaultValue={models.includes(sel.model || '') ? '' : sel.model}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && sel.provider) {
                  const v = (e.target as HTMLInputElement).value.trim()
                  if (v) save({ provider: sel.provider, model: v })
                }
              }}
              placeholder="Type exact model id + Enter"
              className="w-full px-3 py-2 rounded-xl bg-background border border-[var(--k-border)] outline-none text-xs"
            />
          )}
          {sel.model && (
            <p className="text-[11px] text-muted-foreground">
              Using <span className="font-semibold text-foreground">{sel.model}</span> via{' '}
              {providers.find((p) => p.name === sel.provider)?.label || sel.provider} for
              chat, summaries and translations.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
