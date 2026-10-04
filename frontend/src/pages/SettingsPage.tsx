import { useNavigate } from 'react-router-dom'
import { WhatsAppSettings } from '../components/settings/WhatsAppSettings'

/**
 * Full-page settings (mobile route + desktop fallback). All UI lives in
 * WhatsAppSettings — shared with SettingsPanel, one definition, both
 * surfaces, same store.
 */
export default function SettingsPage() {
  const navigate = useNavigate()
  return (
    <WhatsAppSettings
      layout="page"
      onBack={() => navigate(-1)}
      onLogout={() => navigate('/login')}
      onOpenConversation={() => navigate('/chat')}
    />
  )
}
