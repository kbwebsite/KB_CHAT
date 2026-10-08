type Handler = (data:any)=>void

class WSService {
  private ws: WebSocket | null = null
  private url: string | null = null
  private token: string | null = null
  private tokenProvider: (() => string | null) | null = null
  private reviving = false
  private handlers: Map<string, Set<Handler>> = new Map()
  private reconnectAttempts = 0
  private shouldReconnect = true
  private pingInterval: any = null
  private lastPong = 0
  private netListenersBound = false
  private reconnectTimer: any = null

  private onNetworkUp = () => {
    // Flapping between cell/wifi kills the socket silently; the ping
    // watchdog takes up to 60s to notice — reconnect right away instead.
    if (this.shouldReconnect && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
      this.reconnectAttempts = 0
      this._connect()
    }
  }

  /** Prefer a live token source so reconnects never dial with a dead token. */
  setTokenProvider(fn: () => string | null) {
    this.tokenProvider = fn
  }

  private currentToken(): string | null {
    try {
      const live = this.tokenProvider?.()
      if (live) return live
    } catch {}
    return this.token
  }

  private buildUrl(token: string): string | null {
    // Absolute backend override (Vercel web build → Render API). Same-host
    // logic below only applies when the SPA is served by the API itself
    // (Render Docker) or local dev.
    try {
      const wsBase = (import.meta.env.VITE_WS_URL || '').replace(/\/$/, '')
      if (wsBase) {
        return `${wsBase}/ws/chat?token=${encodeURIComponent(token)}`
      }
    } catch { /* fall through to default logic */ }
    // Native shell has a local (capacitor://) origin — dial production directly.
    try {
      const cap = (window as any)?.Capacitor
      if (cap?.isNativePlatform?.()) {
        const fallback = 'wss://kb-chat-1.onrender.com'
        return `${fallback}/ws/chat?token=${encodeURIComponent(token)}`
      }
    } catch { /* fall through to web logic */ }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    let wsHost = host
    if (host.includes('5173')) wsHost = '127.0.0.1:8000'
    return `${protocol}//${wsHost}/ws/chat?token=${encodeURIComponent(token)}`
  }

  connect(token: string) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    if (this.ws) { this.ws.close(); this.ws = null }
    this.shouldReconnect = true
    this.reconnectAttempts = 0
    this.reviving = false
    this.token = token
    if (!this.netListenersBound) {
      this.netListenersBound = true
      try {
        window.addEventListener('online', this.onNetworkUp)
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) this.onNetworkUp()
        })
      } catch {}
    }
    const url = this.buildUrl(token)
    if (!url) return
    this.url = url
    this._connect()
  }

  /** Rebuild the URL from the freshest token, then dial. */
  private _reconnectFresh(): boolean {
    const token = this.currentToken()
    if (!token) return false
    this.token = token
    const url = this.buildUrl(token)
    if (!url) return false
    if (this.ws) {
      try { this.ws.close() } catch {}
      this.ws = null
    }
    this.url = url
    this.reconnectAttempts = 0
    this._connect()
    return true
  }

  /**
   * Session revived path: the server closed us for auth (1008 bad token at
   * connect, 4401 revoked mid-connection). Try ONE silent refresh, then dial
   * with the fresh token. Failure means truly logged out — the session
   * module already ran the logout path, so just stop here (no loop).
   */
  private async _revive() {
    if (this.reviving) return
    this.reviving = true
    this.shouldReconnect = false
    clearTimeout(this.reconnectTimer)
    try {
      const { refreshAccessToken } = await import('./session')
      const token = await refreshAccessToken({ silent: true })
      if (token && this.reviving) {
        this.shouldReconnect = true
        this._reconnectFresh()
        return
      }
    } catch {}
    // else: stay down; a later login calls connect() explicitly.
  }

  private _connect() {
    // Always dial with the freshest token: a 15-minute access JWT may have
    // expired since the URL was first built (reconnect storm with a dead
    // token would 1008 forever).
    const fresh = this.currentToken()
    if (fresh && fresh !== this.token) {
      this.token = fresh
      const rebuilt = this.buildUrl(fresh)
      if (rebuilt) this.url = rebuilt
    }
    if (!this.url) return
    this.ws = new WebSocket(this.url)
    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.lastPong = Date.now()
      this.emit('_open', {})
      this.pingInterval = setInterval(()=> {
        if (this.ws?.readyState === WebSocket.OPEN) {
          if (Date.now() - this.lastPong > 60000) {
            this.ws.close()
            return
          }
          this.send({type:'ping', payload:{}})
        }
      }, 30000)
    }
    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'pong') { this.lastPong = Date.now(); return }
        const t = data.type
        this.emit(t, data.payload)
      } catch {}
    }
    this.ws.onclose = (e) => {
      clearInterval(this.pingInterval)
      this.emit('_close', {})
      if (e.code === 4401 || e.code === 1008 || e.code === 1003) {
        // Auth close: revoked session (4401) or rejected token (1008).
        // Try one silent refresh, then redial fresh — never loop.
        this._revive()
        return
      }
      // Never give up: an outage longer than ~3.5min used to leave the
      // socket dead until a full reload. Back off to a 30s ceiling and
      // keep trying while the session lives.
      if (this.shouldReconnect) {
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
        this.reconnectAttempts++
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = setTimeout(()=> this._connect(), delay)
      }
    }
    this.ws.onerror = () => {
      this.emit('_error', {})
    }
  }

  disconnect() {
    this.shouldReconnect = false
    this.reviving = false
    clearInterval(this.pingInterval)
    clearTimeout(this.reconnectTimer)
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  send(obj:any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj))
    }
  }

  on(type:string, handler:Handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(handler)
    return ()=> this.off(type, handler)
  }

  off(type:string, handler:Handler) {
    this.handlers.get(type)?.delete(handler)
  }

  private emit(type:string, payload:any) {
    this.handlers.get(type)?.forEach(h=> {
      try { h(payload) } catch (e) { console.error(`Handler error for ${type}:`, e) }
    })
  }

  sendTyping(conversationId:number, isTyping:boolean) {
    this.send({ type: isTyping ? 'typing.start' : 'typing.stop', payload: { conversation_id: conversationId }})
  }

  markRead(conversationId:number, messageId:number) {
    this.send({ type: 'message.read', payload: { conversation_id: conversationId, message_id: messageId }})
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

const wsService = new WSService()
export default wsService
