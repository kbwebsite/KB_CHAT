import { useEffect, useRef, useState } from 'react'
import { PhoneOff, Mic, MicOff, Video, VideoOff, Phone } from 'lucide-react'
import wsService from '../services/websocket'

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
  const pcRef=useRef<RTCPeerConnection|null>(null)
  const streamRef=useRef<MediaStream|null>(null)
  const pendingOfferRef=useRef<any>(null)

  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]

  // timer
  useEffect(()=>{
    if (!open || isIncoming) return
    const t=setInterval(()=> setElapsed(e=>e+1), 1000)
    return ()=> clearInterval(t)
  }, [open, isIncoming])

  // setup media + peer connection
  useEffect(()=>{
    if (!open) return
    let cancelled=false
    const setup = async ()=>{
      try {
        const wantVideo = type==='video'
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: wantVideo })
        if (cancelled) { stream.getTracks().forEach(t=>t.stop()); return }
        streamRef.current = stream
        if (localRef.current) localRef.current.srcObject = stream
        setPermissionError(null)

        // create peer connection
        const pc = new RTCPeerConnection({ iceServers })
        pcRef.current = pc

        // add local tracks
        stream.getTracks().forEach(track=> pc.addTrack(track, stream))

        pc.ontrack = (e)=>{
          if (remoteRef.current) remoteRef.current.srcObject = e.streams[0]
          setConnected(true)
          setStatusText(type==='video' ? 'Connected' : 'Connected')
        }

        pc.onicecandidate = (e)=>{
          if (e.candidate && peerId && callId) {
            wsService.send({ type: 'call.ice_candidate', payload: { callId, candidate: e.candidate, to_user_id: peerId }})
          }
        }

        pc.onconnectionstatechange = ()=>{
          if (pc.connectionState==='connected') setConnected(true)
          if (pc.connectionState==='failed' || pc.connectionState==='disconnected') setStatusText('Connection failed')
        }

        // If caller and not incoming, wait for accepted then create offer
        // If incoming and we already have pending offer, handle it after we get media
        if (isIncoming && pendingOfferRef.current) {
          const offer = pendingOfferRef.current
          await pc.setRemoteDescription(new RTCSessionDescription(offer))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          if (peerId && callId) {
            wsService.send({ type: 'call.answer', payload: { callId, sdp: answer, to_user_id: peerId }})
          }
          pendingOfferRef.current = null
          setStatusText('Connected')
        } else if (!isIncoming) {
          // caller: will create offer after peer accepts, but also if peer already accepted quickly, we create now
          // we wait for accepted signal; if already accepted (status), create offer
          // For now, don't create offer immediately - wait for 'call.accepted' event
          setStatusText('Ringing...')
        }

      } catch (err:any) {
        setPermissionError(err.message || 'Mic/Camera permission denied')
      }
    }
    setup()

    // WS listeners for this call
    const onOffer = async (payload:any)=>{
      if (payload.callId !== callId && payload.callId !== undefined && callId !== undefined) {
        // allow if callId matches or if payload has no callId but we have one
        // strict check: if callId provided and mismatches, ignore
        if (payload.callId && callId && payload.callId !== callId) return
      }
      const sdp = payload.sdp || payload
      if (!pcRef.current) {
        // store pending until media ready
        pendingOfferRef.current = sdp
        return
      }
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp))
        const answer = await pcRef.current.createAnswer()
        await pcRef.current.setLocalDescription(answer)
        if (peerId && callId) {
          wsService.send({ type: 'call.answer', payload: { callId, sdp: answer, to_user_id: peerId }})
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
        if (candidate && pcRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate))
        }
      } catch {}
    }

    const onAccepted = async ()=>{
      // caller side: peer accepted, now create offer
      if (!isIncoming && pcRef.current && peerId && callId) {
        try {
          const offer = await pcRef.current.createOffer()
          await pcRef.current.setLocalDescription(offer)
          wsService.send({ type: 'call.offer', payload: { callId, sdp: offer, to_user_id: peerId }})
          setStatusText('Connecting...')
        } catch (e){ console.error('create offer', e)}
      } else if (isIncoming) {
        // callee accepted already handled via parent, but ensure status
        setStatusText('Connecting...')
      }
    }

    wsService.on('call.offer', onOffer)
    wsService.on('call.answer', onAnswer)
    wsService.on('call.ice_candidate', onIce)
    wsService.on('call.accepted', onAccepted)

    return ()=>{
      cancelled=true
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
  }, [open, type, isIncoming, callId, peerId])

  // toggle mic/cam
  useEffect(()=>{
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(t=> t.enabled = micOn)
      streamRef.current.getVideoTracks().forEach(t=> t.enabled = camOn)
    }
  }, [micOn, camOn])

  // when isIncoming becomes false (accepted), status
  useEffect(()=>{
    if (open && !isIncoming) setStatusText('Ringing...')
  }, [isIncoming, open])

  if (!open) return null
  const format = (s:number)=> `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-gray-900 via-slate-900 to-black flex flex-col items-center justify-center text-white p-4">
      {/* remote video full screen */}
      <video ref={remoteRef} autoPlay playsInline className={`absolute inset-0 w-full h-full object-cover ${type==='video' && connected ? 'block' : 'hidden'}`} />
      {/* overlay gradient */}
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
            <p className="text-sm text-white/70">{statusText} {connected ? '' : !isIncoming ? `• ${format(elapsed)}` : ''}</p>
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
        <button onClick={()=> setMicOn(!micOn)} className={`w-14 h-14 rounded-full flex items-center justify-center ${micOn ? 'bg-white/10' : 'bg-red-500'}`}>{micOn ? <Mic className="w-6 h-6"/> : <MicOff className="w-6 h-6"/>}</button>
        {type==='video' && <button onClick={()=> setCamOn(!camOn)} className={`w-14 h-14 rounded-full flex items-center justify-center ${camOn ? 'bg-white/10' : 'bg-red-500'}`}>{camOn ? <Video className="w-6 h-6"/> : <VideoOff className="w-6 h-6"/>}</button>}
        {isIncoming ? (
          <>
            <button onClick={onReject} className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg"><PhoneOff className="w-7 h-7"/></button>
            <button onClick={onAccept} className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg"><Phone className="w-7 h-7"/></button>
          </>
        ) : (
          <button onClick={onEnd} className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg"><PhoneOff className="w-7 h-7"/></button>
        )}
      </div>

      <p className="relative z-10 absolute bottom-6 text-xs text-white/40 text-center px-4">WebRTC peer-to-peer • Signaling via WebSocket • STUN stun.l.google.com</p>
    </div>
  )
}
