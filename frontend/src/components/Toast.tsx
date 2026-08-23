import { useToastStore } from '../store/toast'

export function ToastContainer() {
  const { toasts, remove } = useToastStore()
  if (toasts.length===0) return null
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 space-y-2 w-full max-w-sm px-4 pointer-events-none">
      {toasts.map(t=> (
        <div key={t.id} onClick={()=> remove(t.id)} className={`pointer-events-auto px-4 py-3 rounded-xl shadow-lg border text-sm cursor-pointer flex items-center gap-2 animate-in slide-in-from-bottom-2 ${t.type==='error' ? 'bg-destructive text-destructive-foreground border-destructive' : t.type==='success' ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-card text-card-foreground'}`}>
          <span className="flex-1">{t.message}</span>
          <span className="text-xs opacity-70">×</span>
        </div>
      ))}
    </div>
  )
}
