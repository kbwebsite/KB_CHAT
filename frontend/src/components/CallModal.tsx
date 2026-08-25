import { useEffect, useRef, useState } from 'react'
import { PhoneOff, Mic, MicOff, Video, VideoOff, Phone } from 'lucide-react'
import wsService from '../services/websocket'
import { callsApi } from '../services/api'

type CallType = 'voice' | 'video'

export function CallModal({ open, type, peerName, peerAvatar, isIncoming, callId, peerId, onAccept, onReject, onEnd }: {
  open: boolean,
  type: CallType,
  peerName: string,
  peerAvatar?: string | null,
  isIncoming?: boolean,
  callId?: number,
  peerId?: number,
  onAccept?: ()=>void,
  onReject?: ()=>void,
  onEnd: ()=>void
}) {
  const [micOn, setMicOn]=useState(true)
  const [camOn, setCamOn]=useState(type==='video')
  const [elapsed, setElapsed]=useState(0)
  const [permissionError, setPermissionError]=useState<string|null>(null)
  const [connected, setConnected]=useState(false)
  const [statusText, setStatusText]=useState(isIncoming ? `Incoming ${type} call...` : 'Calling...')
  const localRef=useRef<HTMLVideoElement>(null)
  const remoteRef=useRef<HTMLVideoElement>(null)
  const remoteAudioRef=useRef<HTMLAudioElement>(null)
  const pcRef=useRef<RTCPeerConnection|null>(null)
  const streamRef=useRef<MediaStream|null>(null)
  const pendingOfferRef=useRef<any>(null)
  const setupDoneRef=useRef(false)
  // CRITICAL: Use ref to track caller/callee role - NEVER re-run setup when isIncoming prop changes
  const isCallerRef=useRef(!isIncoming)

  const iceServersRef = useRef<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }])

  // timer - only runs after accepted (connected or not incoming)
  useEffect(()=>{
    if (!open || connected || isIncoming) return
    const t=setInterval(()=> setElapsed(e=>e+1), 1000)
    return ()=> clearInterval(t)
  }, [open, connected, isIncoming])

  // setup media + peer connection - ONLY runs once when open becomes true
  useEffect(()=>{
    if (!open || setupDoneRef.current) return
    setupDoneRef.current = true
    let cancelled=false

    const setup = async ()=>{
      try {
        // Fetch TURN credentials
        try {
          const turnRes = await callsApi.turn()
          if (turnRes?.success && turnRes.data) {
            iceServersRef.current = [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: turnRes.data.urls, username: turnRes.data.username, credential: turnRes.data.credential }
            ]
          }
        } catch {}

        const wantVideo = type==='video'
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: wantVideo })
        if (cancelled) { stream.getTracks().forEach(t=>t.stop()); return }
        streamRef.current = stream
        if (localRef.current) localRef.current.srcObject = stream
        setPermissionError(null)

        const pc = new RTCPeerConnection({ iceServers: iceServersRef.current })
        pcRef.current = pc

        stream.getTracks().forEach(track=> pc.addTrack(track, stream))

        pc.ontrack = (e)=>{
          if (remoteRef.current) remoteRef.current.srcObject = e.streams[0]
          if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0]
          setConnected(true)
          setStatusText('Connected')
        }

        pc.onicecandidate = (e)=>{
          if (e.candidate && peerId && callId) {
            wsService.send({ type: 'call.ice_candidate', payload: { callId, candidate: JSON.parse(JSON.stringify(e.candidate)), to_user_id: peerId }})
          }
        }

        pc.onconnectionstatechange = ()=>{
          const state = pc.connectionState
          if (state==='connected') setConnected(true)
          if (state==='failed' || state==='disconnected') {
            setStatusText('Connection lost')
            setConnected(false)
          }
          if (state==='closed') onEnd()
        }

        // Handle pending offer (callee received offer before media was ready)
        if (isCallerRef.current===false && pendingOfferRef.current) {
          const offer = pendingOfferRef.current
          await pc.setRemoteDescription(new RTCSessionDescription(offer))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          if (peerId && callId) {
            wsService.send({ type: 'call.answer', payload: { callId, sdp: JSON.parse(JSON.stringify(answer)), to_user_id: peerId }})
          }
          pendingOfferRef.current = null
          setStatusText('Connected')
        } else if (isCallerRef.current) {
          setStatusText('Ringing...')
        }

      } catch (err:any) {
        setPermissionError(err.message?.includes('Permission') ? 'Camera/Microphone permission is required for calls.' : err.message || 'Could not access camera/microphone')
      }
    }
    setup()

    // WS listeners
    const onOffer = async (payload:any)=>{
      if (payload.callId && callId && payload.callId !== callId) return
      const sdp = payload.sdp || payload
      if (!pcRef.current) {
        pendingOfferRef.current = sdp
        return
      }
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp))
        const answer = await pcRef.current.createAnswer()
        await pcRef.current.setLocalDescription(answer)
        if (peerId && callId) {
          wsService.send({ type: 'call.answer', payload: { callId, sdp: JSON.parse(JSON.stringify(answer)), to_user_id: peerId }})
        }
        setStatusText('Connected')
      } catch (e){ console.error('offer handle', e) }
    }

    const onAnswer = async (payload:any)=>{
      if (payload.callId && callId && payload.callId !== callId) return
      const sdp = payload.sdp || payload
      try {
        if (pcRef.current && pcRef.current.signalingState !== 'stable') {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp))
          setConnected(true)
          setStatusText('Connected')
        }
      } catch (e){ console.error('answer', e) }
    }

    const onIce = async (payload:any)=>{
      if (payload.callId && callId && payload.callId !== callId) return
      const candidate = payload.candidate
      try {
        if (candidate && pcRef.current && pcRef.current.signalingState !== 'closed') {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate))
        }
      } catch {}
    }

    const onAccepted = async ()=>{
      // Caller side: peer accepted, create offer now
      if (isCallerRef.current && pcRef.current && peerId && callId) {
        try {
          const offer = await pcRef.current.createOffer()
          await pcRef.current.setLocalDescription(offer)
            wsService.send({ type: 'call.offer', payload: { callId, sdp: JSON.parse(JSON.stringify(offer)), to_user_id: peerId }})
          setStatusText('Connecting...')
        } catch (e){ console.error('create offer', e)}
      }
    }

    wsService.on('call.offer', onOffer)
    wsService.on('call.answer', onAnswer)
    wsService.on('call.ice_candidate', onIce)
    wsService.on('call.accepted', onAccepted)

    return ()=>{
      cancelled=true
      setupDoneRef.current = false
      wsService.off('call.offer', onOffer)
      wsService.off('call.answer', onAnswer)
      wsService.off('call.ice_candidate', onIce)
      wsService.off('call.accepted', onAccepted)
      pcRef.current?.close()
      pcRef.current=null
      streamRef.current?.getTracks().forEach(t=>t.stop())
      streamRef.current=null
      pendingOfferRef.current=null
      setConnected(false)
      setElapsed(0)
    }
  }, [open, type, callId, peerId]) // NOT isIncoming - uses isCallerRef instead

  // toggle mic/cam
  useEffect(()=>{
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(t=> t.enabled = micOn)
      streamRef.current.getVideoTracks().forEach(t=> t.enabled = camOn)
    }
  }, [micOn, camOn])

  if (!open) return null
  const format = (s:number)=> `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-gray-900 via-slate-900 to-black flex flex-col items-center justify-center text-white p-4">
      {/* Hidden audio element for voice-only calls */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* remote video full screen */}
      <video ref={remoteRef} autoPlay playsInline className={`absolute inset-0 w-full h-full object-cover ${type==='video' && connected ? 'block' : 'hidden'}`} />
      <div className="absolute inset-0 bg-black/40 pointer-events-none"/>

      {/* local preview */}
      <video ref={localRef} autoPlay muted playsInline className={`absolute ${type==='video' ? 'top-4 right-4 w-32 h-24' : 'hidden'} rounded-xl bg-black object-cover border border-white/10 shadow-lg z-10`} />

      <div className="relative z-10 flex flex-col items-center gap-4">
        {!connected && (
          <>
            <div className="w-28 h-28 rounded-full overflow-hidden bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-3xl font-bold shadow-xl">
              {peerAvatar ? <img src={peerAvatar} alt="" className="w-full h-full object-cover"/> : peerName[0]?.toUpperCase()}
            </div>
            <h2 className="text-2xl font-semibold">{peerName}</h2>
            <p className="text-sm text-white/70">{statusText} {connected ? '' : !isCallerRef.current ? '' : `• ${format(elapsed)}`}</p>
          </>
        )}
        {connected && type==='voice' && (
          <>
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-xl font-bold">{peerName[0]}</div>
            </div>
            <p className="text-sm text-white/60">On call • {format(elapsed)}</p>
          </>
        )}
        {permissionError && <p className="text-xs bg-red-500/20 border border-red-500/30 px-3 py-1.5 rounded-full max-w-sm text-center">{permissionError}</p>}
        {!permissionError && type==='video' && !connected && <p className="text-xs text-white/50">Waiting for answer...</p>}
      </div>

      <div className="relative z-10 mt-10 flex items-center gap-4">
        <button onClick={()=> setMicOn(!micOn)} className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors active:scale-95 ${micOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500 hover:bg-red-600'}`}>{micOn ? <Mic className="w-6 h-6"/> : <MicOff className="w-6 h-6"/>}</button>
        {type==='video' && <button onClick={()=> setCamOn(!camOn)} className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors active:scale-95 ${camOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500 hover:bg-red-600'}`}>{camOn ? <Video className="w-6 h-6"/> : <VideoOff className="w-6 h-6"/>}</button>}
        {isCallerRef.current===false ? (
          <>
            <button onClick={onReject} className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-lg transition-colors active:scale-95"><PhoneOff className="w-7 h-7"/></button>
            <button onClick={onAccept} className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center shadow-lg transition-colors active:scale-95"><Phone className="w-7 h-7"/></button>
          </>
        ) : (
          <button onClick={onEnd} className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-lg transition-colors active:scale-95"><PhoneOff className="w-7 h-7"/></button>
        )}
      </div>

      <p className="relative z-10 absolute bottom-6 pb-[max(24px,env(safe-area-inset-bottom))] text-xs text-white/40 text-center px-4">WebRTC peer-to-peer • STUN stun.l.google.com</p>
    </div>
  )
}
