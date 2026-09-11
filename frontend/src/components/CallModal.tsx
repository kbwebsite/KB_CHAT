import { useEffect, useRef, useState } from 'react'
import { PhoneOff, Mic, MicOff, Video, VideoOff, Phone } from 'lucide-react'
import wsService from '../services/websocket'
import { callsApi } from '../services/api'

type CallType = 'voice' | 'video'

export function CallModal({ open, type, peerName, peerAvatar, isIncoming, callId, peerId, onAccept, onReject, onEnd, onMissed }: {
  open: boolean,
  type: CallType,
  peerName: string,
  peerAvatar?: string | null,
  isIncoming?: boolean,
  callId?: number,
  peerId?: number,
  onAccept?: ()=>void,
  onReject?: ()=>void,
  onEnd: ()=>void,
  onMissed?: ()=>void
}) {
  const [micOn, setMicOn]=useState(true)
  const [camOn, setCamOn]=useState(type==='video')
  const [videoLive, setVideoLive]=useState(type==='video')
  const [elapsed, setElapsed]=useState(0)
  const [permissionError, setPermissionError]=useState<string|null>(null)
  const [notice, setNotice]=useState<string|null>(null)

  const describeMediaError = (err: any): string => {
    const name = err?.name || ''
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Camera/microphone blocked. Allow access in the browser site settings (phone: App info → Permissions → Camera/Microphone) and rejoin.'
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return 'No usable camera found on this device.'
    }
    if (name === 'NotReadableError') {
      return 'Camera/microphone is busy in another app. Close it and rejoin.'
    }
    return err?.message || 'Could not access camera/microphone.'
  }
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
  // Track whether incoming call has been accepted (callee accepted => now show hangup, not accept/reject)
  const [hasAccepted, setHasAccepted]=useState(!isIncoming)

  // Sync hasAccepted when parent marks incoming as false (accepted)
  useEffect(()=>{ if (!isIncoming) setHasAccepted(true) }, [isIncoming])

  const iceServersRef = useRef<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }])
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval>|null>(null)
  const ringCtlRef = useRef<{ stop: () => void } | null>(null)
  const connectedRef = useRef(false)
  const onMissedRef = useRef(onMissed)
  onMissedRef.current = onMissed

  // Dual-tone (440+480Hz) ring, generated — no audio assets needed.
  // Callee hears full-volume 2s-on/4s-off rings; caller hears softer ringback.
  const startRinging = (pattern: 'ring' | 'ringback') => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return null
      const ctx = new Ctx()
      const master = ctx.createGain()
      master.gain.value = pattern === 'ring' ? 0.4 : 0.18
      master.connect(ctx.destination)
      let stopped = false
      let timer: ReturnType<typeof setTimeout> | null = null
      const burst = () => {
        if (stopped) return
        try {
          const t0 = ctx.currentTime + 0.02
          ;[440, 480].forEach(f => {
            const o = ctx.createOscillator()
            const g = ctx.createGain()
            o.type = 'sine'
            o.frequency.value = f
            g.gain.setValueAtTime(0, t0)
            g.gain.linearRampToValueAtTime(1, t0 + 0.05)
            g.gain.setValueAtTime(1, t0 + 1.8)
            g.gain.linearRampToValueAtTime(0, t0 + 2.0)
            o.connect(g); g.connect(master)
            o.start(t0); o.stop(t0 + 2.1)
          })
        } catch {}
        timer = setTimeout(burst, 4000)
      }
      // Incoming rings arrive without a user gesture: resume on first tap.
      const unlock = () => { ctx.resume().catch(() => {}) }
      window.addEventListener('pointerdown', unlock)
      ctx.resume().catch(() => {})
      burst()
      return {
        stop: () => {
          stopped = true
          if (timer) clearTimeout(timer)
          window.removeEventListener('pointerdown', unlock)
          ctx.close().catch(() => {})
        },
      }
    } catch { return null }
  }

  // Ring management: callee rings until accept, caller hears ringback until
  // connect; everything stops the moment media is up or the modal closes.
  useEffect(() => {
    if (!open) {
      ringCtlRef.current?.stop()
      ringCtlRef.current = null
      return
    }
    const wantRing = !isCallerRef.current && !hasAccepted
    const wantRingback = isCallerRef.current && !connected
    if (!wantRing && !wantRingback) {
      ringCtlRef.current?.stop()
      ringCtlRef.current = null
      return
    }
    if (ringCtlRef.current) return
    const ctl = startRinging(wantRing ? 'ring' : 'ringback')
    ringCtlRef.current = ctl
    return () => {
      ctl?.stop()
      if (ringCtlRef.current === ctl) ringCtlRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasAccepted, connected])

  // Unanswered ringing becomes a missed call after 45s (backend posts the
  // chat note + push on the 'missed' status).
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      if (!connectedRef.current) onMissedRef.current?.()
    }, 45000)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => { connectedRef.current = connected }, [connected])

  // timer - runs after accepted (caller immediately, callee after accept)
  useEffect(()=>{
    if (!open || !hasAccepted) return
    const t=setInterval(()=> setElapsed(e=>e+1), 1000)
    return ()=> clearInterval(t)
  }, [open, hasAccepted])

  // setup media + peer connection - ONLY runs once when open becomes true
  useEffect(()=>{
    if (!open || setupDoneRef.current) return
    setupDoneRef.current = true
    let cancelled=false

    const setup = async ()=>{
      try {
        // Fetch TURN credentials from server (Cloudflare or static)
        try {
          const turnRes = await callsApi.turn()
          if (turnRes?.success && turnRes.data && Array.isArray(turnRes.data)) {
            iceServersRef.current = turnRes.data
          }
        } catch {}

        const wantVideo = type==='video'
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: wantVideo })
        } catch (err: any) {
          // Video calls survive a missing/busy camera by downgrading to
          // audio instead of dying. Audio failure is still fatal.
          if (wantVideo && err?.name !== 'NotAllowedError' && err?.name !== 'SecurityError') {
            try {
              stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
            } catch (err2: any) {
              setPermissionError(describeMediaError(err2))
              return
            }
            setCamOn(false)
            setVideoLive(false)
            setNotice('Camera unavailable — continuing with audio only.')
          } else {
            setPermissionError(describeMediaError(err))
            return
          }
        }
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

        // ICE credential refresh: fetch new TURN credentials every 5 min and apply via setConfiguration
        refreshIntervalRef.current = setInterval(async () => {
          if (pc.connectionState !== 'connected') return
          try {
            const turnRes = await callsApi.turn()
            if (turnRes?.success && turnRes.data && Array.isArray(turnRes.data)) {
              pc.setConfiguration({ iceServers: turnRes.data })
            }
          } catch {}
        }, 300000)

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
        setPermissionError(describeMediaError(err))
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
      if (refreshIntervalRef.current) { clearInterval(refreshIntervalRef.current); refreshIntervalRef.current = null }
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
      <video ref={localRef} autoPlay muted playsInline className={`absolute ${type==='video' && videoLive ? 'top-4 right-4 w-32 h-24 call-local-video' : 'hidden'} bg-black object-cover z-10`} />

      <div className="relative z-10 flex flex-col items-center gap-4">
        {!connected && (
          <>
            <div className="call-avatar-ring w-28 h-28 rounded-full overflow-hidden bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-3xl font-bold shadow-xl">
              {peerAvatar ? <img src={peerAvatar} alt="" className="w-full h-full object-cover"/> : peerName[0]?.toUpperCase()}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">{peerName}</h2>
            <p className="text-sm text-white/60">{statusText} {connected ? '' : !isCallerRef.current ? '' : `• ${format(elapsed)}`}</p>
          </>
        )}
        {connected && type==='voice' && (
          <>
            <div className="call-connected-avatar w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-xl font-bold shadow-lg">{peerName[0]}</div>
            </div>
            <p className="text-sm text-white/60 call-status-glow">On call • {format(elapsed)}</p>
          </>
        )}
        {permissionError && <p className="text-xs bg-red-500/15 border border-red-500/25 px-3 py-1.5 rounded-full max-w-sm text-center">{permissionError}</p>}
        {!permissionError && notice && <p className="text-xs bg-amber-500/15 border border-amber-500/25 px-3 py-1.5 rounded-full max-w-sm text-center">{notice}</p>}
        {!permissionError && type==='video' && !connected && <p className="text-xs text-white/40">Waiting for answer...</p>}
      </div>

      <div className="relative z-10 mt-10 flex items-center gap-4">
        <button onClick={()=> setMicOn(!micOn)} className={`call-btn-mic w-14 h-14 rounded-full flex items-center justify-center ${micOn ? '' : 'muted'}`}>{micOn ? <Mic className="w-6 h-6"/> : <MicOff className="w-6 h-6"/>}</button>
        {type==='video' && videoLive && <button onClick={()=> setCamOn(!camOn)} className={`call-btn-mic w-14 h-14 rounded-full flex items-center justify-center ${camOn ? '' : 'muted'}`}>{camOn ? <Video className="w-6 h-6"/> : <VideoOff className="w-6 h-6"/>}</button>}
        {hasAccepted ? (
          <button onClick={onEnd} className="call-btn-end w-16 h-16 rounded-full flex items-center justify-center"><PhoneOff className="w-7 h-7"/></button>
        ) : (
          <>
            <button onClick={onReject} className="call-btn-end w-16 h-16 rounded-full flex items-center justify-center"><PhoneOff className="w-7 h-7"/></button>
            <button onClick={()=>{ setHasAccepted(true); onAccept?.() }} className="call-btn-accept w-16 h-16 rounded-full flex items-center justify-center"><Phone className="w-7 h-7"/></button>
          </>
        )}
      </div>

      <p className="relative z-10 absolute bottom-6 pb-[max(24px,env(safe-area-inset-bottom))] text-xs text-white/40 text-center px-4">WebRTC peer-to-peer • STUN stun.l.google.com</p>
    </div>
  )
}
