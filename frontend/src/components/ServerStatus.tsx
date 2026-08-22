import { useEffect, useState } from 'react'
import wsService from '../services/websocket'

export function ServerStatus() {
  const [status, setStatus]=useState<'Online'|'Reconnecting...'|'Offline'>('Offline')
  const [color, setColor]=useState('bg-gray-400')

  useEffect(()=>{
    const update=()=>{
      if (wsService.isConnected()) { setStatus('Online'); setColor('bg-emerald-500') }
      else { setStatus('Offline'); setColor('bg-red-500') }
    }
    update()
    const id=setInterval(update, 2000)
    const onOpen=()=>{ setStatus('Online'); setColor('bg-emerald-500') }
    const onClose=()=>{ setStatus('Reconnecting...'); setColor('bg-amber-500') }
    wsService.on('_open', onOpen)
    wsService.on('_close', onClose)
    return ()=>{ clearInterval(id); wsService.off('_open', onOpen); wsService.off('_close', onClose) }
  }, [])

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-2 h-2 rounded-full ${color} ${status==='Online' ? 'animate-pulse' : ''}`} />
      <span className="text-muted-foreground hidden sm:inline">Server: {status}</span>
    </div>
  )
}
