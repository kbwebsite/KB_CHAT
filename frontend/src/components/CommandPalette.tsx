import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, MessageSquare, Users, Image, Phone, Settings, Bookmark, Moon, Sun, LogOut, Bell, Plus, BarChart3, Palette } from 'lucide-react'

interface Command {
  id: string
  label: string
  icon: React.ReactNode
  shortcut?: string
  action: () => void
  category: string
}

export function CommandPalette({ open, onClose, commands }: { open: boolean, onClose: () => void, commands: Command[] }) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!query) return commands
    const q = query.toLowerCase()
    return commands.filter(c => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q))
  }, [query, commands])

  useEffect(() => { if (open) { setQuery(''); setSelectedIdx(0); setTimeout(() => inputRef.current?.focus(), 50) } }, [open])
  useEffect(() => { setSelectedIdx(0) }, [query])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && filtered[selectedIdx]) { filtered[selectedIdx].action(); onClose() }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, filtered, selectedIdx, onClose])

  if (!open) return null

  const grouped = filtered.reduce((acc, cmd) => { (acc[cmd.category] = acc[cmd.category] || []).push(cmd); return acc }, {} as Record<string, Command[]>)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl border overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Type a command..." className="flex-1 bg-transparent outline-none text-sm" />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {Object.entries(grouped).map(([cat, cmds]) => (
            <div key={cat}>
              <p className="px-4 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{cat}</p>
              {cmds.map(cmd => {
                const idx = filtered.indexOf(cmd)
                return (
                  <button key={cmd.id} onClick={() => { cmd.action(); onClose() }} onMouseEnter={() => setSelectedIdx(idx)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition ${idx === selectedIdx ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
                    <span className="w-5 h-5 flex items-center justify-center">{cmd.icon}</span>
                    <span className="flex-1 text-left">{cmd.label}</span>
                    {cmd.shortcut && <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{cmd.shortcut}</kbd>}
                  </button>
                )
              })}
            </div>
          ))}
          {filtered.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No commands found</p>}
        </div>
      </div>
    </div>
  )
}

export function buildCommands(actions: {
  onNewChat: () => void; onNewGroup: () => void; onNewStatus: () => void;
  onSettings: () => void; onSaved: () => void; onCalls: () => void;
  onNotifications: () => void; onToggleTheme: () => void; onLogout: () => void;
}): Command[] {
  return [
    { id: 'new-chat', label: 'New chat', icon: <MessageSquare className="w-4 h-4" />, action: actions.onNewChat, category: 'Actions' },
    { id: 'new-group', label: 'New group', icon: <Users className="w-4 h-4" />, action: actions.onNewGroup, category: 'Actions' },
    { id: 'new-status', label: 'New status', icon: <Image className="w-4 h-4" />, action: actions.onNewStatus, category: 'Actions' },
    { id: 'saved', label: 'Saved messages', icon: <Bookmark className="w-4 h-4" />, shortcut: '', action: actions.onSaved, category: 'Navigation' },
    { id: 'calls', label: 'Calls', icon: <Phone className="w-4 h-4" />, action: actions.onCalls, category: 'Navigation' },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" />, action: actions.onNotifications, category: 'Navigation' },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" />, action: actions.onSettings, category: 'Navigation' },
    { id: 'theme', label: 'Toggle theme', icon: <Moon className="w-4 h-4" />, shortcut: '', action: actions.onToggleTheme, category: 'Appearance' },
    { id: 'logout', label: 'Log out', icon: <LogOut className="w-4 h-4" />, action: actions.onLogout, category: 'Account' },
  ]
}
