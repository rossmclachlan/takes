import { useEffect, useMemo, useState } from 'react'
import { CloudOff, Inbox as InboxIcon, Lightbulb, Menu as MenuIcon, Music } from 'lucide-react'
import { Detail } from './components/Detail'
import { Ideas, Songs } from './components/Library'
import { Inbox } from './components/Inbox'
import { Menu } from './components/Menu'
import { MiniPlayer } from './components/MiniPlayer'
import { SignIn, TapeLogo } from './components/SignIn'
import { counts } from './lib/library'
import { clearNotice, init, library, useStore } from './lib/store'

type Tab = 'inbox' | 'songs' | 'ideas'

const TABS: { tab: Tab; label: string; Icon: typeof Music; bg: string }[] = [
  { tab: 'inbox', label: 'Inbox', Icon: InboxIcon, bg: 'bg-sun' },
  { tab: 'songs', label: 'Songs', Icon: Music, bg: 'bg-second-container' },
  { tab: 'ideas', label: 'Ideas', Icon: Lightbulb, bg: 'bg-accent-container' },
]

function readTab(): Tab {
  try {
    const t = localStorage.getItem('takes:tab')
    if (t === 'songs' || t === 'ideas') return t
  } catch {
    // ignore
  }
  return 'inbox'
}

export default function App() {
  const email = useStore((s) => s.email)
  const [tab, setTabState] = useState<Tab>(readTab)
  const [detail, setDetail] = useState<string[]>([])
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    void init()
  }, [])

  // The phone's back button closes a take before it leaves the app.
  useEffect(() => {
    const onPop = () => setDetail((d) => d.slice(0, -1))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const open = (id: string) => {
    history.pushState({ take: id }, '')
    setDetail((d) => [...d, id])
    window.scrollTo(0, 0)
  }
  const back = () => history.back()
  const setTab = (t: Tab) => {
    if (detail.length) history.go(-detail.length)
    setDetail([])
    setTabState(t)
    try {
      localStorage.setItem('takes:tab', t)
    } catch {
      // ignore
    }
  }

  if (!email) return <SignIn />

  const current = detail[detail.length - 1]
  return (
    <div className="paper relative mx-auto flex h-full max-w-[640px] flex-col">
      <TopBar onMenu={() => setMenuOpen(true)} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        {current ? (
          <Detail key={current} id={current} onBack={back} onOpen={open} />
        ) : tab === 'inbox' ? (
          <Inbox onOpen={open} />
        ) : tab === 'songs' ? (
          <Songs onOpen={open} />
        ) : (
          <Ideas onOpen={open} />
        )}
      </main>
      <Notice />
      {(tab !== 'inbox' || current) && <MiniPlayer onOpen={open} />}
      <BottomNav tab={current ? null : tab} onChange={setTab} />
      <Menu isOpen={menuOpen} onClose={() => setMenuOpen(false)} onOpen={open} />
    </div>
  )
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const reachable = useStore((s) => s.reachable)
  const queue = useStore((s) => s.queue.length)
  return (
    <header className="flex shrink-0 items-center gap-2.5 px-4 pt-[max(10px,env(safe-area-inset-top))] pb-2">
      <TapeLogo size={34} />
      <span className="font-display text-2xl font-semibold">Takes</span>
      <span className="flex-1" />
      {(!reachable || queue > 0) && (
        <button type="button" onClick={onMenu} className="flex items-center gap-1.5 rounded-full bg-surface-variant px-3 py-1 text-xs font-semibold text-ink-variant">
          {!reachable && <CloudOff size={14} />}
          {queue > 0 ? `${queue} waiting` : 'Offline'}
        </button>
      )}
      <button type="button" className="btn-icon" aria-label="Menu" onClick={onMenu}>
        <MenuIcon size={18} />
      </button>
    </header>
  )
}

function BottomNav({ tab, onChange }: { tab: Tab | null; onChange: (t: Tab) => void }) {
  const lib = useStore((s) => library(s))
  const c = useMemo(() => counts(lib), [lib])
  const n: Record<Tab, number> = { inbox: c.inbox, songs: c.song, ideas: c.idea }
  return (
    <nav className="z-40 shrink-0 border-t-[1.5px] border-outline bg-bg pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch justify-around py-2">
        {TABS.map(({ tab: t, label, Icon, bg }) => {
          const active = tab === t
          return (
            <button key={t} type="button" onClick={() => onChange(t)} className="flex flex-1 flex-col items-center gap-1 py-1 text-xs" aria-current={active ? 'page' : undefined}>
              <span className={`relative flex h-8 w-14 items-center justify-center rounded-full transition-colors ${active ? `sticker-sm ${bg} text-ink` : 'text-ink-variant'}`}>
                <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                {t === 'inbox' && n.inbox > 0 && !active && <span className="absolute -top-1.5 -right-1 count-badge min-w-5 px-1 text-[10px] leading-4">{n.inbox > 999 ? '999+' : n.inbox}</span>}
              </span>
              <span className={active ? 'font-extrabold text-ink' : 'font-semibold text-ink-variant'}>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function Notice() {
  const notice = useStore((s) => s.notice)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(clearNotice, 5000)
    return () => clearTimeout(t)
  }, [notice])
  if (!notice) return null
  return (
    <div className="mx-3 mb-2 rounded-2xl bg-ink px-4 py-2.5 text-sm text-bg" role="status">
      {notice}
    </div>
  )
}
