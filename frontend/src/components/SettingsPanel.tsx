import { WhatsAppSettings } from './settings/WhatsAppSettings'

/**
 * In-chat sidebar settings. All UI lives in WhatsAppSettings — shared
 * with SettingsPage, one definition, both surfaces, same store.
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  return (
    <WhatsAppSettings
      layout="panel"
      onBack={onClose}
      onLogout={() => {
        window.location.href = '/login'
      }}
      onOpenConversation={onClose}
    />
  )
}
