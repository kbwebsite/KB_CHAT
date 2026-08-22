import { useEffect, useState } from 'react'
import { callsApi } from '../services/api'
import { Phone, Video, PhoneMissed, Clock, X } from 'lucide-react'
import { formatTime } from '../utils/format'

export function CallsPanel({ onClose }: { onClose:()=>void }) {
  const [calls, setCalls]=useState<any[]>([])
  const [loading, setLoading]=useState(true)

  useEffect(()=>{
    callsApi.history().then(r=>{ if(r.success) setCalls(r.data)}).finally(()=> setLoading(false))
  }, [])

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold flex items-center gap-2"><Phone className="w-4 h-4"/> Calls</h2>
        <button onClick={onClose} className="p-2 hover:bg-muted rounded-full"><X className="w-4 h-4"/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? <p className="text-sm text-muted-foreground p-4">Loading...</p> : calls.length===0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Phone className="w-8 h-8 mx-auto mb-2 opacity-30"/>
            <p>No call history</p>
            <p className="text-xs">Voice and video calls will appear here.</p>
          </div>
        ) : calls.map(c=> (
          <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted border">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${c.status==='missed'?'bg-red-500':'bg-emerald-500'} text-white`}>
              {c.status==='missed' ? <PhoneMissed className="w-4 h-4"/> : c.call_type==='video' ? <Video className="w-4 h-4"/> : <Phone className="w-4 h-4"/>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{c.caller_id ? c.callee_display : c.caller_display}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3"/>{formatTime(c.started_at)} • {c.call_type} • {c.status} {c.duration_seconds ? `• ${Math.floor(c.duration_seconds/60)}m ${c.duration_seconds%60}s` : ''}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
