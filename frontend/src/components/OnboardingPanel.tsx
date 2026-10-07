import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useChatStore } from '../store/chat'
import { usersApi } from '../services/api'
import { isOnboarded, markOnboarded } from '../utils/invite'
import { UserSearch } from './UserSearch'
import { ArrowRight, ArrowLeft, Users, Sparkles, Check } from 'lucide-react'

export { isOnboarded, markOnboarded }

/**
 * Onboarding V1 (PE-1C): 3 small steps for first-run users only.
 * Shown when the account has no conversations yet; invite joins land the
 * user straight into a group (conversations > 0), so invitees skip this.
 * Refresh-safe (restarts at step 1, never traps), skippable everywhere.
 */
export function OnboardingPanel({ onDone, onMobileViewChange }: {
  onDone: () => void
  onMobileViewChange: (view: 'list' | 'chat') => void
}) {
  const { user, setUser } = useAuthStore()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(user?.display_name || '')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const done = () => {
    markOnboarded(user?.id)
    onDone()
  }

  const saveName = async () => {
    const next = name.trim()
    if (!next || next === user?.display_name) {
      setStep(1)
      return
    }
    setSaving(true)
    try {
      const res = await usersApi.updateMe({ display_name: next })
      if (res.success) setUser(res.data)
    } catch {}
    finally {
      setSaving(false)
      setStep(1)
    }
  }

  const startChat = async (u: any) => {
    if (busy) return
    setBusy(true)
    try {
      const { convApi } = await import('../services/api')
      const res = await convApi.create({ participant_username: u.username })
      if (res.success) {
        const st = useChatStore.getState()
        await st.fetchConversations()
        st.setCurrent(res.data.id)
        await st.fetchMessages(res.data.id)
        onMobileViewChange('chat')
        done()
      }
    } catch {}
    finally {
      setBusy(false)
    }
  }

  const newGroup = () => {
    done()
    try {
      window.dispatchEvent(new Event('kb:new-group'))
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="Welcome to Kryzen">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-card border border-border p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center gap-1.5 mb-5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'kryzen-accent-gradient' : 'bg-muted'}`} />
          ))}
        </div>

        {step === 0 && (
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">Welcome to Kryzen 🎉</h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Groups, channels and an AI assistant in one place. Start a group,
              follow a channel, or ask the AI — everything lives here.
            </p>
            <label className="block text-[13px] font-semibold text-muted-foreground mt-5 mb-1.5">Your display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Morgan"
              autoComplete="name"
              className="auth-input w-full min-w-0 px-4 py-3 outline-none text-sm"
            />
            <button onClick={saveName} disabled={saving} className="auth-submit-btn w-full py-3.5 mt-4 rounded-2xl text-white font-bold text-[15px] disabled:opacity-60 flex items-center justify-center gap-2 min-h-[44px]">
              {saving ? 'Saving…' : <>Continue <ArrowRight className="w-4 h-4" /></>}
            </button>
            <button onClick={done} className="w-full mt-2 py-2 text-xs text-muted-foreground hover:underline min-h-[44px]">
              Skip tour
            </button>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">Find your people</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Search by name or username — starting a chat takes you straight there.
            </p>
            <div className="mt-4">
              <UserSearch onSelect={startChat} />
            </div>
            {busy && <p className="text-xs text-muted-foreground mt-2">Opening chat…</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setStep(0)} className="px-4 py-3 rounded-2xl btn-secondary font-semibold text-sm flex items-center gap-1 min-h-[44px]" aria-label="Back">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-2xl btn-secondary font-bold text-[15px] min-h-[44px]">
                I'll do this later
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">You're all set ✨</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Two fast ways to make Kryzen yours:
            </p>
            <div className="grid gap-2.5 mt-4">
              <button onClick={newGroup} className="flex items-center gap-3 p-4 rounded-2xl bg-muted hover:bg-accent transition text-left min-h-[44px]">
                <span className="w-10 h-10 rounded-xl kryzen-accent-gradient flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-white" />
                </span>
                <span>
                  <span className="block font-bold text-sm">Start a group</span>
                  <span className="block text-xs text-muted-foreground">Polls, events, announcements included</span>
                </span>
              </button>
              <button onClick={() => { done(); nav('/ai') }} className="flex items-center gap-3 p-4 rounded-2xl bg-muted hover:bg-accent transition text-left min-h-[44px]">
                <span className="w-10 h-10 rounded-xl kryzen-accent-gradient flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-white" />
                </span>
                <span>
                  <span className="block font-bold text-sm">Ask the AI assistant</span>
                  <span className="block text-xs text-muted-foreground">Summaries, images, answers</span>
                </span>
              </button>
            </div>
            <button onClick={done} className="auth-submit-btn w-full py-3.5 mt-4 rounded-2xl text-white font-bold text-[15px] flex items-center justify-center gap-2 min-h-[44px]">
              <Check className="w-4 h-4" /> Start chatting
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
