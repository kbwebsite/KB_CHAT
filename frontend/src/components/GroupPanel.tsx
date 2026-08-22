import { useState } from 'react'
import { convApi, extendedApi } from '../services/api'
import { Conversation } from '../types'
import { useAuthStore } from '../store/auth'
import { X, Users, UserPlus, Trash2, LogOut, Bell, BellOff, FileDown, Eraser, Shield } from 'lucide-react'
import { UserSearch } from './UserSearch'

export function GroupPanel({ conversation, onClose, onUpdated }: { conversation:Conversation, onClose:()=>void, onUpdated:()=>void }) {
  const { user } = useAuthStore()
  const [title, setTitle]=useState(conversation.title||'')
  const [desc, setDesc]=useState(conversation.description||'')
  const [showAdd, setShowAdd]=useState(false)
  const [msg, setMsg]=useState<string|null>(null)
  const [muted, setMuted]=useState(false)

  const myRole = conversation.members.find(m=> m.user_id===user?.id)?.role
  const canManage = myRole==='owner' || myRole==='admin'

  const handleUpdate=async ()=>{
    if (!canManage) return setMsg('Only admins can edit')
    try {
      const res = await convApi.updateGroup(conversation.id, { title, description: desc })
      if (res.success) { setMsg('Group updated'); onUpdated() }
    } catch (e:any) { setMsg(e.response?.data?.message||'Failed') }
  }

  const handleAdd=async (u:any)=>{
    if (!canManage) return setMsg('Only admins can add')
    try {
      await convApi.addMembers(conversation.id, { user_ids: [u.id] })
      setMsg(`Added ${u.username}`)
      onUpdated()
      setShowAdd(false)
    } catch (e:any) { setMsg(e.response?.data?.message||'Failed to add') }
  }

  const handleRemove=async (uid:number)=>{
    if (!canManage) return setMsg('Only admins can remove')
    if (!confirm('Remove member?')) return
    try {
      await convApi.removeMember(conversation.id, uid)
      onUpdated()
    } catch (e:any) { setMsg(e.response?.data?.message||'Failed') }
  }

  const handleLeave=async ()=>{
    if (!confirm('Leave this group?')) return
    try {
      await convApi.delete(conversation.id)
      onClose()
      window.location.reload()
    } catch (e:any) { setMsg(e.response?.data?.detail || 'Failed') }
  }

  const handleMute=async ()=>{
    try {
      await extendedApi.mute(conversation.id, !muted)
      setMuted(!muted)
      setMsg(muted ? 'Unmuted' : 'Muted')
    } catch {}
  }

  const handleExport=async (fmt:'json'|'txt')=>{
    try {
      if (fmt==='txt') {
        const blob = await extendedApi.exportChat(conversation.id, 'txt') as Blob
        const url=URL.createObjectURL(blob)
        const a=document.createElement('a'); a.href=url; a.download=`kbchat_${conversation.id}.txt`; a.click(); URL.revokeObjectURL(url)
      } else {
        const res=await extendedApi.exportChat(conversation.id, 'json')
        const blob=new Blob([JSON.stringify(res.data, null, 2)], {type:'application/json'})
        const url=URL.createObjectURL(blob)
        const a=document.createElement('a'); a.href=url; a.download=`kbchat_${conversation.id}.json`; a.click(); URL.revokeObjectURL(url)
      }
      setMsg(`Exported as ${fmt.toUpperCase()}`)
    } catch { setMsg('Export failed') }
  }

  const handleClear=async ()=>{
    if (!confirm('Clear all messages? This deletes messages for everyone in this conversation.')) return
    try {
      await extendedApi.clear(conversation.id)
      setMsg('Chat cleared')
      onUpdated()
    } catch (e:any) { setMsg('Clear failed') }
  }

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4"/> {conversation.is_group ? 'Group Info' : 'Contact Info'}</h2>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-muted"><X className="w-4 h-4"/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white">
            <Users className="w-8 h-8"/>
          </div>
          <p className="font-semibold mt-2">{conversation.title}</p>
          <p className="text-xs text-muted-foreground">{conversation.members.length} members • {myRole} {myRole==='owner' && <Shield className="w-3 h-3 inline"/>}</p>
          <div className="flex gap-2 mt-3">
            <button onClick={handleMute} className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1 ${muted ? 'bg-amber-500 text-white' : 'bg-muted'}`}>{muted ? <BellOff className="w-3 h-3"/> : <Bell className="w-3 h-3"/>}{muted? 'Muted':'Mute'}</button>
            <button onClick={handleLeave} className="px-3 py-1.5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center gap-1"><LogOut className="w-3 h-3"/>Leave</button>
          </div>
        </div>
        {conversation.is_group && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Group Name {!canManage && <span className="text-muted-foreground">(read-only)</span>}</label>
              <input value={title} onChange={e=>setTitle(e.target.value)} disabled={!canManage} className="w-full mt-1 px-3 py-2 rounded-xl bg-muted border border-transparent focus:bg-background focus:border-primary outline-none text-sm disabled:opacity-60" />
            </div>
            <div>
              <label className="text-xs font-medium">Description</label>
              <textarea value={desc} onChange={e=>setDesc(e.target.value)} disabled={!canManage} rows={2} className="w-full mt-1 px-3 py-2 rounded-xl bg-muted border border-transparent focus:bg-background focus:border-primary outline-none text-sm disabled:opacity-60" />
            </div>
            <button onClick={handleUpdate} disabled={!canManage} className="w-full py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Save</button>
            {msg && <p className="text-xs text-center bg-muted py-1.5 rounded-lg">{msg}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button onClick={()=> handleExport('json')} className="py-2 rounded-xl bg-muted hover:bg-accent text-xs flex items-center justify-center gap-1"><FileDown className="w-3 h-3"/>Export JSON</button>
          <button onClick={()=> handleExport('txt')} className="py-2 rounded-xl bg-muted hover:bg-accent text-xs flex items-center justify-center gap-1"><FileDown className="w-3 h-3"/>Export TXT</button>
          <button onClick={handleClear} className="col-span-2 py-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground text-xs flex items-center justify-center gap-1"><Eraser className="w-3 h-3"/>Clear Chat</button>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Members</h3>
            {canManage && <button onClick={()=>setShowAdd(!showAdd)} className="p-1.5 rounded-full bg-primary text-primary-foreground"><UserPlus className="w-4 h-4"/></button>}
          </div>
          {showAdd && <div className="mt-2 border rounded-xl overflow-hidden"><UserSearch onSelect={handleAdd}/></div>}
          <div className="mt-3 space-y-2">
            {conversation.members.map(m=> (
              <div key={m.user_id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-white flex items-center justify-center text-xs font-bold overflow-hidden">
                  {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" alt=""/> : m.display_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.display_name} {m.role==='owner' && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500 text-white ml-1">OWNER</span>} {m.role==='admin' && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500 text-white ml-1">ADMIN</span>}</p>
                  <p className="text-xs text-muted-foreground truncate">@{m.username} {m.is_online ? '• Online' : ''}</p>
                </div>
                {canManage && m.role!=='owner' && m.user_id!==user?.id && <button onClick={()=>handleRemove(m.user_id)} className="p-1.5 hover:bg-background rounded-full text-destructive"><Trash2 className="w-4 h-4"/></button>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
