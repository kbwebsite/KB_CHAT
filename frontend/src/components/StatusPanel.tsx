import { useEffect, useState } from 'react'
import { statusApi } from '../services/api'
import { X, Plus, Eye, Trash2, Image as ImageIcon, Video, Type, Send } from 'lucide-react'
import { useAuthStore } from '../store/auth'

export function StatusPanel({ onClose, onViewer }: { onClose:()=>void, onViewer:(status:any, all:any[])=>void }) {
  const [feed, setFeed]=useState<{my_status:any[], recent:any[], viewed:any[]}>({my_status:[], recent:[], viewed:[]})
  const [loading, setLoading]=useState(true)
  const [showComposer, setShowComposer]=useState(false)
  const { user } = useAuthStore()

  const load=async ()=>{
    setLoading(true)
    try {
      const r=await statusApi.feed()
      if (r.success) setFeed(r.data)
    } finally { setLoading(false) }
  }
  useEffect(()=>{ load() }, [])

  const handleDelete=async (id:number)=>{
    if (!confirm('Delete status?')) return
    await statusApi.del(id)
    load()
  }

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold">Status</h2>
        <button onClick={onClose} className="p-2 hover:bg-muted rounded-full"><X className="w-4 h-4"/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* My Status */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">My Status</h3>
          <button onClick={()=> setShowComposer(!showComposer)} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-muted hover:bg-accent border border-dashed">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white"><Plus className="w-6 h-6"/></div>
            <div className="text-left">
              <p className="text-sm font-medium">Add Status</p>
              <p className="text-xs text-muted-foreground">Tap to share</p>
            </div>
          </button>
          {showComposer && <StatusComposer onCreated={()=>{ setShowComposer(false); load() }} onClose={()=> setShowComposer(false)} />}
          {feed.my_status.length>0 && (
            <div className="mt-3 space-y-2">
              {feed.my_status.map((s:any)=> (
                <div key={s.id} className="flex items-center gap-3 p-2 rounded-xl bg-card border hover:bg-muted group">
                  <button onClick={()=> onViewer(s, feed.my_status)} className="flex items-center gap-3 flex-1 text-left">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm">
                      {s.media_url ? <img src={s.media_url} alt="" className="w-full h-full object-cover"/> : <span>{(s.content||'?')[0]}</span>}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.caption || s.content?.slice(0,20) || 'Status'}</p>
                      <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleTimeString()} • {s.view_count} views</p>
                    </div>
                  </button>
                  <button onClick={()=> handleDelete(s.id)} className="p-2 opacity-0 group-hover:opacity-100 hover:bg-background rounded-full"><Trash2 className="w-4 h-4 text-destructive"/></button>
                  <Eye className="w-3 h-3 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Updates</h3>
          {loading ? <p className="text-xs text-muted-foreground">Loading...</p> : feed.recent.length===0 ? <p className="text-sm text-muted-foreground">No recent updates</p> : (
            <div className="space-y-2">
              {feed.recent.map((s:any)=> (
                <button key={s.id} onClick={()=> { statusApi.view(s.id); onViewer(s, feed.recent)}} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted text-left">
                  <div className="w-10 h-10 rounded-full p-0.5 bg-gradient-to-tr from-violet-600 to-indigo-600">
                    <div className="w-full h-full rounded-full bg-card p-0.5">
                      <div className="w-full h-full rounded-full overflow-hidden bg-muted flex items-center justify-center">
                        {s.avatar_url ? <img src={s.avatar_url} alt="" className="w-full h-full object-cover"/> : s.media_url ? <img src={s.media_url} alt="" className="w-full h-full object-cover"/> : <span className="text-xs">{s.display_name[0]}</span>}
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{s.display_name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleTimeString()}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Viewed */}
        {feed.viewed.length>0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Viewed</h3>
            <div className="space-y-2 opacity-60">
              {feed.viewed.map((s:any)=> (
                <button key={s.id} onClick={()=> onViewer(s, feed.viewed)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted text-left">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                    {s.media_url ? <img src={s.media_url} alt="" className="w-full h-full object-cover"/> : <span>{s.display_name[0]}</span>}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{s.display_name}</p>
                    <p className="text-xs text-muted-foreground">Yesterday</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusComposer({ onCreated, onClose }: { onCreated:()=>void, onClose:()=>void }) {
  const [tab, setTab]=useState<'text'|'image'|'video'>('text')
  const [content, setContent]=useState('')
  const [caption, setCaption]=useState('')
  const [bg, setBg]=useState('bg-gradient-to-br from-violet-600 to-indigo-600')
  const [file, setFile]=useState<File|null>(null)
  const [privacy, setPrivacy]=useState('contacts')
  const [saving, setSaving]=useState(false)

  const bgs=[
    'bg-gradient-to-br from-violet-600 to-indigo-600',
    'bg-gradient-to-br from-emerald-500 to-teal-600',
    'bg-gradient-to-br from-rose-500 to-orange-500',
    'bg-gradient-to-br from-blue-600 to-cyan-500',
    'bg-slate-900',
  ]

  const handleCreate=async ()=>{
    setSaving(true)
    try {
      if (tab==='text') {
        const fd=new FormData()
        fd.append('content', content)
        fd.append('media_type','text')
        fd.append('background', bg)
        fd.append('privacy', privacy)
        const r=await statusApi.create(fd)
        if (r.success) onCreated()
      } else {
        if (!file) return alert('Select file')
        const fd=new FormData()
        fd.append('file', file)
        fd.append('media_type', tab)
        fd.append('caption', caption)
        fd.append('privacy', privacy)
        const r=await statusApi.createMedia(fd)
        if (r.success) onCreated()
      }
    } catch (e:any) { alert(e.response?.data?.detail || 'Failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="mt-3 p-3 rounded-2xl bg-card border space-y-3">
      <div className="flex gap-2">
        {(['text','image','video'] as const).map(t=> (
          <button key={t} onClick={()=> setTab(t)} className={`flex-1 py-1.5 rounded-full text-xs font-medium flex items-center justify-center gap-1 ${tab===t?'bg-primary text-primary-foreground':'bg-muted'}`}>
            {t==='text' ? <Type className="w-3 h-3"/> : t==='image' ? <ImageIcon className="w-3 h-3"/> : <Video className="w-3 h-3"/>}{t}
          </button>
        ))}
      </div>

      {tab==='text' && (
        <>
          <div className="flex gap-1.5">
            {bgs.map(b=> <button key={b} onClick={()=> setBg(b)} className={`w-6 h-6 rounded-full ${b} ${bg===b?'ring-2 ring-offset-2 ring-primary':''}`}/>)}
          </div>
          <div className={`h-32 rounded-xl flex items-center justify-center p-4 ${bg}`}>
            <textarea value={content} onChange={e=> setContent(e.target.value)} placeholder="What's on your mind?" className="w-full h-full bg-transparent text-white placeholder:text-white/70 text-center text-lg outline-none resize-none" maxLength={200} />
          </div>
        </>
      )}

      {tab!=='text' && (
        <>
          <input type="file" accept={tab==='image' ? 'image/*' : 'video/*'} onChange={e=> setFile(e.target.files?.[0]||null)} className="w-full text-sm" />
          <input value={caption} onChange={e=> setCaption(e.target.value)} placeholder="Caption..." className="w-full px-3 py-2 rounded-xl bg-muted border outline-none text-sm" />
          {file && <p className="text-xs text-muted-foreground">{file.name} • {(file.size/1024).toFixed(1)}KB</p>}
        </>
      )}

      <div>
        <label className="text-xs">Privacy</label>
        <select value={privacy} onChange={e=> setPrivacy(e.target.value)} className="w-full mt-1 px-2 py-1.5 rounded-lg bg-muted border text-xs">
          <option value="contacts">My contacts</option>
          <option value="selected">Selected</option>
          <option value="nobody">Nobody</option>
        </select>
      </div>

      <div className="flex gap-2">
        <button onClick={handleCreate} disabled={saving} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1"><Send className="w-3 h-3"/>{saving?'Publishing...':'Publish'}</button>
        <button onClick={onClose} className="px-4 py-2 rounded-xl bg-muted text-sm">Cancel</button>
      </div>
    </div>
  )
}
