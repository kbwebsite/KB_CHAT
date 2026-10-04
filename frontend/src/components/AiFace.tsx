export type AiFaceState = 'idle' | 'thinking' | 'working'

/**
 * Animated AI face: a small bot with blinking eyes and a smile.
 * - idle: slow blink, gentle bob
 * - thinking: eyes dart side to side, orbit sparkles, "figuring it out"
 * - working: happy arc eyes, scan sweep, pulse ring ("writing the reply")
 * Pure SVG + CSS, no assets. Respects prefers-reduced-motion via CSS.
 */
export function AiFace({
  state = 'idle',
  size = 40,
  label,
}: {
  state?: AiFaceState
  size?: number
  label?: string
}) {
  return (
    <div
      className={`ai-face ai-face-${state}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `AI ${state}`}
    >
      <span className="ai-orbit" aria-hidden>
        <i />
        <i />
      </span>
      <span className="ai-ring" aria-hidden />
      <svg viewBox="0 0 48 48" width="72%" height="72%" aria-hidden>
        {state === 'working' ? (
          <g className="ai-eyes" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" fill="none">
            <path d="M12.5 22 Q17 17 21.5 22" />
            <path d="M26.5 22 Q31 17 35.5 22" />
          </g>
        ) : (
          <g className="ai-eyes" fill="#fff">
            <ellipse cx="17" cy="21.5" rx="3.4" ry="4.4" />
            <ellipse cx="31" cy="21.5" rx="3.4" ry="4.4" />
          </g>
        )}
        {state === 'thinking' ? (
          <circle cx="24" cy="31.5" r="2.6" fill="none" stroke="#fff" strokeWidth={2.4} />
        ) : (
          <path
            d="M18.5 30 Q24 35 29.5 30"
            fill="none"
            stroke="#fff"
            strokeWidth={2.6}
            strokeLinecap="round"
          />
        )}
      </svg>
      <span className="ai-scan" aria-hidden />
    </div>
  )
}
