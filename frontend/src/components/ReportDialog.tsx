import { useState } from 'react'
import { Flag, X } from 'lucide-react'
import { moderationApi } from '../services/api'
import { useToastStore } from '../store/toast'

const REASONS = [
  { id: 'spam', label: 'Spam or ads' },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hate', label: 'Hate speech' },
  { id: 'explicit', label: 'Explicit content' },
  { id: 'scam', label: 'Scam or fraud' },
  { id: 'violence', label: 'Violence or threats' },
  { id: 'other', label: 'Something else' },
]

/** Report a message to platform moderators. Any signed-in user may file. */
export function ReportDialog({ messageId, onClose }: { messageId: number; onClose: () => void }) {
  const [reason, setReason] = useState('spam')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToastStore((s) => s.push)

  const submit = async () => {
    setBusy(true)
    try {
      const res = await moderationApi.report('message', messageId, reason, details.trim() || undefined)
      if (res?.success) {
        toast('Report submitted. Moderators will review it.', 'success')
        onClose()
      } else {
        toast(res?.message || 'Could not submit the report', 'error')
      }
    } catch (e: any) {
      toast(e.response?.data?.detail || 'Could not submit the report', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="bottom-sheet-overlay open" onClick={onClose} />
      <div className="bottom-sheet open" role="dialog" aria-modal="true" aria-label="Report message">
        <div className="bottom-sheet-handle" aria-hidden="true" />
        <div className="bottom-sheet-title flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-primary" aria-hidden="true" />
            Report message
          </span>
          <button onClick={onClose} aria-label="Close report dialog" className="icon-btn">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-5 space-y-3">
          <div>
            <label htmlFor="report-reason" className="text-xs font-semibold text-muted-foreground">
              What is wrong with this message?
            </label>
            <select
              id="report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input mt-1.5 w-full min-h-[44px]"
            >
              {REASONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="report-details" className="text-xs font-semibold text-muted-foreground">
              Details <span className="font-normal">(optional)</span>
            </label>
            <textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Anything that helps moderators decide…"
              rows={3}
              maxLength={1000}
              className="input mt-1.5 w-full resize-none"
            />
          </div>
          <button
            onClick={submit}
            disabled={busy}
            className="w-full py-3 rounded-2xl btn-primary text-[15px] font-bold disabled:opacity-50 min-h-[48px]"
          >
            {busy ? 'Submitting…' : 'Submit report'}
          </button>
        </div>
      </div>
    </>
  )
}
