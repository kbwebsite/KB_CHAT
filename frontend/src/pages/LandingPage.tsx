import { Suspense, lazy, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Users, Shield, Zap, Image as ImageIcon, Smartphone, ArrowRight, Check, Download } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useAuthStore } from '../store/auth'
import { isNativeApp } from '../services/api'

gsap.registerPlugin(ScrollTrigger)

const Spline = lazy(() => import('@splinetool/react-spline'))
const RiveBadge = lazy(() => import('../components/RiveBadge'))

const SPLINE_SCENE = import.meta.env.VITE_SPLINE_SCENE_URL as string | undefined
const RIVE_SRC = import.meta.env.VITE_RIVE_SRC as string | undefined

// Free Android build (signed APK, GitHub Release asset — no Play account needed).
const APK_VERSION = '1.2.0'
const APK_URL = `https://github.com/kbwebsite/KB_CHAT/releases/download/v${APK_VERSION}/kryzen-v${APK_VERSION}.apk`

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

type Particle = { id: number; left: string; size: number; duration: number; delay: number; color: string }

const Particles = memo(function Particles() {
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: `${(i * 53 + 7) % 100}%`,
        size: 2 + ((i * 7) % 4),
        duration: 12 + ((i * 5) % 18),
        delay: (i * 1.7) % 15,
        color: i % 3 === 0 ? 'hsl(263 70% 65%)' : i % 3 === 1 ? 'hsl(199 89% 60%)' : 'hsl(340 75% 60%)',
      })),
    []
  )
  return (
    <div className="lp-particles" aria-hidden="true">
      {particles.map(p => (
        <span
          key={p.id}
          className="lp-particle"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            background: p.color,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  )
})

const FEATURES = [
  { icon: Zap, title: 'Real-time messaging', desc: 'Instant delivery with typing indicators, read receipts and presence.', span: 'lg:col-span-2' },
  { icon: Users, title: 'Groups', desc: 'Create groups, manage roles, add members and collaborate.', span: '' },
  { icon: ImageIcon, title: 'Media sharing', desc: 'Share images, PDFs and files securely with previews.', span: '' },
  { icon: Shield, title: 'Privacy-focused', desc: 'Secure auth, protected routes, and thoughtful data handling.', span: 'lg:col-span-2' },
  { icon: Smartphone, title: 'Responsive', desc: 'Flawless experience on desktop, tablet and mobile.', span: '' },
  { icon: MessageCircle, title: 'Delightful UX', desc: 'Clean, modern design with light and dark themes.', span: '' },
]

export default function LandingPage() {
  const { user } = useAuthStore()
  // The APK download is for web visitors only — inside the native app it
  // would offer to download the app you're already running.
  const showApk = !isNativeApp()
  const rootRef = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()

  // Motion: one orchestrated hero entrance (timeline) + floating preview.
  // Transform + opacity only; skipped entirely under reduced-motion.
  useLayoutEffect(() => {
    if (reducedMotion || !rootRef.current) return
    const mm = gsap.matchMedia()
    mm.add(
      {
        isDesktop: '(min-width: 1024px)',
        isCoarse: '(pointer: coarse)',
        reduce: '(prefers-reduced-motion: reduce)',
      },
      context => {
        if (context.conditions?.reduce) return
        const tl = gsap.timeline({ defaults: { duration: 0.7, ease: 'power3.out' } })
        tl.from('.lp-hero-el', { y: 28, autoAlpha: 0, stagger: 0.08, clearProps: 'transform,visibility' }, 'intro')
        tl.from('.lp-preview', { y: 32, autoAlpha: 0, scale: 0.98, duration: 0.9, clearProps: 'scale' }, 'intro+=0.15')
        if (!context.conditions?.isCoarse) {
          gsap.to('.lp-preview-float', { y: -10, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1, overwrite: 'auto' })
        }
        return () => {
          tl.kill()
          gsap.killTweensOf('.lp-preview-float')
        }
      }
    )
    return () => mm.revert()
  }, [reducedMotion])

  // Motion: scroll reveals via ScrollTrigger.batch (single trigger family).
  useEffect(() => {
    if (reducedMotion || !rootRef.current) return
    const els = Array.from(rootRef.current.querySelectorAll<HTMLElement>('.lp-reveal'))
    if (els.length === 0) return
    gsap.set(els, { y: 28, autoAlpha: 0 })
    const batch = ScrollTrigger.batch(els, {
      start: 'top 88%',
      once: true,
      onEnter: targets => gsap.to(targets, { y: 0, autoAlpha: 1, duration: 0.7, ease: 'power3.out', stagger: 0.06, overwrite: true, clearProps: 'transform' }),
    })
    ScrollTrigger.refresh()
    return () => {
      batch.forEach(t => t.kill())
      ScrollTrigger.getAll().forEach(t => {
        if (els.includes(t.trigger as HTMLElement)) t.kill()
      })
    }
  }, [reducedMotion])

  // Motion: subtle orb parallax + magnetic CTAs (pointer:fine only, transform only).
  useEffect(() => {
    if (reducedMotion || !rootRef.current) return
    if (window.matchMedia('(pointer: coarse)').matches) return
    const orbs = rootRef.current.querySelectorAll('.lp-orb')
    const onMove = (e: MouseEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5
      const ny = e.clientY / window.innerHeight - 0.5
      if (orbs.length > 0) {
        gsap.to(orbs, {
          x: (i: number) => nx * (18 + i * 12),
          y: (i: number) => ny * (14 + i * 10),
          duration: 1.2,
          ease: 'power2.out',
          overwrite: 'auto',
        })
      }
    }
    window.addEventListener('mousemove', onMove)

    const btns = Array.from(rootRef.current.querySelectorAll<HTMLElement>('.lp-magnetic'))
    const cleanups: Array<() => void> = []
    btns.forEach(btn => {
      const move = (e: MouseEvent) => {
        const r = btn.getBoundingClientRect()
        const x = e.clientX - (r.left + r.width / 2)
        const y = e.clientY - (r.top + r.height / 2)
        gsap.to(btn, { x: x * 0.12, y: y * 0.18, duration: 0.4, ease: 'power3.out', overwrite: 'auto' })
      }
      const leave = () => gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'power3.out', overwrite: 'auto' })
      btn.addEventListener('mousemove', move)
      btn.addEventListener('mouseleave', leave)
      cleanups.push(() => {
        btn.removeEventListener('mousemove', move)
        btn.removeEventListener('mouseleave', leave)
      })
    })
    return () => {
      window.removeEventListener('mousemove', onMove)
      cleanups.forEach(fn => fn())
      gsap.killTweensOf(orbs)
      gsap.killTweensOf(btns)
    }
  }, [reducedMotion])

  return (
    <div ref={rootRef} className="lp-root min-h-screen flex flex-col relative overflow-hidden">
      <a href="#main" className="lp-skip">
        Skip to content
      </a>

      {SPLINE_SCENE ? (
        <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden="true">
          <Suspense fallback={null}>
            <Spline scene={SPLINE_SCENE} renderOnDemand={true} />
          </Suspense>
        </div>
      ) : null}

      <div className="lp-orbs" aria-hidden="true">
        <div className="lp-orb lp-orb-a" />
        <div className="lp-orb lp-orb-b" />
        <div className="lp-orb lp-orb-c" />
      </div>
      <Particles />

      <header className="lp-header sticky top-0 z-10">
        <nav aria-label="Primary" className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link to="/" className="flex items-center gap-2.5 rounded-lg" aria-label="Kryzen home">
              <img src="/kryzen-logo.svg" alt="" className="w-9 h-9 rounded-xl" />
              <span className="font-bold text-lg tracking-tight lp-brand">Kryzen</span>
            </Link>
            <span className="hidden sm:inline text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">V1.2</span>
            {RIVE_SRC ? (
              <Suspense fallback={null}>
                <RiveBadge src={RIVE_SRC} />
              </Suspense>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to="/chat" className="lp-magnetic lp-cta-primary px-4 py-2 rounded-full text-white text-sm font-medium inline-flex items-center gap-1.5 min-h-[44px]">
                Open Chat <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            ) : (
              <>
                <Link to="/login" className="lp-magnetic lp-cta-secondary px-4 py-2 rounded-full text-sm font-medium inline-flex items-center min-h-[44px]">
                  Sign In
                </Link>
                <Link to="/signup" className="lp-magnetic lp-cta-primary px-5 py-2.5 rounded-full text-white text-sm font-semibold inline-flex items-center min-h-[44px]">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main id="main" className="flex-1 relative z-10">
        <section aria-labelledby="hero-title" className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-10 sm:py-20">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <p className="lp-hero-el inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
                Fast, secure messaging
              </p>
              <h1
                id="hero-title"
                className="lp-hero-el mt-4 text-4xl sm:text-5xl font-extrabold leading-[1.02] tracking-tight lp-gradient-text"
              >
                Connect. Chat. Share.
              </h1>
              <p className="lp-hero-el mt-4 text-lg text-muted-foreground leading-relaxed max-w-[60ch]">
                Real-time chat with groups, media, and presence. Private by design.
              </p>
              <div className="lp-hero-el mt-8 flex flex-wrap gap-3">
                <Link
                  to={user ? '/chat' : '/signup'}
                  className="lp-magnetic lp-cta-primary px-7 py-3 rounded-full text-white font-semibold inline-flex items-center gap-2 min-h-[48px]"
                >
                  Get Started <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
                {!user ? (
                  <Link to="/login" className="lp-magnetic lp-cta-secondary px-7 py-3 rounded-full font-semibold inline-flex items-center min-h-[48px]">
                    Sign In
                  </Link>
                ) : null}
                {showApk ? (
                <a
                  href={APK_URL}
                  className="lp-magnetic lp-cta-secondary px-7 py-3 rounded-full font-semibold inline-flex items-center gap-2 min-h-[48px]"
                >
                  <Smartphone className="w-4 h-4" aria-hidden="true" /> Android app
                </a>
                ) : null}
              </div>
              {showApk ? (
              <p className="lp-hero-el mt-3 text-xs text-muted-foreground">
                Free download · v{APK_VERSION} · direct APK, no account needed
              </p>
              ) : null}
              <ul aria-label="Highlights" className="lp-hero-el mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" /> E2E-ready architecture
                </li>
                <li aria-hidden="true">•</li>
                <li>No ads, no trackers</li>
              </ul>
            </div>
            <div className="lp-hero-el lp-preview relative">
              <div className="absolute -inset-4 bg-gradient-to-br from-primary/15 to-accent/10 rounded-[2rem] blur-2xl" aria-hidden="true" />
              <div className="lp-preview-float lp-preview-card overflow-hidden relative z-10" role="img" aria-label="Preview of a Kryzen conversation with text and image messages">
                <div className="h-12 flex items-center gap-2 px-4 border-b border-border/50 bg-card/80">
                  <span className="w-3 h-3 rounded-full bg-red-400" aria-hidden="true" />
                  <span className="w-3 h-3 rounded-full bg-yellow-400" aria-hidden="true" />
                  <span className="w-3 h-3 rounded-full bg-green-400" aria-hidden="true" />
                  <span className="ml-3 text-xs font-medium text-muted-foreground">Kryzen — Preview</span>
                  <span className="ml-auto flex items-center gap-1" aria-hidden="true">
                    <span className="lp-typing-dot" />
                    <span className="lp-typing-dot" />
                    <span className="lp-typing-dot" />
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 shrink-0" aria-hidden="true" />
                    <div className="lp-msg-in rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[70%]">
                      <p className="text-sm">Hey! Are we still meeting tomorrow?</p>
                      <p className="text-[11px] text-muted-foreground mt-1">10:42 AM</p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <div className="lp-msg-out text-white rounded-2xl rounded-br-md px-4 py-2.5 max-w-[70%]">
                      <p className="text-sm">Absolutely! Can&apos;t wait</p>
                      <p className="text-[11px] text-white/70 mt-1 text-right">10:43 AM ✓✓</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 shrink-0" aria-hidden="true" />
                    <div className="lp-msg-in rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[70%]">
                      <p className="text-sm">Check this design I made</p>
                      <div className="mt-2 w-40 h-24 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs" aria-hidden="true">
                        Image Preview
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-2 pt-2 border-t border-border/40" aria-hidden="true">
                    <div className="flex-1 h-9 rounded-full bg-muted/60" />
                    <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground">➤</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Trust" className="max-w-6xl mx-auto px-4 sm:px-6 pb-4">
          <ul className="lp-reveal flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            {['No ads', 'Typing + presence', 'Groups + roles', 'Image + file sharing', 'Light / dark themes'].map(t => (
              <li key={t} className="px-3 py-1.5 rounded-full border border-border/40 bg-card/60 inline-flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" /> {t}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="features-title" className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <h2 id="features-title" className="lp-reveal text-2xl sm:text-3xl font-bold tracking-tight">
            Everything for meaningful chat
          </h2>
          <p className="lp-reveal mt-2 text-sm text-muted-foreground max-w-[65ch]">Six focused capabilities. No bloat, no noise.</p>
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(card => (
              <article key={card.title} className={`lp-reveal lp-feature-card p-5 ${card.span}`}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary border border-primary/20">
                  <card.icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <h3 className="font-semibold mt-3 tracking-tight">{card.title}</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{card.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="secure-title" className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="lp-reveal lp-secure grid lg:grid-cols-2 gap-8 items-center p-6 sm:p-10 rounded-[2rem]">
            <div>
              <h2 id="secure-title" className="text-2xl sm:text-3xl font-bold tracking-tight">Private by design, fast by default</h2>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-[60ch]">
                JWT auth with protected routes, validated uploads, and WebSocket presence. Your conversations stay yours.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm">
                {['JWT + bcrypt auth, invite links with expiry', 'WebSocket events: message, typing, presence, read', 'Validated uploads with image previews'].map(t => (
                  <li key={t} className="flex items-start gap-2">
                    <Check className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" aria-hidden="true" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to={user ? '/chat' : '/signup'} className="lp-magnetic lp-cta-primary px-6 py-3 rounded-full text-white text-sm font-semibold inline-flex items-center gap-2 min-h-[48px]">
                  Get Started <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
            <div className="lp-status-card rounded-2xl p-5" aria-label="Delivery states">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Delivery states</p>
              <ul className="mt-4 space-y-3 text-sm">
                {[
                  ['Sending', 'Queued on your device'],
                  ['Sent', 'Reached the server'],
                  ['Delivered', 'On your friend’s device'],
                  ['Read', 'Seen, with receipt'],
                ].map(([s, d]) => (
                  <li key={s} className="flex items-center justify-between gap-4 border-b border-border/40 pb-3 last:border-0 last:pb-0">
                    <span className="font-medium">{s}</span>
                    <span className="text-muted-foreground text-xs sm:text-sm text-right">{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/40 py-8 text-center text-xs text-muted-foreground relative z-10 px-4">
        <p>© 2026 Kryzen • Connect. Chat. Share. • Built with FastAPI + React • Not affiliated with WhatsApp.</p>
        <p className="mt-2">
          <Link to="/login" className="underline underline-offset-4 rounded px-1 py-1">Sign In</Link>
          {' • '}
          <Link to="/signup" className="underline underline-offset-4 rounded px-1 py-1">Get Started</Link>
          {showApk ? (
            <>
          {' • '}
          <a href={APK_URL} className="underline underline-offset-4 rounded px-1 py-1 inline-flex items-center gap-1">
            <Download className="w-3 h-3" aria-hidden="true" /> Android app (APK)
          </a>
            </>
          ) : null}
        </p>
      </footer>
    </div>
  )
}
