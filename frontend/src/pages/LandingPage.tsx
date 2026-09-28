import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Users, Shield, Zap, Image as ImageIcon, Smartphone, ArrowRight } from 'lucide-react'
import gsap from 'gsap'
import { animate, stagger } from 'animejs'
import { useAuthStore } from '../store/auth'

const Spline = lazy(() => import('@splinetool/react-spline'))
const RiveBadge = lazy(() => import('../components/RiveBadge'))

const SPLINE_SCENE = import.meta.env.VITE_SPLINE_SCENE_URL as string | undefined
const RIVE_SRC = import.meta.env.VITE_RIVE_SRC as string | undefined

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

function Particles() {
  const particles = useMemo(
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
    <div className="particles-container" aria-hidden="true">
      {particles.map(p => (
        <div
          key={p.id}
          className="particle"
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
}

export default function LandingPage() {
  const { user } = useAuthStore()
  const rootRef = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()

  // GSAP: hero entrance + floating preview + scroll reveals
  useLayoutEffect(() => {
    if (reducedMotion || !rootRef.current) return
    const ctx = gsap.context(() => {
      gsap.from('.kryzen-hero-el', {
        y: 26,
        opacity: 0,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.09,
        delay: 0.1,
        clearProps: 'transform',
      })
      gsap.to('.kryzen-preview', {
        y: -10,
        duration: 2.6,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      })
    }, rootRef)
    return () => ctx.revert()
  }, [reducedMotion])

  // GSAP: scroll reveals via IntersectionObserver (no ScrollTrigger plugin needed)
  useEffect(() => {
    if (reducedMotion || !rootRef.current) return
    const els = Array.from(rootRef.current.querySelectorAll<HTMLElement>('.kryzen-reveal'))
    if (els.length === 0) return
    gsap.set(els, { y: 28, opacity: 0 })
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            gsap.to(entry.target, { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', overwrite: true })
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15 }
    )
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [reducedMotion])

  // Anime.js: magnetic CTA buttons + typing-dot pulse (v4 API)
  useEffect(() => {
    if (reducedMotion || !rootRef.current) return
    const cleanups: Array<() => void> = []

    const dots = rootRef.current.querySelectorAll('.kryzen-typing-dot')
    if (dots.length > 0) {
      const anim = animate(dots, {
        scale: [{ to: 1.6 }, { to: 1 }],
        opacity: [{ to: 1 }, { to: 0.4 }],
        duration: 600,
        delay: stagger(150),
        loop: true,
        ease: 'out(3)',
      })
      cleanups.push(() => anim.revert?.())
    }

    const btns = Array.from(rootRef.current.querySelectorAll<HTMLElement>('.kryzen-magnetic'))
    btns.forEach(btn => {
      const onMove = (e: MouseEvent) => {
        const r = btn.getBoundingClientRect()
        const x = e.clientX - (r.left + r.width / 2)
        const y = e.clientY - (r.top + r.height / 2)
        animate(btn, { x: x * 0.12, y: y * 0.18, duration: 400, ease: 'out(3)' })
      }
      const onLeave = () => animate(btn, { x: 0, y: 0, duration: 600, ease: 'out(3)' })
      btn.addEventListener('mousemove', onMove)
      btn.addEventListener('mouseleave', onLeave)
      cleanups.push(() => {
        btn.removeEventListener('mousemove', onMove)
        btn.removeEventListener('mouseleave', onLeave)
      })
    })

    return () => cleanups.forEach(fn => fn())
  }, [reducedMotion])

  // GSAP: subtle orb parallax on desktop pointers
  useEffect(() => {
    if (reducedMotion || !rootRef.current) return
    if (window.matchMedia('(pointer: coarse)').matches) return
    const orbs = rootRef.current.querySelectorAll('.landing-orb')
    if (orbs.length === 0) return
    const onMove = (e: MouseEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5
      const ny = e.clientY / window.innerHeight - 0.5
      gsap.to(orbs, { x: (i: number) => nx * (18 + i * 12), y: (i: number) => ny * (14 + i * 10), duration: 1.2, ease: 'power2.out', overwrite: 'auto' })
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [reducedMotion])

  return (
    <div ref={rootRef} className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Optional Spline 3D backdrop — set VITE_SPLINE_SCENE_URL to enable */}
      {SPLINE_SCENE ? (
        <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden="true">
          <Suspense fallback={null}>
            <Spline scene={SPLINE_SCENE} renderOnDemand={true} />
          </Suspense>
        </div>
      ) : null}

      {/* Floating orbs background */}
      <div className="landing-orbs" aria-hidden="true">
        <div className="landing-orb" />
        <div className="landing-orb" />
        <div className="landing-orb" />
      </div>
      <Particles />

      <header className="landing-header sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/kryzen-logo.svg" alt="Kryzen" className="w-9 h-9 rounded-xl" />
            <span className="font-bold text-lg tracking-tight landing-hero-title">Kryzen</span>
            <span className="hidden sm:inline text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">V1</span>
            {RIVE_SRC ? (
              <Suspense fallback={null}>
                <RiveBadge src={RIVE_SRC} />
              </Suspense>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to="/chat" className="kryzen-magnetic landing-cta-primary px-4 py-2 rounded-full text-white text-sm font-medium flex items-center gap-1.5">Open Chat <ArrowRight className="w-4 h-4"/></Link>
            ) : (
              <>
                <Link to="/login" className="kryzen-magnetic landing-cta-secondary px-4 py-2 rounded-full text-sm font-medium">Sign In</Link>
                <Link to="/signup" className="kryzen-magnetic landing-cta-primary px-5 py-2.5 rounded-full text-white text-sm font-semibold">Get Started</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 relative z-10">
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="kryzen-hero-el hero-entrance inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">Fast • Secure • Modern</div>
              <h1 className="kryzen-hero-el mt-4 text-4xl sm:text-5xl font-extrabold leading-[0.95] tracking-tight hero-entrance-delay gradient-text-animated" style={{fontFamily:'Plus Jakarta Sans, Inter, sans-serif'}}>
                Kryzen<br/>
                Connect. Chat. Share.
              </h1>
              <p className="kryzen-hero-el mt-4 text-lg text-muted-foreground leading-relaxed hero-entrance-delay-2">A fast, modern messaging platform built for simple and meaningful communication. Real-time, private, and beautifully crafted.</p>
              <div className="kryzen-hero-el mt-8 flex flex-wrap gap-3 hero-entrance-delay-3">
                <Link to={user?"/chat":"/signup"} className="kryzen-magnetic landing-cta-primary px-7 py-3 rounded-full text-white font-semibold flex items-center gap-2">Get Started <ArrowRight className="w-4 h-4"/></Link>
                <Link to="/login" className="kryzen-magnetic landing-cta-secondary px-7 py-3 rounded-full font-semibold">Sign In</Link>
              </div>
              <div className="kryzen-hero-el mt-6 flex items-center gap-4 text-xs text-muted-foreground hero-entrance-delay-4">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/> End-to-end ready architecture</span>
                <span>•</span><span>No ads • No trackers</span>
              </div>
            </div>
            <div className="kryzen-hero-el relative hero-entrance-delay-2">
              <div className="absolute -inset-4 bg-gradient-to-br from-primary/15 to-accent/10 rounded-[2rem] blur-2xl" />
              <div className="kryzen-preview landing-preview-card preview-glow preview-float overflow-hidden relative z-10">
                <div className="h-12 flex items-center gap-2 px-4 border-b border-[var(--k-border)]/50" style={{background:'hsl(var(--k-surface) / 0.8)'}}>
                  <span className="w-3 h-3 rounded-full bg-red-400"/><span className="w-3 h-3 rounded-full bg-yellow-400"/><span className="w-3 h-3 rounded-full bg-green-400"/>
                  <span className="ml-3 text-xs font-medium text-muted-foreground">Kryzen — Preview</span>
                  <span className="ml-auto flex items-center gap-1" aria-hidden="true">
                    <span className="kryzen-typing-dot w-1.5 h-1.5 rounded-full bg-primary/70" />
                    <span className="kryzen-typing-dot w-1.5 h-1.5 rounded-full bg-primary/70" />
                    <span className="kryzen-typing-dot w-1.5 h-1.5 rounded-full bg-primary/70" />
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 shadow-md" />
                    <div className="landing-preview-msg-in rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[70%]"><p className="text-sm">Hey! Are we still meeting tomorrow?</p><p className="text-[11px] text-muted-foreground mt-1">10:42 AM</p></div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <div className="landing-preview-msg-out text-white rounded-2xl rounded-br-md px-4 py-2.5 max-w-[70%]"><p className="text-sm">Absolutely! Can't wait</p><p className="text-[11px] text-white/70 mt-1 text-right">10:43 AM ✓✓</p></div>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 shadow-md" />
                    <div className="landing-preview-msg-in rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[70%]"><p className="text-sm">Check this design I made ✨</p><div className="mt-2 w-40 h-24 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs shadow-inner">Image Preview</div></div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <div className="landing-preview-msg-out text-white rounded-2xl rounded-br-md px-4 py-2.5"><p className="text-sm">Love it! ❤️</p></div>
                  </div>
                  <div className="flex items-center gap-2 px-2 pt-2 border-t border-[var(--k-border)]/40">
                    <div className="flex-1 h-9 rounded-full" style={{background:'hsl(var(--k-surface-2) / 0.6)'}} />
                    <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">➤</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-in">
            {[
              {icon: Zap, title:'Real-time messaging', desc:'Instant delivery with typing indicators, read receipts and presence.'},
              {icon: Users, title:'Groups', desc:'Create groups, manage roles, add members and collaborate.'},
              {icon: ImageIcon, title:'Media sharing', desc:'Share images, PDFs and files securely with previews.'},
              {icon: Shield, title:'Privacy-focused', desc:'Secure auth, protected routes, and thoughtful data handling.'},
              {icon: Smartphone, title:'Responsive', desc:'Flawless experience on desktop, tablet and mobile.'},
              {icon: MessageCircle, title:'Delightful UX', desc:'Clean, modern design with light/dark themes.'},
            ].map(card=> (
              <div key={card.title} className="kryzen-reveal landing-feature-card p-5">
                <div className="icon-wrap w-10 h-10 rounded-xl flex items-center justify-center text-primary"><card.icon className="w-5 h-5"/></div>
                <h3 className="font-semibold mt-3 tracking-tight">{card.title}</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--k-border)]/40 py-8 text-center text-xs text-muted-foreground relative z-10">
        <p>© 2026 Kryzen • Connect. Chat. Share. • Built with FastAPI + React • Not affiliated with WhatsApp.</p>
      </footer>
    </div>
  )
}
