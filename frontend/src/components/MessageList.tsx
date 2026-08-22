import { useEffect, useRef } from 'react'
import { Message } from '../types'
import { MessageBubble } from './MessageBubble'
import { LoadingState } from './LoadingState'

export function MessageList({ messages, currentUserId, isGroup, hasMore, loading, onLoadMore, onReply, onEdit, onDelete, onReact }: {
  messages: Message[], currentUserId?:number, isGroup:boolean, hasMore:boolean, loading:boolean,
  onLoadMore:()=>void, onReply:any, onEdit:any, onDelete:any, onReact:any
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(()=>{
    bottomRef.current?.scrollIntoView({behavior:'smooth'})
  }, [messages.length])

  const handleScroll = ()=>{
    const el = containerRef.current
    if (!el) return
    if (el.scrollTop < 80 && hasMore && !loading) onLoadMore()
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.04)_1px,transparent_0)] dark:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.04)_1px,transparent_0)] bg-[size:20px_20px] flex flex-col">
      {loading && messages.length===0 ? <LoadingState text="Loading messages..." /> : null}
      {hasMore && <div className="text-center py-2"><button onClick={onLoadMore} className="text-xs px-3 py-1 rounded-full bg-muted hover:bg-accent">Load older messages</button></div>}
      <div className="flex-1" />
      <div className="py-2 space-y-0.5">
        {messages.map((msg, idx)=>{
          const prev = messages[idx-1]
          const isOwn = msg.sender_id === currentUserId
          const showAvatar = isGroup && (!prev || prev.sender_id !== msg.sender_id)
          return <MessageBubble key={msg.id} msg={msg} isOwn={!!isOwn} isGroup={isGroup} showAvatar={showAvatar} onReply={onReply} onEdit={onEdit} onDelete={onDelete} onReact={onReact} />
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
