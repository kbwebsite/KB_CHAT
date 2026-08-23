export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className}`} />
}

export function ChatSkeleton() {
  return (
    <div className="space-y-3 p-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="w-11 h-11 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function MessageSkeleton() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-12 w-2/3 rounded-2xl" />
      <Skeleton className="h-12 w-1/2 rounded-2xl ml-auto" />
      <Skeleton className="h-16 w-3/4 rounded-2xl" />
    </div>
  )
}

export function StatusSkeleton() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  )
}
