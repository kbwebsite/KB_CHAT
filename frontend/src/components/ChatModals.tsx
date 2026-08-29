import { Lightbox } from './Lightbox'
import { CallModal } from './CallModal'
import { StatusViewer } from './StatusViewer'
import { CommandPalette, buildCommands } from './CommandPalette'
import { X } from 'lucide-react'
import { useToastStore } from '../store/toast'

export function ChatModals({
  lightbox, setLightbox,
  callModal, setCallModal,
  statusViewer, setStatusViewer,
  forwardMsg, setForwardMsg,
  showCommandPalette, setShowCommandPalette,
  conversations, onForward,
  onNewChat, onNewGroup, onNewStatus,
  onSettings, onSaved, onCalls, onNotifications,
  onToggleTheme, onLogout,
  onCallAccept, onCallRejectOrEnd
}: any) {
  const toast = useToastStore(s => s.push)

  return (
    <>
      {lightbox && <Lightbox images={lightbox.images} startIndex={lightbox.idx} onClose={() => setLightbox(null)} />}
      {callModal?.open && (
        <CallModal
          open={callModal.open}
          type={callModal.type}
          peerName={callModal.peerName}
          peerAvatar={callModal.peerAvatar}
          isIncoming={callModal.incoming}
          callId={callModal.callId}
          peerId={callModal.peerId}
          onAccept={onCallAccept}
          onReject={onCallRejectOrEnd}
          onEnd={onCallRejectOrEnd}
        />
      )}
      {statusViewer && (
        <StatusViewer
          statuses={statusViewer.statuses}
          startIndex={statusViewer.idx}
          onClose={() => setStatusViewer(null)}
        />
      )}
      <CommandPalette
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={buildCommands({
          onNewChat,
          onNewGroup,
          onNewStatus,
          onSettings,
          onSaved,
          onCalls,
          onNotifications,
          onToggleTheme,
          onLogout
        })}
      />
      {forwardMsg && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 modal-entrance">
          <div className="bg-card rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col border border-border kryzen-glass-strong modal-entrance">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="font-semibold">Forward message</h3>
              <button onClick={() => setForwardMsg(null)} className="p-2 hover:bg-muted rounded-full transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 border-b bg-muted border-border">
              <p className="text-sm line-clamp-2">{forwardMsg.content}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {conversations.map((c: any) => (
                <label key={c.id} className="flex items-center gap-3 p-2 hover:bg-muted rounded-xl cursor-pointer transition-colors">
                  <input type="checkbox" id={`fwd-${c.id}`} className="w-4 h-4" />
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground flex items-center justify-center text-xs">{c.title?.[0]}</div>
                  <span className="text-sm font-medium flex-1 truncate">{c.title}</span>
                </label>
              ))}
            </div>
            <div className="p-3 border-t border-border flex gap-2">
              <button onClick={() => setForwardMsg(null)} className="flex-1 py-2 rounded-xl bg-muted transition-colors hover:bg-muted/80">Cancel</button>
              <button onClick={() => {
                const ids: number[] = []
                conversations.forEach((c: any) => {
                  const el = document.getElementById(`fwd-${c.id}`) as HTMLInputElement
                  if (el?.checked) ids.push(c.id)
                })
                if (ids.length === 0) return toast('Select at least one chat', 'error')
                onForward(ids)
              }} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground font-medium transition-colors hover:bg-primary/90">Forward</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}