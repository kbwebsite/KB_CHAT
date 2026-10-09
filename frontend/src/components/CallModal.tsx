import { useEffect, useRef, useState } from 'react'
import { PhoneOff, Mic, MicOff, Video, VideoOff, Phone, ScreenShare, ScreenShareOff } from 'lucide-react'
import wsService from '../services/websocket'
import { callsApi, msgApi, uploadApi } from '../services/api'
import { useAuthStore } from '../store/auth'

type CallType = 'voice' | 'video'

export function CallModal({ open, type, peerName, peerAvatar, isIncoming, callId, peerId, conversationId, onAccept, onReject, onEnd, onMissed }: {
  open: boolean,
  type: CallType,
  peerName: string,
  peerAvatar?: string | null,
  isIncoming?: boolean,
  callId?: number,
  peerId?: number,
  conversationId?: number | null,
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
  const [sharing, setSharing]=useState(false)
  const [recording, setRecording]=useState(false)
  const [recElapsed, setRecElapsed]=useState(0)
  const [recBusy, setRecBusy]=useState(false)
  const meName = useAuthStore(s=>s.user?.display_name || s.user?.username || 'Someone')
  const mountedRef=useRef(true)
  const recCtxRef=useRef<AudioContext|null>(null)
  const recStreamRef=useRef<MediaStream|null>(null)
  const recorderRef=useRef<MediaRecorder|null>(null)
  const chunksRef=useRef<Blob[]>([])
  const canvasRef=useRef<HTMLCanvasElement|null>(null)
  const rafRef=useRef<number>(0)
  const recTimerRef=useRef<ReturnType<typeof setInterval>|null>(null)
  const recMimeRef=useRef('')
  useEffect(()=>{ mountedRef.current = true; return ()=>{ mountedRef.current = false } }, [])
  const cameraTrackRef=useRef<MediaStreamTrack|null>(null)
  const screenStreamRef=useRef<MediaStream|null>(null)
  const localRef=useRef<HTMLVideoElement>(null)
  const remoteRef=useRef<HTMLVideoElement>(null)
  const remoteAudioRef=useRef<HTMLAudioElement>(null)
  const pcRef=useRef<RTCPeerConnection|null>(null)
  const streamRef=useRef<MediaStream|null>(null)
  const pendingOfferRef=useRef<any>(null)
  // Remote ICE candidates that arrive before we have a remote description
  // cannot be added yet — buffer them and flush after setRemoteDescription.
  // (Dropped candidates = no connection; video setup is slower than audio,
  // which is why voice worked while video systematically failed.)
  const pendingIceRef=useRef<any[]>([])
  const flushIce = async () => {
    const pc = pcRef.current
    if (!pc || !pc.remoteDescription) return
    const queued = pendingIceRef.current.splice(0, 50)
    for (const c of queued) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
    }
  }
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
          const stream = e.streams[0]
          if (remoteRef.current) {
            remoteRef.current.srcObject = stream
            try { (remoteRef.current.play?.() as any)?.catch?.(()=>{}) } catch {}
          }
          // Voice-only calls have no visible video element: play via audio.
          // (Video calls already hear the peer through the video element;
          // attaching both would double the audio.)
          if (type === 'voice' && remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream
            try { (remoteAudioRef.current.play?.() as any)?.catch?.(()=>{}) } catch {}
          }
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
          await flushIce()
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
        await flushIce()
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
          await flushIce()
          setConnected(true)
          setStatusText('Connected')
        }
      } catch (e){ console.error('answer', e) }
    }

    const onIce = async (payload:any)=>{
      if (payload.callId && callId && payload.callId !== callId) return
      const candidate = payload.candidate
      if (!candidate) return
      try {
        const pc = pcRef.current
        if (!pc || pc.signalingState === 'closed') return
        if (!pc.remoteDescription) {
          // Too early: queue for flushIce() after the remote description lands.
          if (pendingIceRef.current.length < 50) pendingIceRef.current.push(candidate)
          return
        }
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
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
      try { screenStreamRef.current?.getTracks().forEach(t=>t.stop()) } catch {}
      screenStreamRef.current=null
      cameraTrackRef.current=null
      setSharing(false)
      try {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          const r = recorderRef.current
          recorderRef.current = null
          r.stop() // onstop finalizes: uploads + posts to chat even as we unmount
        } else {
          stopRecTracks()
        }
      } catch {}
      if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
      setRecording(false)
      pcRef.current?.close()
      pcRef.current=null
      streamRef.current?.getTracks().forEach(t=>t.stop())
      streamRef.current=null
      pendingOfferRef.current=null
      pendingIceRef.current=[]
      setConnected(false)
      setElapsed(0)
    }
  }, [open, type, callId, peerId]) // NOT isIncoming - uses isCallerRef instead

  const stopShare = async (silent = false) => {
    try { screenStreamRef.current?.getTracks().forEach(t=>t.stop()) } catch {}
    screenStreamRef.current = null
    const pc = pcRef.current
    const cam = cameraTrackRef.current
    try {
      if (pc && cam) {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video')
        if (sender) await sender.replaceTrack(cam)
      }
    } catch {}
    cameraTrackRef.current = null
    if (streamRef.current && localRef.current) {
      try { localRef.current.srcObject = streamRef.current } catch {}
    }
    setSharing(false)
    if (!silent) setNotice(null)
  }

  const startShare = async () => {
    const pc = pcRef.current
    if (!pc || !connected) { setNotice('Connect first, then share your screen.'); return }
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video')
    if (!sender) { setNotice('Screen share needs a video call with camera track.'); return }
    if (!('getDisplayMedia' in (navigator.mediaDevices || {} as any))) {
      setNotice('Screen share is not supported in this browser.')
      return
    }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const track = screen.getVideoTracks()[0]
      if (!track) { screen.getTracks().forEach(t=>t.stop()); return }
      if (!cameraTrackRef.current) cameraTrackRef.current = sender.track
      screenStreamRef.current = screen
      await sender.replaceTrack(track)
      if (localRef.current) {
        try { localRef.current.srcObject = screen } catch {}
      }
      setSharing(true)
      setNotice('You are sharing your screen — peers see it live.')
      track.onended = () => { void stopShare() }
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') setNotice('Screen share cancelled.')
      else setNotice(err?.message || 'Could not start screen share.')
    }
  }

  // toggle mic/cam
  useEffect(()=>{
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(t=> t.enabled = micOn)
      streamRef.current.getVideoTracks().forEach(t=> t.enabled = camOn)
    }
  }, [micOn, camOn])

  const pickRecMime = (wantVideo: boolean): string => {
    const cands = wantVideo
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    try {
      for (const m of cands) {
        if (typeof MediaRecorder !== 'undefined' && (MediaRecorder as any).isTypeSupported?.(m)) return m
      }
    } catch {}
    return ''
  }

  const stopRecTracks = () => {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
    cancelAnimationFrame(rafRef.current)
    try { recCtxRef.current?.close() } catch {}
    recCtxRef.current = null
    recStreamRef.current?.getTracks().forEach((t) => {
      // Local/remote call tracks are owned by the call — never stop those.
      if (t.readyState === 'live' && (t as any).__recOwn) {
        try { t.stop() } catch {}
      }
    })
    recStreamRef.current = null
    canvasRef.current = null
  }

  const markOwn = (s: MediaStream) => {
    s.getTracks().forEach((t) => { (t as any).__recOwn = true })
    return s
  }

  const startRecording = async () => {
    if (!connected || recording || recBusy || conversationId == null) return
    const local = streamRef.current
    const remote = remoteRef.current?.srcObject as MediaStream | null
    if (!local) { setNotice('No audio to record yet.'); return }
    if (typeof MediaRecorder === 'undefined') { setNotice('Recording is not supported in this browser.'); return }
    setRecBusy(true)
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctx) throw new Error('Audio capture unavailable')
      const ctx = new Ctx()
      try { await ctx.resume() } catch {}
      recCtxRef.current = ctx
      const dest = ctx.createMediaStreamDestination()
      for (const s of [local, remote]) {
        const tracks = (s?.getAudioTracks() ?? []).filter((t) => t.readyState === 'live')
        for (const tr of tracks) {
          try { ctx.createMediaStreamSource(new MediaStream([tr])).connect(dest) } catch {}
        }
      }
      const remoteVideo = remote?.getVideoTracks().find((t) => t.readyState === 'live') ?? null
      const localVideo = local.getVideoTracks().find((t) => t.readyState === 'live' && t.enabled) ?? null
      const wantVideo = type === 'video' && !!remoteVideo
      let recStream: MediaStream
      if (wantVideo && remoteVideo) {
        const canvas = document.createElement('canvas')
        canvas.width = 640
        canvas.height = 480
        canvasRef.current = canvas
        const g = canvas.getContext('2d')!
        const rv = document.createElement('video')
        rv.muted = true
        rv.playsInline = true
        rv.srcObject = new MediaStream([remoteVideo])
        await rv.play().catch(() => {})
        const lv = document.createElement('video')
        let lvReady = false
        if (localVideo) {
          lv.muted = true
          lv.playsInline = true
          lv.srcObject = new MediaStream([localVideo])
          await lv.play().then(() => { lvReady = true }).catch(() => {})
        }
        const draw = () => {
          try {
            g.fillStyle = '#000'
            g.fillRect(0, 0, 640, 480)
            if (rv.videoWidth > 0) g.drawImage(rv, 0, 0, 640, 480)
            if (lvReady && lv.videoWidth > 0) {
              const w = 160
              const h = Math.max(90, Math.round((160 * lv.videoHeight) / Math.max(1, lv.videoWidth)))
              g.drawImage(lv, 640 - w - 12, 480 - h - 12, w, h)
            }
          } catch {}
          rafRef.current = requestAnimationFrame(draw)
        }
        draw()
        const mixed = markOwn(canvas.captureStream(30))
        dest.stream.getAudioTracks().forEach((t) => mixed.addTrack(t))
        recStream = mixed
      } else {
        recStream = dest.stream
      }
      recStreamRef.current = recStream
      const mime = pickRecMime(wantVideo)
      recMimeRef.current = mime
      const rec = mime ? new MediaRecorder(recStream, { mimeType: mime }) : new MediaRecorder(recStream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => { void finalizeRecording() }
      recorderRef.current = rec
      rec.start(1000)
      setRecElapsed(0)
      setRecording(true)
      recTimerRef.current = setInterval(() => setRecElapsed((e) => e + 1), 1000)
      // Consent: the peer sees this in chat the moment recording starts.
      try {
        await msgApi.send(conversationId, {
          content: `📹 ${meName} started recording this call`,
          message_type: 'text',
        })
      } catch {}
      setNotice('Recording — the other person was notified in chat.')
    } catch (err: any) {
      setNotice(err?.message || 'Could not start recording.')
      stopRecTracks()
    } finally {
      if (mountedRef.current) setRecBusy(false)
    }
  }

  const finalizeRecording = async () => {
    const chunks = chunksRef.current.splice(0)
    const wasVideo = recMimeRef.current.startsWith('video') || recMimeRef.current === 'video/mp4'
    const ext = recMimeRef.current.includes('mp4') ? 'mp4' : 'webm'
    const mime = recMimeRef.current || (wasVideo ? 'video/webm' : 'audio/webm')
    const secs = recElapsed
    stopRecTracks()
    if (mountedRef.current) {
      setRecording(false)
      setRecBusy(true)
    }
    try {
      if (chunks.length === 0) throw new Error('Empty recording')
      const blob = new Blob(chunks, { type: mime })
      const mm = Math.floor(secs / 60)
      const ss = String(secs % 60).padStart(2, '0')
      const file = new File([blob], `call_recording_${Date.now()}.${ext}`, { type: mime })
      const up: any = await uploadApi.upload(file)
      const att = up?.data
      if (!att?.id) throw new Error('Upload failed')
      if (conversationId != null) {
        await msgApi.send(conversationId, {
          content: `📹 Call recording • ${mm}:${ss}`,
          attachment_ids: [att.id],
          message_type: wasVideo ? 'file' : 'voice',
          ...(wasVideo ? {} : { voice_duration: Math.min(secs, 3600) }),
        })
      }
      if (mountedRef.current) setNotice('Recording saved to chat.')
    } catch {
      // Never lose the take: fall back to a local download.
      try {
        const blob = new Blob(chunks, { type: mime })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `call_recording_${Date.now()}.${ext}`
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 10000)
        if (mountedRef.current) setNotice('Upload failed — recording downloaded instead.')
      } catch {
        if (mountedRef.current) setNotice('Recording failed.')
      }
    } finally {
      if (mountedRef.current) setRecBusy(false)
    }
  }

  const stopRecording = () => {
    const rec = recorderRef.current
    recorderRef.current = null
    if (rec && rec.state !== 'inactive') {
      try { rec.stop() } catch { void finalizeRecording() }
    }
  }

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
            <div className="call-avatar-ring w-28 h-28 rounded-full overflow-hidden kryzen-accent-gradient flex items-center justify-center text-3xl font-bold shadow-xl">
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
        {recording && (
          <p className="text-xs bg-red-500/20 border border-red-500/40 px-3 py-1.5 rounded-full flex items-center gap-2" aria-live="polite">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            REC {format(recElapsed)}
          </p>
        )}
      </div>

      <div className="relative z-10 mt-10 flex items-center gap-4">
        <button onClick={()=> setMicOn(!micOn)} className={`call-btn-mic w-14 h-14 rounded-full flex items-center justify-center ${micOn ? '' : 'muted'}`}>{micOn ? <Mic className="w-6 h-6"/> : <MicOff className="w-6 h-6"/>}</button>
        {type==='video' && videoLive && <button onClick={()=> setCamOn(!camOn)} className={`call-btn-mic w-14 h-14 rounded-full flex items-center justify-center ${camOn ? '' : 'muted'}`}>{camOn ? <Video className="w-6 h-6"/> : <VideoOff className="w-6 h-6"/>}</button>}
        {type==='video' && connected && !permissionError && (
          <button
            onClick={()=> { void (sharing ? stopShare() : startShare()) }}
            title={sharing ? 'Stop sharing screen' : 'Share your screen'}
            aria-label={sharing ? 'Stop sharing screen' : 'Share your screen'}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${sharing ? 'bg-emerald-500 text-white' : 'call-btn-mic'}`}
          >{sharing ? <ScreenShareOff className="w-6 h-6"/> : <ScreenShare className="w-6 h-6"/>}</button>
        )}
        {connected && !permissionError && conversationId != null && (
          <button
            onClick={()=> { void (recording ? stopRecording() : startRecording()) }}
            disabled={recBusy}
            title={recording ? `Stop recording (${format(recElapsed)})` : 'Record this call (peer is notified in chat)'}
            aria-label={recording ? 'Stop recording' : 'Record this call'}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 ${recording ? 'bg-red-500 text-white' : 'call-btn-mic'}`}
          >
            <span className={`w-5 h-5 rounded-full border-2 ${recording ? 'bg-white border-white animate-pulse' : 'border-current'}`} />
          </button>
        )}
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
