import { Trash2, EyeOff } from 'lucide-react'

/** WhatsApp-style delete choice for your own messages. */
export function DeleteDialog({
  onForMe,
  onForEveryone,
  onClose,
}: {
  onForMe: () => void
  onForEveryone: () => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl max-w-xs w-full p-4 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-center pb-1">Delete message?</p>
        <button
          onClick={() => {
            onForMe()
            onClose()
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-muted transition text-left"
        >
          <EyeOff className="w-4 h-4 text-muted-foreground shrink-0" />
          <span>
            <span className="block text-sm font-medium">Delete for me</span>
            <span className="block text-xs text-muted-foreground">Hidden on this device only</span>
          </span>
        </button>
        <button
          onClick={() => {
            onForEveryone()
            onClose()
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-destructive/10 transition text-left"
        >
          <Trash2 className="w-4 h-4 text-destructive shrink-0" />
          <span>
            <span className="block text-sm font-medium text-destructive">Delete for everyone</span>
            <span className="block text-xs text-muted-foreground">Removed for all participants</span>
          </span>
        </button>
        <button
          onClick={onClose}
          className="w-full py-2 rounded-xl bg-muted text-sm font-medium hover:bg-accent transition"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
