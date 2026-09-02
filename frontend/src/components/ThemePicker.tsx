import { useState } from 'react'
import { Palette, Check, RotateCcw, Sparkles, Droplets } from 'lucide-react'
import { useThemeStore, THEME_PRESETS, ThemePreset } from '../store/theme'

export function ThemePicker({ onClose }: { onClose: () => void }) {
  const { currentThemeId, customColors, setTheme, setCustomColor, resetCustom } = useThemeStore()
  const [showCustom, setShowCustom] = useState(false)

  const currentTheme = THEME_PRESETS.find(t => t.id === currentThemeId) || THEME_PRESETS[0]

  const customColorOptions: { key: keyof ThemePreset['colors']; label: string; type?: string }[] = [
    { key: 'accentPrimary', label: 'Accent' },
    { key: 'accentSecondary', label: 'Accent 2' },
    { key: 'bgPrimary', label: 'Background', type: 'color' },
    { key: 'bgSecondary', label: 'Surface', type: 'color' },
    { key: 'bubbleSent', label: 'Sent Bubble' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-border flex items-center gap-3">
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex items-center gap-2 flex-1">
          <Palette className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">Chat Theme</h1>
        </div>
        {customColors && (
          <button onClick={resetCustom} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Reset custom">
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Current theme preview */}
        <div className="relative rounded-2xl overflow-hidden" style={{
          background: currentTheme.colors.bgPrimary,
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: `0 8px 32px rgba(0,0,0,0.5), ${currentTheme.colors.shadowGlow}`,
        }}>
          <div className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: currentTheme.colors.bubbleSent }}>
                K
              </div>
              <div className="flex-1">
                <div className="h-2 w-16 rounded" style={{ background: currentTheme.colors.accentTertiary }} />
                <div className="h-2 w-10 rounded mt-1" style={{ background: currentTheme.colors.bgTertiary }} />
              </div>
            </div>
            {/* Sample messages */}
            <div className="space-y-2">
              <div className="flex">
                <div className="max-w-[70%] px-3 py-2 rounded-2xl rounded-bl-md text-xs" style={{
                  background: currentTheme.colors.bubbleReceived,
                  color: currentTheme.colors.bubbleReceivedText,
                  border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  Hey! How are you?
                </div>
              </div>
              <div className="flex justify-end">
                <div className="max-w-[70%] px-3 py-2 rounded-2xl rounded-br-md text-xs" style={{
                  background: currentTheme.colors.bubbleSent,
                  color: currentTheme.colors.bubbleSentText,
                }}>
                  Great! Loving this theme ✨
                </div>
              </div>
            </div>
          </div>
          {/* Glass overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: currentTheme.colors.glassB,
            backdropFilter: 'blur(40px)',
          }} />
        </div>

        {/* Preset themes */}
        <div>
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            3D Theme Presets
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {THEME_PRESETS.map(theme => (
              <button
                key={theme.id}
                onClick={() => setTheme(theme.id)}
                className={`relative rounded-xl overflow-hidden transition-all ${currentThemeId === theme.id ? 'ring-2 ring-primary scale-[1.02]' : 'hover:scale-[1.01]'}`}
                style={{
                  background: theme.colors.bgSecondary,
                  border: '1px solid rgba(255,255,255,0.06)',
                  boxShadow: currentThemeId === theme.id ? theme.colors.shadowGlow : 'none',
                }}
              >
                {/* Theme preview mini */}
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-base">{theme.icon}</div>
                    <div className="text-left">
                      <p className="text-xs font-medium">{theme.name}</p>
                      <p className="text-[10px] text-muted-foreground">{theme.description}</p>
                    </div>
                  </div>
                  {/* Mini bubbles */}
                  <div className="flex gap-1 mt-2">
                    <div className="w-16 h-6 rounded-lg" style={{ background: theme.colors.bubbleReceived, opacity: 0.8 }} />
                    <div className="w-14 h-6 rounded-lg ml-auto" style={{ background: theme.colors.bubbleSent }} />
                  </div>
                  {/* Color dots */}
                  <div className="flex gap-1 mt-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: theme.colors.accentPrimary }} />
                    <div className="w-3 h-3 rounded-full" style={{ background: theme.colors.accentSecondary }} />
                    <div className="w-3 h-3 rounded-full" style={{ background: theme.colors.accentTertiary }} />
                  </div>
                </div>
                {currentThemeId === theme.id && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Custom colors */}
        <div>
          <button
            onClick={() => setShowCustom(!showCustom)}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-card border border-border/50 hover:bg-card/80 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Custom Colors</span>
            </div>
            <svg className={`w-4 h-4 transition-transform ${showCustom ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {showCustom && (
            <div className="mt-3 space-y-3 p-3 rounded-xl bg-card border border-border/50">
              {customColorOptions.map(opt => (
                <div key={opt.key} className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">{opt.label}</label>
                  <input
                    type="color"
                    value={customColors?.[opt.key] || currentTheme.colors[opt.key]}
                    onChange={e => setCustomColor(opt.key, e.target.value)}
                    className="w-8 h-8 rounded-lg border border-border cursor-pointer"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
