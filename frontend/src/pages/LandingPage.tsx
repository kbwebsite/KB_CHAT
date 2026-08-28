import { Link } from 'react-router-dom'
import { MessageCircle, Users, Shield, Zap, Image as ImageIcon, Smartphone, ArrowRight } from 'lucide-react'
import { useAuthStore } from '../store/auth'

export default function LandingPage() {
  const { user } = useAuthStore()
  return (
    <div className="min-h-screen flex flex-col">
      <header className="landing-header sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/kryzen-logo.svg" alt="Kryzen" className="w-9 h-9 rounded-xl" />
            <span className="font-bold text-lg tracking-tight landing-hero-title">Kryzen</span>
            <span className="hidden sm:inline text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">V1</span>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to="/chat" className="landing-cta-primary px-4 py-2 rounded-full text-white text-sm font-medium flex items-center gap-1.5">Open Chat <ArrowRight className="w-4 h-4"/></Link>
            ) : (
              <>
                <Link to="/login" className="landing-cta-secondary px-4 py-2 rounded-full text-sm font-medium">Sign In</Link>
                <Link to="/signup" className="landing-cta-primary px-5 py-2.5 rounded-full text-white text-sm font-semibold">Get Started</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">Fast • Secure • Modern</div>
              <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold leading-[0.95] tracking-tight landing-hero-title" style={{fontFamily:'Plus Jakarta Sans, Inter, sans-serif'}}>
                Kryzen<br/>
                Connect. Chat. Share.
              </h1>
              <p className="mt-4 text-lg text-muted-foreground leading-relaxed">A fast, modern messaging platform built for simple and meaningful communication. Real-time, private, and beautifully crafted.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={user?"/chat":"/signup"} className="landing-cta-primary px-7 py-3 rounded-full text-white font-semibold flex items-center gap-2">Get Started <ArrowRight className="w-4 h-4"/></Link>
                <Link to="/login" className="landing-cta-secondary px-7 py-3 rounded-full font-semibold">Sign In</Link>
              </div>
              <div className="mt-6 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/> End-to-end ready architecture</span>
                <span>•</span><span>No ads • No trackers</span>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-br from-primary/15 to-accent/10 rounded-[2rem] blur-2xl" />
              <div className="landing-preview-card overflow-hidden">
                <div className="h-12 flex items-center gap-2 px-4 border-b border-[var(--k-border)]/50" style={{background:'hsl(var(--k-surface) / 0.8)'}}>
                  <span className="w-3 h-3 rounded-full bg-red-400"/><span className="w-3 h-3 rounded-full bg-yellow-400"/><span className="w-3 h-3 rounded-full bg-green-400"/>
                  <span className="ml-3 text-xs font-medium text-muted-foreground">Kryzen — Preview</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-orange-500" />
                    <div className="landing-preview-msg-in rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[70%]"><p className="text-sm">Hey! Are we still meeting tomorrow?</p><p className="text-[11px] text-muted-foreground mt-1">10:42 AM</p></div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <div className="landing-preview-msg-out text-white rounded-2xl rounded-br-md px-4 py-2.5 max-w-[70%]"><p className="text-sm">Absolutely! Can't wait</p><p className="text-[11px] text-white/70 mt-1 text-right">10:43 AM ✓✓</p></div>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500" />
                    <div className="landing-preview-msg-in rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[70%]"><p className="text-sm">Check this design I made ✨</p><div className="mt-2 w-40 h-24 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs">Image Preview</div></div>
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {icon: Zap, title:'Real-time messaging', desc:'Instant delivery with typing indicators, read receipts and presence.'},
              {icon: Users, title:'Groups', desc:'Create groups, manage roles, add members and collaborate.'},
              {icon: ImageIcon, title:'Media sharing', desc:'Share images, PDFs and files securely with previews.'},
              {icon: Shield, title:'Privacy-focused', desc:'Secure auth, protected routes, and thoughtful data handling.'},
              {icon: Smartphone, title:'Responsive', desc:'Flawless experience on desktop, tablet and mobile.'},
              {icon: MessageCircle, title:'Delightful UX', desc:'Clean, modern design with light/dark themes.'},
            ].map(card=> (
              <div key={card.title} className="landing-feature-card p-5">
                <div className="icon-wrap w-10 h-10 rounded-xl flex items-center justify-center text-primary"><card.icon className="w-5 h-5"/></div>
                <h3 className="font-semibold mt-3 tracking-tight">{card.title}</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--k-border)]/40 py-8 text-center text-xs text-muted-foreground">
        <p>© 2026 Kryzen • Connect. Chat. Share. • Built with FastAPI + React • Not affiliated with WhatsApp.</p>
      </footer>
    </div>
  )
}
