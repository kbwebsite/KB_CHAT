import { useEffect, useRef, useState } from 'react'
import { PhoneOff, Mic, MicOff, Video, VideoOff, Phone } from 'lucide-react'

type CallType = 'voice' | 'video'

export function CallModal({ open, type, peerName, peerAvatar, isIncoming, onAccept, onReject, onEnd }: {
  open: boolean,
  type: CallType,
  peerName: string,
  peerAvatar?: string | null,
  isIncoming?: boolean,
  onAccept?: ()=>void,
  onReject?: ()=>void,
  onEnd: ()=>void
}) {
  const [micOn, setMicOn]=useState(true)
  const [camOn, setCamOn]=useState(type==='video')
  const [elapsed, setElapsed]=useState(0)
  const [permissionError, setPermissionError]=useState<string|null>(null)
  const localRef=useRef<HTMLVideoElement>(null)
  const streamRef=useRef<MediaStream|null>(null)

  useEffect(()=>{
    if (!open) return
    let timer: any
    if (!isIncoming) {
      timer = setInterval(()=> setElapsed(e=> e+1), 1000)
    }
    // try get media
    const wantVideo = type==='video' && camOn
    navigator.mediaDevices.getUserMedia({ audio: true, video: wantVideo })
      .then(s=>{
        streamRef.current = s
        if (localRef.current) localRef.current.srcObject = s
        setPermissionError(null)
      })
      .catch(err=>{
        setPermissionError(err.message || 'Microphone/Camera permission denied')
      })
    return ()=>{
      clearInterval(timer)
      streamRef.current?.getTracks().forEach(t=> t.stop())
      streamRef.current = null
    }
  }, [open, type, isIncoming])

  useEffect(()=>{
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(t=> t.enabled = micOn)
      streamRef.current.getVideoTracks().forEach(t=> t.enabled = camOn)
    }
  }, [micOn, camOn])

  if (!open) return null
  const format = (s:number)=> `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-gray-900 via-slate-900 to-black flex flex-col items-center justify-center text-white p-6">
      {/* local preview */}
      {type==='video' && (
        <video ref={localRef} autoPlay muted playsInline className="absolute top-4 right-4 w-32 h-24 rounded-xl bg-black object-cover border border-white/10" />
      )}
      <div className="flex flex-col items-center gap-4">
        <div className="w-28 h-28 rounded-full overflow-hidden bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-3xl font-bold">
          {peerAvatar ? <img src={peerAvatar} alt="" className="w-full h-full object-cover"/> : peerName[0]?.toUpperCase()}
        </div>
        <h2 className="text-2xl font-semibold">{peerName}</h2>
        <p className="text-sm text-white/60">{isIncoming ? `Incoming ${type} call...` : type==='video' ? `Video call • ${format(elapsed)}` : `Voice call • ${format(elapsed)}`}</p>
        {permissionError && <p className="text-xs bg-red-500/20 border border-red-500/30 px-3 py-1.5 rounded-full">{permissionError}</p>}
      </div>

      <div className="mt-10 flex items-center gap-4">
        <button onClick={()=> setMicOn(!micOn)} className={`w-14 h-14 rounded-full flex items-center justify-center ${micOn ? 'bg-white/10' : 'bg-red-500'}`}>{micOn ? <Mic className="w-6 h-6"/> : <MicOff className="w-6 h-6"/>}</button>
        {type==='video' && <button onClick={()=> setCamOn(!camOn)} className={`w-14 h-14 rounded-full flex items-center justify-center ${camOn ? 'bg-white/10' : 'bg-red-500'}`}>{camOn ? <Video className="w-6 h-6"/> : <VideoOff className="w-6 h-6"/>}</button>}
        {isIncoming ? (
          <>
            <button onClick={onReject} className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center"><PhoneOff className="w-7 h-7"/></button>
            <button onClick={onAccept} className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center"><Phone className="w-7 h-7"/></button>
          </>
        ) : (
          <button onClick={onEnd} className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center"><PhoneOff className="w-7 h-7"/></button>
        )}
      </div>

      <p className="absolute bottom-6 text-xs text-white/40">WebRTC ready • KB Chat calls are peer-to-peer with signaling via WebSocket</p>
    </div>
  )
}
