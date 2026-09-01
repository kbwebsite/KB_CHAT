import { ReactNode } from 'react'

export function ChatLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="app-layout">
      {children}
    </div>
  )
}
