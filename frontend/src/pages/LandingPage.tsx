import { Link } from 'react-router-dom'
import { MessageCircle, Users, Shield, Zap, Image as ImageIcon, Smartphone, ArrowRight } from 'lucide-react'
import { useAuthStore } from '../store/auth'

export default function LandingPage() {
  const { user } = useAuthStore()
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/30">
      <header className="sticky top-0 z-10 backdrop-blur bg-background/70 border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">KB</div>
            <span className="font-bold text-lg tracking-tight" style={{fontFamily:'Plus Jakarta Sans, Inter, sans-serif'}}>Kryzen</span>
            <span className="hidden sm:inline text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">V1</span>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to="/chat" className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-1.5">Open Chat <ArrowRight className="w-4 h-4"/></Link>
            ) : (
              <>
                <Link to="/login" className="px-4 py-2 rounded-full text-sm font-medium hover:bg-muted">Sign In</Link>
                <Link to="/signup" className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90">Get Started</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-700 dark:text-violet-300 text-xs font-semibold">✨ Fast • Secure • Modern</div>
              <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold leading-[0.95] tracking-tight" style={{fontFamily:'Plus Jakarta Sans, Inter, sans-serif'}}>
                <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Kryzen</span><br/>
                Connect. Chat. Share.
              </h1>
              <p className="mt-4 text-lg text-muted-foreground leading-relaxed">A fast, modern messaging platform built for simple and meaningful communication. Real-time, private, and beautifully crafted.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={user?"/chat":"/signup"} className="px-7 py-3 rounded-full bg-primary text-primary-foreground font-semibold shadow-xl shadow-primary/20 hover:bg-primary/90 flex items-center gap-2">Get Started <ArrowRight className="w-4 h-4"/></Link>
                <Link to="/login" className="px-7 py-3 rounded-full bg-card border font-semibold hover:bg-muted">Sign In</Link>
              </div>
              <div className="mt-6 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/> End-to-end ready architecture</span>
                <span>•</span><span>No ads • No trackers</span>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-br from-violet-500/20 to-indigo-500/20 rounded-[2rem] blur-2xl" />
              <div className="relative bg-card border rounded-[1.75rem] shadow-2xl overflow-hidden">
                <div className="h-12 flex items-center gap-2 px-4 border-b bg-muted/50">
                  <span className="w-3 h-3 rounded-full bg-red-400"/><span className="w-3 h-3 rounded-full bg-yellow-400"/><span className="w-3 h-3 rounded-full bg-green-400"/>
                  <span className="ml-3 text-xs font-medium text-muted-foreground">Kryzen — Preview</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-orange-500" />
                    <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[70%]"><p className="text-sm">Hey! Are we still meeting tomorrow?</p><p className="text-[11px] text-muted-foreground mt-1">10:42 AM</p></div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 max-w-[70%]"><p className="text-sm">Absolutely! Can't wait 🚀</p><p className="text-[11px] text-primary-foreground/70 mt-1 text-right">10:43 AM ✓✓</p></div>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500" />
                    <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[70%]"><p className="text-sm">Check this design I made ✨</p><div className="mt-2 w-40 h-24 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-xs">Image Preview</div></div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5"><p className="text-sm">Love it! ❤️</p></div>
                  </div>
                  <div className="flex items-center gap-2 px-2 pt-2 border-t">
                    <div className="flex-1 h-9 rounded-full bg-muted" />
                    <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground">➤</div>
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
              <div key={card.title} className="p-5 rounded-2xl bg-card border hover:shadow-lg transition">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><card.icon className="w-5 h-5"/></div>
                <h3 className="font-semibold mt-3">{card.title}</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        <p>© 2026 Kryzen • Connect. Chat. Share. • Built with FastAPI + React • Not affiliated with WhatsApp.</p>
      </footer>
    </div>
  )
}
