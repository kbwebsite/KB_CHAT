type Handler = (data:any)=>void

class WSService {
  private ws: WebSocket | null = null
  private url: string | null = null
  private handlers: Map<string, Set<Handler>> = new Map()
  private reconnectAttempts = 0
  private shouldReconnect = true
  private pingInterval: any = null

  connect(token: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    // Use current host, fallback to localhost:8000 if vite dev
    let wsHost = host
    // if vite dev, host is 5173, backend is 8000
    if (host.includes('5173')) wsHost = '127.0.0.1:8000'
    this.url = `${protocol}//${wsHost}/ws/chat?token=${encodeURIComponent(token)}`
    this.shouldReconnect = true
    this._connect()
  }

  private _connect() {
    if (!this.url) return
    this.ws = new WebSocket(this.url)
    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.emit('_open', {})
      // ping
      this.pingInterval = setInterval(()=> {
        if (this.ws?.readyState === WebSocket.OPEN) this.send({type:'ping', payload:{}})
      }, 30000)
    }
    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        const t = data.type
        this.emit(t, data.payload)
        this.emit('*', data)
      } catch {}
    }
    this.ws.onclose = () => {
      clearInterval(this.pingInterval)
      this.emit('_close', {})
      if (this.shouldReconnect) {
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000)
        this.reconnectAttempts++
        setTimeout(()=> this._connect(), delay)
      }
    }
    this.ws.onerror = () => {
      this.emit('_error', {})
    }
  }

  disconnect() {
    this.shouldReconnect = false
    clearInterval(this.pingInterval)
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
    this.handlers.get(type)?.forEach(h=> h(payload))
    // wildcard already handled? double emit for '*'
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
