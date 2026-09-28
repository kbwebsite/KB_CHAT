import { useMemo, useState } from 'react'
import { useRive } from '@rive-app/react-canvas'

export default function RiveBadge({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  const params = useMemo(
    () => ({
      src,
      autoplay: true,
      onLoadError: () => setFailed(true),
    }),
    [src]
  )
  const { RiveComponent } = useRive(params)
  if (failed) return null
  return (
    <div className="h-8 w-8 overflow-hidden rounded-lg border border-primary/20 bg-primary/5" title="Kryzen motion badge">
      <RiveComponent />
    </div>
  )
}
