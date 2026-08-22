export function LoadingState({ text='Loading...' }:{text?:string}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 gap-3">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

export function EmptyState({ icon, title, subtitle }:any) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4 text-muted-foreground">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{subtitle}</p>
    </div>
  )
}

export function ErrorState({ message, onRetry }: {message:string, onRetry?:()=>void}) {
  return (
    <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm flex justify-between items-center">
      <span>{message}</span>
      {onRetry && <button onClick={onRetry} className="px-3 py-1 rounded-lg bg-destructive text-destructive-foreground text-xs">Retry</button>}
    </div>
  )
}
