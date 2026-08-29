import { Lightbox } from './Lightbox'
import { CallModal } from './CallModal'
import { StatusViewer } from './StatusViewer'
import { CommandPalette, buildCommands } from './CommandPalette'
import { useChatStore } from '../store/chat'
import { X } from 'lucide-react'

export function ChatModals({
  lightbox,
  setLightbox,
  callModal,
  setCallModal,
  statusViewer,
  setStatusViewer,
  forwardMsg,
  setForwardMsg,
  showCommandPalette,
  setShowCommandPalette,
  conversations,
  onForward,
  onNewChat,
  onNewGroup,
  onNewStatus,
  onSettings,
  onSaved,
  onCalls,
  onNotifications,
  onToggleTheme,
  onLogout
}: any) {
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
          onAccept={callModal.onAccept}
          onReject={callModal.onReject}
          onEnd={callModal.onEnd}
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
          <div className="bg-surface rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col border border-border/30">
            <div className="p-4 border-b flex justify-between items-center border-border/30">
              <h3 className="font-semibold">Forward message</h3>
              <button onClick={() => setForwardMsg(null)} className="p-2 hover:bg-surface-2 rounded-full transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 border-b bg-surface-2/20 border-border/30">
              <p className="text-sm line-clamp-2">{forwardMsg.content}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {conversations.map((c: any) => (
                <label key={c.id} className="flex items-center gap-3 p-2 hover:bg-surface-2 rounded-xl cursor-pointer transition-colors">
                  <input type="checkbox" id={`fwd-${c.id}`} className="w-4 h-4" />
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent text-white flex items-center justify-center text-xs">{c.title?.[0]}</div>
                  <span className="text-sm font-medium flex-1 truncate">{c.title}</span>
                </label>
              ))}
            </div>
            <div className="p-3 border-t flex gap-2 border-border/30">
              <button onClick={() => setForwardMsg(null)} className="flex-1 py-2 rounded-xl bg-surface-2 transition-colors hover:bg-surface-3">Cancel</button>
              <button onClick={() => {
                const ids: number[] = []
                conversations.forEach((c: any) => {
                  const el = document.getElementById(`fwd-${c.id}`) as HTMLInputElement
                  if (el?.checked) ids.push(c.id)
                })
                if (ids.length > 0) onForward(ids)
              }} className="flex-1 py-2 rounded-xl bg-primary text-white font-medium transition-colors hover:bg-primary/90">Forward</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}