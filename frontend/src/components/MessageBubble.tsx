import { Message } from '../types'
import { formatTime } from '../utils/format'
import { Check, CheckCheck, Reply, Trash2, Edit3, Copy, Forward, Bookmark, MoreHorizontal, Flag, Pin } from 'lucide-react'
import { useState } from 'react'
import { LinkPreview, hasUrl, extractUrls } from './LinkPreview'

const REACTIONS = ['👍','❤️','😂','😮','😢','😡']

export function MessageBubble({ msg, isOwn, isGroup, showAvatar, onReply, onEdit, onDelete, onReact, onCopy, onForward, onSave, onSelect, isSelected, onImageClick, savedIds, onPin }: {
  msg: Message, isOwn:boolean, isGroup:boolean, showAvatar:boolean,
  onReply:(m:Message)=>void, onEdit:(m:Message)=>void, onDelete:(m:Message)=>void, onReact:(id:number, e:string)=>void,
  onCopy?:(t:string)=>void, onForward?:(m:Message)=>void, onSave?:(m:Message)=>void, onSelect?:(m:Message)=>void, isSelected?:boolean,
  onImageClick?:(url:string, name:string, all:{url:string,name:string}[], idx:number)=>void,
  savedIds?:Set<number>, onPin?:(m:Message)=>void
}) {
  const content = msg.is_deleted ? 'Message deleted' : msg.content
  const imgAtts = msg.attachments.filter(a=> a.mime_type.startsWith('image/'))
  const fileAtts = msg.attachments.filter(a=> !a.mime_type.startsWith('image/'))
  const isSaved = savedIds?.has(msg.id)
  const [showMenu, setShowMenu]=useState(false)
  const safeCopy = onCopy || ((t:string)=> navigator.clipboard.writeText(t))
  const safeForward = onForward || (()=>{})
  const safeSave = onSave || (()=>{})
  const safeSelect = onSelect || (()=>{})
  const safeImageClick = onImageClick || ((url:string, name:string)=> window.open(url, '_blank'))

  const allImages = imgAtts.map(a=> ({ url: a.file_path.startsWith('/api') ? a.file_path : `/api/uploads/file/${a.filename}`, name: a.original_filename }))

  return (
    <div className={`flex ${isOwn?'justify-end':'justify-start'} group px-2 sm:px-4 py-1 overflow-hidden ${isSelected ? 'bg-primary/5' : ''}`}>
      <div className="flex items-center mr-1 shrink-0">
        {onSelect && <input type="checkbox" checked={!!isSelected} onChange={()=> safeSelect(msg)} className={`w-4 h-4 rounded border ${isSelected ? 'block' : 'hidden group-hover:block'}`} />}
      </div>
      <div className={`max-w-[85%] sm:max-w-[78%] md:max-w-[68%] lg:max-w-[62%] xl:max-w-[60%] relative min-w-0 ${isOwn?'items-end':'items-start'} flex flex-col`}>
        {isGroup && !isOwn && showAvatar && <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 mb-1 ml-1">{msg.sender_display_name}</span>}
        {msg.reply_to_content && (
          <div className={`text-xs px-3 py-1.5 rounded-t-xl border-l-2 -mb-1 mx-1 ${isOwn?'bg-primary/10 border-primary text-muted-foreground':'bg-muted border-muted-foreground'}`}>
            <span className="line-clamp-1 italic">↳ {msg.reply_to_content}</span>
          </div>
        )}
        <div className={`relative px-3.5 py-2.5 rounded-2xl shadow-sm text-sm leading-relaxed break-words break-all sm:break-words overflow-hidden
          ${msg.is_deleted ? 'bg-muted text-muted-foreground italic border border-dashed' : isOwn ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-card border rounded-bl-md'}`}>
          {imgAtts.length>0 && !msg.is_deleted && (
            <div className={`grid gap-1 mb-2 -mx-1 ${imgAtts.length>1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {imgAtts.map((img,i)=> {
                const url = img.file_path.startsWith('/api') ? img.file_path : `/api/uploads/file/${img.filename}`
                return <img key={img.id} src={url} alt={img.original_filename} className="rounded-xl max-h-64 w-full object-cover cursor-pointer" onClick={()=> safeImageClick(url, img.original_filename, allImages, i)} />
              })}
            </div>
          )}
          {fileAtts.map(f=> {
            const href = f.file_path.startsWith('/api') ? f.file_path : `/api/uploads/file/${f.filename}`
            return (
              <a key={f.id} href={href} target="_blank" rel="noreferrer" className={`flex items-center gap-2 p-2 rounded-xl mb-2 ${isOwn?'bg-white/15':'bg-muted'}`}>
                <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center text-xs">📄</div>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{f.original_filename}</p>
                  <p className="text-[11px] opacity-70">{(f.file_size/1024).toFixed(1)} KB • <span className="underline">Download</span></p>
                </div>
              </a>
            )
          })}
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] selectable">{content}</p>
          {!msg.is_deleted && content && hasUrl(content) && extractUrls(content).map((url, i) => <LinkPreview key={i} url={url} />)}
          {(msg as any).is_pinned && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-primary/70"><Pin className="w-3 h-3" /> Pinned</div>
          )}
          {msg.reactions.length>0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {Object.entries(msg.reactions.reduce((acc:any, r)=>{
                acc[r.emoji]=(acc[r.emoji]||0)+1
                return acc
              }, {})).map(([emoji, count]:any)=>(
                <span key={emoji} className="px-1.5 py-0.5 rounded-full bg-background border text-xs shadow-sm">{emoji} {count as number}</span>
              ))}
            </div>
          )}
          <div className={`flex items-center gap-1 mt-1 text-[11px] ${isOwn?'text-primary-foreground/70 justify-end':'text-muted-foreground'}`}>
            <span>{formatTime(msg.created_at)}</span>
            {msg.is_edited && !msg.is_deleted && <span className="italic">• edited</span>}
            {isOwn && !msg.is_deleted && (
              <span className="ml-1">
                {msg.status==='read' ? <CheckCheck className="w-3.5 h-3.5 text-sky-200"/> : msg.status==='delivered' ? <CheckCheck className="w-3.5 h-3.5 opacity-70"/> : <Check className="w-3.5 h-3.5 opacity-70"/>}
              </span>
            )}
          </div>
          <div className={`absolute ${isOwn?'left-0 -translate-x-full':'right-0 translate-x-full'} top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 p-1 rounded-full bg-card border shadow-lg z-10`}>
            {REACTIONS.slice(0,3).map(e=> (
              <button key={e} onClick={()=>onReact(msg.id,e)} className="p-1.5 hover:bg-muted rounded-full text-xs">{e}</button>
            ))}
            <div className="w-px h-5 bg-border mx-1"/>
            <button onClick={()=>onReply(msg)} className="p-1.5 hover:bg-muted rounded-full" title="Reply"><Reply className="w-3.5 h-3.5"/></button>
            <button onClick={()=>setShowMenu(!showMenu)} className="p-1.5 hover:bg-muted rounded-full" title="More"><MoreHorizontal className="w-3.5 h-3.5"/></button>
            {isOwn && !msg.is_deleted && <>
              <button onClick={()=>onEdit(msg)} className="p-1.5 hover:bg-muted rounded-full" title="Edit"><Edit3 className="w-3.5 h-3.5"/></button>
              <button onClick={()=>onDelete(msg)} className="p-1.5 hover:bg-muted rounded-full text-destructive" title="Delete"><Trash2 className="w-3.5 h-3.5"/></button>
            </>}
          </div>
          {showMenu && (
            <div className={`absolute ${isOwn?'left-0' : 'right-0'} top-full mt-2 w-44 rounded-xl bg-card border shadow-xl py-1 z-20 text-sm`}>
              <button onClick={()=>{ safeCopy(content||''); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Copy className="w-3.5 h-3.5"/> Copy</button>
              <button onClick={()=>{ safeForward(msg); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Forward className="w-3.5 h-3.5"/> Forward</button>
              <button onClick={()=>{ safeSave(msg); setShowMenu(false)}} className={`w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 ${isSaved? 'text-primary' : ''}`}><Bookmark className="w-3.5 h-3.5"/> {isSaved? 'Unsave':'Save'}</button>
              {onPin && <button onClick={()=>{ onPin(msg); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Pin className="w-3.5 h-3.5"/> {(msg as any).is_pinned ? 'Unpin' : 'Pin'}</button>}
              <button onClick={()=>{ safeSelect(msg); setShowMenu(false)}} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"><Flag className="w-3.5 h-3.5"/> Select</button>
              <div className="border-t my-1"/>
              <div className="px-3 py-1 flex gap-1">
                {REACTIONS.map(e=> <button key={e} onClick={()=>{onReact(msg.id,e); setShowMenu(false)}} className="flex-1 p-1 hover:bg-muted rounded text-xs">{e}</button>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
