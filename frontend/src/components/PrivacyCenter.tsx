import { useState, useEffect } from 'react'
import { privacyApi } from '../services/api'

interface PrivacySettings {
  last_seen_visible: string
  online_status_visible: string
  read_receipts: boolean
  profile_visibility: string
  status_visibility: string
  who_can_contact: string
  notification_previews: boolean
}

export default function PrivacyCenter() {
  const [settings, setSettings] = useState<PrivacySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    privacyApi.get().then(r => { setSettings(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const update = async (key: string, value: any) => {
    if (!settings) return
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    setSaving(true)
    try { await privacyApi.update({ [key]: value }) } catch {}
    setSaving(false)
  }

  if (loading) return <div className="p-4 text-sm text-gray-400">Loading...</div>
  if (!settings) return <div className="p-4 text-sm text-gray-400">Failed to load</div>

  const Select = ({ label, value, options, onChange }: { label: string; value: string; options: { v: string; l: string }[]; onChange: (v: string) => void }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="input text-sm py-1 px-2 w-32">
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  )

  const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      <button onClick={() => onChange(!value)} className={`w-10 h-5 rounded-full transition-colors relative ${value ? 'bg-[var(--primary)]' : 'bg-gray-500'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${value ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  )

  const visOpts = [{ v: 'everyone', l: 'Everyone' }, { v: 'contacts', l: 'Contacts' }, { v: 'nobody', l: 'Nobody' }]

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Privacy Center</h3>
        {saving && <span className="text-xs text-gray-400">Saving...</span>}
      </div>
      <div className="space-y-1 divide-y divide-[var(--border)]">
        <Select label="Last Seen" value={settings.last_seen_visible} options={visOpts} onChange={v => update('last_seen_visible', v)} />
        <Select label="Online Status" value={settings.online_status_visible} options={visOpts} onChange={v => update('online_status_visible', v)} />
        <Toggle label="Read Receipts" value={settings.read_receipts} onChange={v => update('read_receipts', v)} />
        <Select label="Profile Visibility" value={settings.profile_visibility} options={visOpts} onChange={v => update('profile_visibility', v)} />
        <Select label="Status Visibility" value={settings.status_visibility} options={visOpts} onChange={v => update('status_visibility', v)} />
        <Select label="Who Can Contact" value={settings.who_can_contact} options={visOpts} onChange={v => update('who_can_contact', v)} />
        <Toggle label="Notification Previews" value={settings.notification_previews} onChange={v => update('notification_previews', v)} />
      </div>
    </div>
  )
}
