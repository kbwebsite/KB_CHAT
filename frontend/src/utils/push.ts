import { configApi, pushApi, isNativeApp } from '../services/api'

/**
 * Web push via Firebase Cloud Messaging. No-ops unless the server exposes a
 * Firebase web config + VAPID key (dashboard vars). Native push (APK) is a
 * separate follow-up: it needs google-services.json + the Capacitor push
 * plugin, so nothing here breaks that build in the meantime.
 */

let started = false
let inflight: Promise<void> | null = null

/** Short, dependency-free new-message blip (no audio asset needed). */
export function playPing(): void {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
    osc.onended = () => ctx.close().catch(() => {})
  } catch {}
}

export function initWebPush(opts?: { desktop?: boolean }): Promise<void> {
  if (started) return Promise.resolve()
  if (inflight) return inflight
  inflight = runWebPush(opts).finally(() => {
    inflight = null
  })
  return inflight
}

async function runWebPush(opts?: { desktop?: boolean }): Promise<void> {
  try {
    if (isNativeApp()) return
    // Honor the user's in-app preference; a later toggle-on retries.
    if (opts?.desktop === false) return
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      return
    }
    const cfg = await configApi.get().catch(() => null)
    const fb = cfg?.data?.firebase
    const vapid = cfg?.data?.vapidKey
    if (!fb?.projectId || !fb?.apiKey || !vapid) return
    if (Notification.permission === 'denied') return

    const [{ initializeApp }, { getMessaging, getToken, onMessage }] =
      await Promise.all([import('firebase/app'), import('firebase/messaging')])
    let app: any
    try {
      app = initializeApp({
        apiKey: fb.apiKey,
        projectId: fb.projectId,
        messagingSenderId: fb.messagingSenderId,
        appId: fb.appId,
      })
    } catch {
      return
    }
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    if (Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => 'denied')
    }
    if (Notification.permission !== 'granted') return
    const messaging = getMessaging(app)
    const token = await getToken(messaging, {
      vapidKey: vapid,
      serviceWorkerRegistration: reg,
    }).catch(() => null)
    if (token) {
      try {
        localStorage.setItem('kb_push_token', token)
      } catch {}
      await pushApi.register({ token, platform: 'web' }).catch(() => {})
    }
    onMessage(messaging, (payload: any) => {
      try {
        if (!document.hidden || Notification.permission !== 'granted') return
        const title = payload?.notification?.title || 'Kryzen'
        const body = payload?.notification?.body || 'New message'
        const n = new Notification(title, {
          body,
          icon: '/kryzen-logo.svg',
          data: payload?.data,
        })
        n.onclick = () => {
          try {
            window.focus()
            const cid = payload?.data?.conversation_id
            window.location.href = cid ? `/chat?conv=${cid}` : '/chat'
          } catch {}
          n.close()
        }
      } catch {}
    })
    started = true
  } catch {}
}

export async function unregisterWebPush(): Promise<void> {
  try {
    const token = localStorage.getItem('kb_push_token')
    if (token) {
      await pushApi.unregister({ token }).catch(() => {})
      localStorage.removeItem('kb_push_token')
    }
  } catch {}
  try {
    if (isNativeApp()) {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      await PushNotifications.removeAllListeners().catch(() => {})
      await PushNotifications.unregister().catch(() => {})
    }
  } catch {}
}

/**
 * Native (APK) push via FCM. Registers the device token with the backend as
 * platform android; taps deep-link into the conversation. Foreground
 * messages are already covered live by the websocket, so only taps + token
 * lifecycle are handled here. No-ops entirely off-device.
 */
let nativeStarted = false

export async function initNativePush(): Promise<void> {
  if (nativeStarted) return
  nativeStarted = true
  try {
    if (!isNativeApp()) return
    const { PushNotifications } = await import('@capacitor/push-notifications')
    let perm: any = await PushNotifications.checkPermissions().catch(() => ({ receive: 'prompt' }))
    if (perm?.receive === 'prompt') {
      perm = await PushNotifications.requestPermissions().catch(() => perm)
    }
    if (perm?.receive !== 'granted') return
    await PushNotifications.register().catch(() => {})
    await PushNotifications.addListener('registration', async (t: any) => {
      try {
        if (t?.value) {
          try {
            localStorage.setItem('kb_push_token', t.value)
          } catch {}
          await pushApi.register({ token: t.value, platform: 'android' }).catch(() => {})
        }
      } catch {}
    })
    await PushNotifications.addListener('registrationError', () => {})
    await PushNotifications.addListener('pushNotificationActionPerformed', (a: any) => {
      try {
        const cid = a?.notification?.data?.conversation_id
        window.location.href = cid ? `/chat?conv=${cid}` : '/chat'
      } catch {}
    })
  } catch {}
}
