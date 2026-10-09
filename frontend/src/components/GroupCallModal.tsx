import { useEffect, useRef, useState } from 'react'
import { PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react'
import wsService from '../services/websocket'
import { callsApi, groupCallsApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import { useChatStore } from '../store/chat'
import { useGroupCallStore } from '../store/groupCall'

type PeerConn = {
  pc: RTCPeerConnection
  queue: RTCIceCandidateInit[]
}

function PeerVideo({ stream, muted }: { stream: MediaStream; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream
      try {
        ;(ref.current.play?.() as any)?.catch?.(() => {})
      } catch {}
    }
  }, [stream])
  return <video ref={ref} autoPlay playsInline muted={muted} className="w-full h-full object-cover bg-black" />
}

/** Mesh group call: one RTCPeerConnection per peer, roster over WS
 * (`group_call.join/leave/mute`), media over the existing 1-1
 * `call.offer/answer/ice_candidate` relay tagged with `groupCallId`.
 * Glare is resolved deterministically: the higher user id backs off. */
export function GroupCallModal() {
  const joined = useGroupCallStore((s) => s.joined)
  const leaveStore = useGroupCallStore((s) => s.leave)
  const { user } = useAuthStore()
  const myId = user?.id ?? null
  const conv = useChatStore((s) =>
    joined ? s.conversations.find((c: any) => c.id === joined.session.conversation_id) : undefined,
  ) as any

  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [hasCamera, setHasCamera] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [remotes, setRemotes] = useState<Record<number, MediaStream>>({})
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [mutedMap, setMutedMap] = useState<Record<number, boolean>>({})
  const [, setTick] = useState(0)

  const session = joined?.session ?? null
  const sessionId = session?.id ?? null
  const convId = session?.conversation_id ?? null
  const isVideo = session?.call_type === 'video'

  const streamRef = useRef<MediaStream | null>(null)
  const pcsRef = useRef<Map<number, PeerConn>>(new Map())
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }])
  const setupDoneRef = useRef(false)
  const leftRef = useRef(false)
  const sessionRef = useRef(session)
  sessionRef.current = session
  const myIdRef = useRef(myId)
  myIdRef.current = myId

  const members: any[] = conv?.members || []
  const nameOf = (uid: number) => {
    if (uid === myId) return 'You'
    const m = members.find((m: any) => m.user_id === uid)
    return m?.display_name || m?.username || `User ${uid}`
  }
  const avatarOf = (uid: number) => members.find((m: any) => m.user_id === uid)?.avatar_url || null

  const closeAll = () => {
    pcsRef.current.forEach(({ pc }) => {
      try {
        pc.close()
      } catch {}
    })
    pcsRef.current.clear()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setRemotes({})
  }

  const doLeave = (send = true) => {
    if (leftRef.current) return
    leftRef.current = true
    if (send && convId != null && sessionId != null) {
      try {
        wsService.send({
          type: 'group_call.leave',
          payload: { conversation_id: convId, session_id: sessionId },
        })
      } catch {}
    }
    closeAll()
    leaveStore()
  }

  const sendOffer = async (peerId: number) => {
    const pc = pcsRef.current.get(peerId)?.pc
    if (!pc || convId == null || sessionId == null) return
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      wsService.send({
        type: 'call.offer',
        payload: {
          to_user_id: peerId,
          conversation_id: convId,
          groupCallId: sessionId,
          sdp: JSON.parse(JSON.stringify(offer)),
        },
      })
    } catch (e) {
      console.error('group offer', e)
    }
  }

  const makePc = (peerId: number): RTCPeerConnection => {
    const existing = pcsRef.current.get(peerId)
    if (existing) return existing.pc
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current })
    pcsRef.current.set(peerId, { pc, queue: [] })
    const local = streamRef.current
    if (local) local.getTracks().forEach((t) => pc.addTrack(t, local))
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        wsService.send({
          type: 'call.ice_candidate',
          payload: {
            to_user_id: peerId,
            conversation_id: convId,
            groupCallId: sessionId,
            candidate: JSON.parse(JSON.stringify(e.candidate)),
          },
        })
      }
    }
    pc.ontrack = (e) => {
      const stream = e.streams[0]
      if (!stream) return
      setRemotes((r) => ({ ...r, [peerId]: stream }))
      setTick((t) => t + 1)
    }
    return pc
  }

  const flushQueue = async (peerId: number) => {
    const entry = pcsRef.current.get(peerId)
    if (!entry?.pc.remoteDescription) return
    const q = entry.queue.splice(0, 50)
    for (const c of q) {
      try {
        await entry.pc.addIceCandidate(new RTCIceCandidate(c))
      } catch {}
    }
  };

  useEffect(() => {
    if (!joined || !session || myId == null) return
    if (setupDoneRef.current) return
    setupDoneRef.current = true
    let cancelled = false

    const setup = async () => {
      // Still alive? (race: ended between banner tap and mount)
      try {
        const r = await groupCallsApi.active(session.conversation_id)
        if (cancelled) return
        if (!r?.success || !r.data) {
          setNotice('This call already ended.')
          setTimeout(() => leaveStore(), 1500)
          return
        }
      } catch {}
      try {
        const turnRes = await callsApi.turn()
        if (turnRes?.success && turnRes.data && Array.isArray(turnRes.data)) {
          iceServersRef.current = turnRes.data
        }
      } catch {}
      const wantVideo = session.call_type === 'video'
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: wantVideo })
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        } catch (err: any) {
          if (!cancelled) setNotice(err?.message || 'Microphone unavailable.')
          return
        }
        if (!cancelled) {
          setHasCamera(false)
          setCamOn(false)
          setNotice('Camera unavailable — audio only for you.')
        }
      }
      if (cancelled) {
        stream!.getTracks().forEach((t) => t.stop())
        return
      }
      if (stream!.getVideoTracks().length > 0) setHasCamera(true)
      else {
        setHasCamera(false)
        setCamOn(false)
      }
      streamRef.current = stream!
      setLocalStream(stream!)
      // Announce presence: everyone in the room offers to us.
      wsService.send({
        type: 'group_call.join',
        payload: { conversation_id: session.conversation_id, session_id: session.id },
      })
    }
    void setup()

    const sameRoom = (p: any) =>
      p && p.session_id === session.id && p.conversation_id === session.conversation_id

    const onJoin = (p: any) => {
      if (!sameRoom(p)) return
      const from = p.from_user_id
      if (from == null || from === myIdRef.current) return
      // Everyone offers to the joiner.
      makePc(from)
      void sendOffer(from)
    }

    const onOffer = async (p: any) => {
      if (p?.groupCallId !== session.id) return
      const from = p.from_user_id
      if (from == null || from === myIdRef.current) return
      const me = myIdRef.current ?? 0
      let entry = pcsRef.current.get(from)
      const collision = !!entry && entry.pc.signalingState !== 'stable'
      if (collision && me < from) return // mine wins; they back off
      if (collision && me > from) {
        // Polite: roll back my outgoing offer, take theirs.
        try {
          await entry!.pc.setLocalDescription({ type: 'rollback' } as any)
        } catch {}
      }
      if (!entry) makePc(from)
      entry = pcsRef.current.get(from)!
      try {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(p.sdp || p))
        await flushQueue(from)
        const answer = await entry.pc.createAnswer()
        await entry.pc.setLocalDescription(answer)
        wsService.send({
          type: 'call.answer',
          payload: {
            to_user_id: from,
            conversation_id: session.conversation_id,
            groupCallId: session.id,
            sdp: JSON.parse(JSON.stringify(answer)),
          },
        })
      } catch (e) {
        console.error('group answer', e)
      }
    }

    const onAnswer = async (p: any) => {
      if (p?.groupCallId !== session.id) return
      const from = p.from_user_id
      if (from == null) return
      const entry = pcsRef.current.get(from)
      if (!entry || entry.pc.signalingState !== 'have-local-offer') return
      try {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(p.sdp || p))
        await flushQueue(from)
      } catch (e) {
        console.error('group answer-apply', e)
      }
    }

    const onIce = async (p: any) => {
      if (p?.groupCallId !== session.id) return
      const from = p.from_user_id
      if (from == null) return
      const entry = pcsRef.current.get(from)
      if (!entry) return
      const cand = p.candidate
      if (!cand) return
      if (!entry.pc.remoteDescription) {
        if (entry.queue.length < 50) entry.queue.push(cand)
        return
      }
      try {
        await entry.pc.addIceCandidate(new RTCIceCandidate(cand))
      } catch {}
    }

    const onLeave = (p: any) => {
      if (!sameRoom(p)) return
      const from = p.from_user_id
      if (from == null) return
      const entry = pcsRef.current.get(from)
      if (entry) {
        try {
          entry.pc.close()
        } catch {}
        pcsRef.current.delete(from)
      }
      setRemotes((r) => {
        if (!(from in r)) return r
        const next = { ...r }
        delete next[from]
        return next
      })
      setMutedMap((m) => {
        if (!(from in m)) return m
        const next = { ...m }
        delete next[from]
        return next
      })
    }

    const onMute = (p: any) => {
      if (!sameRoom(p)) return
      const from = p.from_user_id
      if (from == null) return
      setMutedMap((m) => ({ ...m, [from]: !!p.muted }))
    }

    const onEnd = (p: any) => {
      if (p?.id !== session.id) return
      doLeave(false)
    }

    const off1 = wsService.on('group_call.join', onJoin)
    const off2 = wsService.on('call.offer', onOffer)
    const off3 = wsService.on('call.answer', onAnswer)
    const off4 = wsService.on('call.ice_candidate', onIce)
    const off5 = wsService.on('group_call.leave', onLeave)
    const off6 = wsService.on('group_call.mute', onMute)
    const off7 = wsService.on('group_call.end', onEnd)
    const clock = setInterval(() => setElapsed((e) => e + 1), 1000)

    return () => {
      cancelled = true
      clearInterval(clock)
      off1()
      off2()
      off3()
      off4()
      off5()
      off6()
      off7()
      // StrictMode-safe: only tear down media when actually leaving.
      if (leftRef.current) return
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined?.session.id])

  // mic/cam toggles apply to live tracks; mic state is shared with the room
  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = micOn))
    if (convId != null && sessionId != null && setupDoneRef.current) {
      try {
        wsService.send({
          type: 'group_call.mute',
          payload: { conversation_id: convId, session_id: sessionId, muted: !micOn },
        })
      } catch {}
    }
  }, [micOn, convId, sessionId])

  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = camOn))
  }, [camOn])

  if (!joined || !session) return null
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const peerIds = Object.keys(remotes).map(Number)
  const total = peerIds.length + 1
  const showVideo = (uid: number | 'me') => {
    if (!isVideo) return false
    if (uid === 'me') {
      const v = streamRef.current?.getVideoTracks() ?? []
      return camOn && v.length > 0 && v[0].enabled !== false && v[0].readyState === 'live'
    }
    const st = remotes[uid]
    const v = st?.getVideoTracks() ?? []
    return v.length > 0 && v[0].readyState === 'live'
  }

  const tile = (uid: number | 'me') => {
    const isMe = uid === 'me'
    const id = isMe ? (myId as number) : (uid as number)
    const video = showVideo(uid)
    const muted = isMe ? !micOn : !!mutedMap[id]
    return (
      <div key={String(uid)} className="relative rounded-2xl overflow-hidden bg-slate-800/80 min-h-[140px] flex items-center justify-center">
        {video ? (
          isMe ? (
            localStream ? (
              <PeerVideo stream={localStream} muted />
            ) : (
              <div className="w-16 h-16 rounded-full kryzen-accent-gradient flex items-center justify-center text-xl font-bold text-white">
                {nameOf(id)[0]?.toUpperCase()}
              </div>
            )
          ) : (
            <PeerVideo stream={remotes[id]} />
          )
        ) : (
          <div className="w-16 h-16 rounded-full kryzen-accent-gradient flex items-center justify-center text-xl font-bold text-white overflow-hidden">
            {avatarOf(id) ? <img src={avatarOf(id)!} alt="" className="w-full h-full object-cover" /> : nameOf(id)[0]?.toUpperCase()}
          </div>
        )}
        <span className="absolute bottom-1.5 left-1.5 text-[11px] px-2 py-0.5 rounded-full bg-black/60 text-white truncate max-w-[70%]">
          {nameOf(id)}
        </span>
        {muted && (
          <span className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white" title="Muted">
            <MicOff className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-gray-900 via-slate-900 to-black flex flex-col text-white p-4 overflow-y-auto">
      <div className="max-w-3xl w-full mx-auto flex flex-col min-h-full">
        <div className="text-center pt-2">
          <h2 className="text-lg font-semibold tracking-tight">{joined.title}</h2>
          <p className="text-xs text-white/60">
            Group {isVideo ? 'video' : 'voice'} call • {total} in call • {fmt(elapsed)}
          </p>
          {notice && <p className="mt-2 text-xs bg-amber-500/15 border border-amber-500/25 px-3 py-1.5 rounded-full inline-block">{notice}</p>}
        </div>

        <div className={`grid gap-2 mt-4 flex-1 content-start ${total <= 2 ? 'grid-cols-1 sm:grid-cols-2' : total <= 4 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {tile('me')}
          {peerIds.map((id) => tile(id))}
        </div>

        <div className="mt-4 pb-[max(16px,env(safe-area-inset-bottom))] flex items-center justify-center gap-4">
          <button
            onClick={() => setMicOn((v) => !v)}
            className={`w-14 h-14 rounded-full flex items-center justify-center ${micOn ? 'bg-white/10' : 'bg-red-500/80'}`}
            aria-label={micOn ? 'Mute' : 'Unmute'}
          >
            {micOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>
          {isVideo && hasCamera && (
            <button
              onClick={() => setCamOn((v) => !v)}
              className={`w-14 h-14 rounded-full flex items-center justify-center ${camOn ? 'bg-white/10' : 'bg-red-500/80'}`}
              aria-label={camOn ? 'Camera off' : 'Camera on'}
            >
              {camOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
            </button>
          )}
          <button
            onClick={async () => {
              try {
                await groupCallsApi.end(session.id)
              } catch {}
              doLeave(false)
            }}
            className="h-14 px-5 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium"
            title="End the call for everyone"
          >
            End call
          </button>
          <button
            onClick={() => doLeave(true)}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center"
            aria-label="Leave call"
            title="Leave (call continues for others)"
          >
            <PhoneOff className="w-7 h-7" />
          </button>
        </div>
      </div>
    </div>
  )
}
