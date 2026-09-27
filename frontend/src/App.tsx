import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import {
  Activity, ArrowRight, ArrowUpRight, BookOpen, CalendarDays,
  CircleHelp, Compass, Feather, Flower2, Heart, Layers3,
  LoaderCircle, Menu, Moon, Network, Palette, Search, Sparkles, Sun, Tag,
  Wind, X,
} from 'lucide-react'

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

type Entry = { id: number; text: string; created_at: string }
type Match = { text: string; metadata?: { journal_id?: number; created_at?: string }; distance?: number }
type Page = 'Today' | 'Journal' | 'Search' | 'Patterns' | 'Memory map'
type AppearanceMode = 'light' | 'dark'
type ThemeId = 'sage' | 'lavender' | 'rose' | 'blue' | 'butter' | 'peach'

const appearanceThemes: { id: ThemeId; name: string; description: string; color: string }[] = [
  { id: 'sage', name: 'Sage garden', description: 'Soft greens & linen', color: '#9db39c' },
  { id: 'lavender', name: 'Lavender dusk', description: 'Lilac & quiet slate', color: '#aaa0c6' },
  { id: 'rose', name: 'Rosewater', description: 'Blush & warm clay', color: '#d4a59e' },
  { id: 'blue', name: 'Blue hour', description: 'Powder blue & mist', color: '#9dbac8' },
  { id: 'butter', name: 'Buttercream', description: 'Vanilla & soft gold', color: '#d9c58e' },
  { id: 'peach', name: 'Peach bloom', description: 'Apricot & terracotta', color: '#d9a98d' },
]

const navItems: { label: Page; icon: typeof BookOpen }[] = [
  { label: 'Today', icon: Compass },
  { label: 'Journal', icon: BookOpen },
  { label: 'Search', icon: Search },
  { label: 'Patterns', icon: Activity },
  { label: 'Memory map', icon: Network },
]

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

function prettyDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function relativeDay(value: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const day = new Date(value); day.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000)
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : prettyDate(value)
}

function App() {
  const [page, setPage] = useState<Page>('Today')
  const [entries, setEntries] = useState<Entry[]>([])
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Match[]>([])
  const [themes, setThemes] = useState<{ journal_id: number | null; text: string; theme: number }[]>([])
  const [graph, setGraph] = useState<{ nodes: { id: string; label: string; type: string }[]; relationships: { source: string; target: string }[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(() => localStorage.getItem('memora-mode') === 'dark' ? 'dark' : 'light')
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    const saved = localStorage.getItem('memora-theme') as ThemeId | null
    return appearanceThemes.some(theme => theme.id === saved) ? saved! : 'sage'
  })
  const [customBackground, setCustomBackground] = useState(() => localStorage.getItem('memora-custom-background') ?? '')

  useEffect(() => {
    const root = document.documentElement
    root.dataset.mode = appearanceMode
    root.dataset.theme = themeId
    root.style.setProperty('--bg', customBackground || '')
    localStorage.setItem('memora-mode', appearanceMode)
    localStorage.setItem('memora-theme', themeId)
    if (customBackground) localStorage.setItem('memora-custom-background', customBackground)
    else localStorage.removeItem('memora-custom-background')
  }, [appearanceMode, themeId, customBackground])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSettingsOpen(false); setGuideOpen(false) }
      if (!settingsOpen && !guideOpen && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPage('Search')
        window.setTimeout(() => searchInput.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [settingsOpen, guideOpen])

  useEffect(() => { if (page === 'Search') searchInput.current?.focus() }, [page])

  const loadEntries = useCallback(async () => {
    try {
      const res = await fetch(`${API}/journal?limit=50&offset=0`)
      if (!res.ok) throw new Error('Could not load your journal')
      setEntries(await res.json()); setApiOnline(true)
    } catch { setApiOnline(false) }
  }, [])

  useEffect(() => { void loadEntries() }, [loadEntries])

  const saveEntry = async () => {
    if (!draft.trim() || saving) return
    setSaving(true); setMessage('')
    try {
      const res = await fetch(`${API}/journal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: draft.trim() }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail ?? 'Could not save this entry')
      setDraft(''); setMessage('Your note is safely tucked away.'); await loadEntries()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not connect to Memora.') }
    finally { setSaving(false) }
  }

  const search = async (event: FormEvent) => {
    event.preventDefault(); if (!query.trim()) return
    setLoading(true); setMessage('')
    try {
      const res = await fetch(`${API}/search-memory?limit=8`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query.trim() }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail ?? 'Search is unavailable')
      setMatches(data.results ?? []); setPage('Search')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Search is unavailable') }
    finally { setLoading(false) }
  }

  const openPatterns = async () => {
    setPage('Patterns'); setLoading(true)
    try { const res = await fetch(`${API}/analyze-themes`); const data = await res.json(); setThemes(data.themes ?? []); if (!res.ok) throw new Error(data.detail) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load themes') }
    finally { setLoading(false) }
  }

  const openGraph = async () => {
    setPage('Memory map'); setLoading(true)
    try { const res = await fetch(`${API}/build-memory-graph`); const data = await res.json(); if (!res.ok) throw new Error(data.detail); setGraph(data) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load memory map') }
    finally { setLoading(false) }
  }

  const todayEntries = useMemo(() => entries.filter(entry => relativeDay(entry.created_at) === 'Today'), [entries])
  const latestEntry = entries[0]

  const selectPage = (label: Page) => {
    setMobileNav(false); setMessage('')
    if (label === 'Patterns') void openPatterns()
    else if (label === 'Memory map') void openGraph()
    else setPage(label)
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Flower2 size={20} strokeWidth={1.8} /></div><span>memora</span><button className="icon-button sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18} /></button></div>
      <div className="workspace-switch"><span className="avatar">M</span><span className="workspace-copy"><b>My space</b><small>Personal journal</small></span></div>
      <div className="nav-label">YOUR SPACE</div>
      <nav className="main-nav">{navItems.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${page === label ? 'active' : ''}`} onClick={() => selectPage(label)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'Journal' && entries.length > 0 && <span className="nav-count">{entries.length}</span>}</button>)}</nav>
      <div className="sidebar-appearance"><div className="nav-label">PERSONALIZE</div><button className="nav-item" onClick={() => setSettingsOpen(true)}><Palette size={18} strokeWidth={1.8}/><span>Appearance</span><span className="appearance-dot" style={{ background: appearanceThemes.find(theme => theme.id === themeId)?.color }}/></button></div>
      <div className="sidebar-note"><div className="note-icon"><Wind size={17} /></div><p>Take a breath.<br /><span>You’re right where you need to be.</span></p><div className="note-orbit orbit-a"/><div className="note-orbit orbit-b"/></div>
      <div className="sidebar-footer"><button className="nav-item" onClick={() => setGuideOpen(true)}><CircleHelp size={18} /><span>Quick guide</span></button><div className="profile-row"><div className="profile-avatar">M</div><div className="profile-copy"><b>My journal</b><small>{apiOnline === false ? 'Backend offline' : 'Private by design'}</small></div></div></div>
    </aside>

    {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
    <main className="main-area">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20} /></button><div className="breadcrumbs"><span>My space</span><span className="crumb-slash">/</span><b>{page}</b></div><div className="topbar-right"><div className={`sync-status ${apiOnline === false ? 'offline' : ''}`}><span className="status-dot" />{apiOnline === false ? 'Reconnecting' : 'All changes saved'}</div><button className="icon-button top-help" aria-label="Open quick guide" onClick={() => setGuideOpen(true)}><CircleHelp size={18} /></button><div className="top-avatar">M</div></div></header>

      <div className="content-wrap">
        {page === 'Today' && <>
          <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line" /> {new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()}</div><h1>{greeting()}, <em>you.</em></h1><p className="welcome-sub">A little space to notice where you are.</p></div><div className="date-card"><CalendarDays size={17} /><span>{new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' }).format(new Date())}</span><span className="date-card-year">{new Date().getFullYear()}</span></div></section>
          <section className="hero-grid">
            <div className="compose-card"><div className="compose-head"><div className="compose-icon"><Feather size={17} /></div><span>A MOMENT TO YOURSELF</span></div><textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="What’s on your mind today? No need to make sense of it all…" rows={4} maxLength={10000} /><div className="compose-footer"><div className="compose-hint"><Sparkles size={14} /><span>Your thoughts are yours alone</span></div><button className="save-button" onClick={() => void saveEntry()} disabled={!draft.trim() || saving}>{saving ? <LoaderCircle size={15} className="spin" /> : <><span>Save entry</span><ArrowUpRight size={15} /></>}</button></div>{message && <div className={`inline-message ${message.includes('safely') ? 'success' : ''}`}>{message}</div>}</div>
            <div className="prompt-card"><div className="prompt-top"><div className="prompt-icon"><Sparkles size={17} /></div><span>GENTLE PROMPT</span><span className="prompt-sparkle">✳</span></div><div className="prompt-body"><p>“What felt like a small win this week that you haven’t given yourself credit for?”</p></div><button className="prompt-action" onClick={() => setDraft('A small win I haven’t given myself credit for is ')}>Write about this <ArrowRight size={15} /></button><div className="prompt-decoration">✳</div></div>
          </section>
          <section className="section-heading"><div><div className="eyebrow small-eyebrow">YOUR STORY, UNFOLDING</div><h2>Recent reflections <span className="soft-count">{entries.length}</span></h2></div><button className="text-button" onClick={() => setPage('Journal')}>View journal <ArrowRight size={15} /></button></section>
          <div className="overview-grid"><section className="recent-card">{entries.length === 0 ? <div className="empty-state"><div className="empty-icon"><BookOpen size={20} /></div><b>Your story starts here</b><span>Write your first reflection above. It doesn’t have to be profound.</span></div> : <div className="entry-list">{entries.slice(0, 4).map((entry, i) => <EntryRow key={entry.id} entry={entry} index={i} onClick={() => { setPage('Journal'); setMessage('') }} />)}</div>}</section>
            <aside className="side-stack"><div className="week-card"><div className="mini-card-head"><span>THIS WEEK</span><ArrowUpRight size={15} /></div><div className="week-number">{todayEntries.length}<span> / 7</span></div><div className="week-caption">{todayEntries.length ? 'A moment captured today' : 'Moments captured today'}</div><div className="week-days">{['M','T','W','T','F','S','S'].map((day, i) => <div key={i} className="week-day"><span className={i === ((new Date().getDay() + 6) % 7) ? 'today-marker' : ''}>{day}</span><i className={`${i === ((new Date().getDay() + 6) % 7) && todayEntries.length ? 'filled' : ''}`} /></div>)}</div></div><div className="memory-card"><div className="memory-card-top"><div className="memory-icon"><Layers3 size={17} /></div><span>YOUR MEMORY</span></div><p>{latestEntry ? <>Your latest reflection was saved <strong>{relativeDay(latestEntry.created_at).toLowerCase()}</strong>.</> : <>Little by little,<br /><strong>a life takes shape.</strong></>}</p><button onClick={() => setPage('Journal')}>Explore your journal <ArrowRight size={14} /></button><div className="memory-lines"><i/><i/><i/><i/></div></div></aside></div>
        </>}

        {page === 'Journal' && <><PageTitle eyebrow="YOUR PERSONAL ARCHIVE" title="The journal" sub="Every thought has a place here." action={<span className="entry-total"><BookOpen size={15} /> {entries.length} entries</span>} />{entries.length ? <div className="journal-page-list">{entries.map((entry, i) => <EntryRow key={entry.id} entry={entry} index={i} expanded />)}</div> : <EmptyPage icon={<BookOpen size={22} />} title="Your journal is waiting" sub="The moments you save will find a home here." />}</>}

        {page === 'Search' && <><PageTitle eyebrow="FIND YOUR WAY BACK" title="Memory search" sub="Search by feeling, person, or a moment you remember." />{message && <div className="inline-message">{message}</div>}<form className="search-box" onSubmit={search}><Search size={19} /><input ref={searchInput} value={query} onChange={e => setQuery(e.target.value)} placeholder="Try “a day I felt proud” or “time with friends”…" /><kbd>Ctrl&nbsp; K</kbd><button type="submit" disabled={loading}>{loading ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={18} />}</button></form>{matches.length > 0 ? <><div className="results-label">MEMORIES THAT RESONATE <span>{matches.length} found</span></div><div className="journal-page-list">{matches.map((match, i) => <article className="match-card" key={`${match.metadata?.journal_id ?? i}-${i}`}><div className="match-top"><span className="match-no">0{i + 1}</span><span>{match.metadata?.created_at ? prettyDate(match.metadata.created_at) : 'A memory'}</span><span className="match-score">{match.distance != null ? `${Math.max(0, 100 - Math.round(match.distance * 100))}% resonance` : 'A close match'}</span></div><p>{match.text}</p></article>)}</div></> : <EmptyPage icon={loading ? <LoaderCircle size={22} className="spin" /> : <Search size={22} />} title={query ? 'No memories found yet' : 'Your memories, within reach'} sub={query ? 'Try another phrase or feeling.' : 'Search for a feeling, a person, or something you wrote.'} />}</>}

        {page === 'Patterns' && <><PageTitle eyebrow="THE THREADS BETWEEN MOMENTS" title="Patterns & themes" sub="A wider view of what’s been on your mind." action={<button className="quiet-button" onClick={() => void openPatterns()}><Activity size={15} /> Refresh</button>} />{message && <div className="inline-message">{message}</div>}{themes.length ? <><div className="insight-banner"><div className="insight-icon"><Sparkles size={18}/></div><div><b>Recurring themes in your reflections</b><span>These clusters are suggested by your writing and may offer a new perspective.</span></div></div><div className="theme-grid">{[...new Set(themes.map(x => x.theme))].map((theme, i) => { const items = themes.filter(x => x.theme === theme); return <article className={`theme-card theme-${i % 3}`} key={theme}><div className="theme-card-head"><span>THEME 0{i + 1}</span><span>{items.length} moments</span></div><div className="theme-art"><div className="theme-orb orb-one"/><div className="theme-orb orb-two"/><div className="theme-orb orb-three"/><span>{i === 0 ? <Flower2/> : i === 1 ? <Wind/> : <Heart/>}</span></div><div className="theme-snippet">“{items[0].text.slice(0, 150)}{items[0].text.length > 150 ? '…' : ''}”</div><div className="theme-foot"><span>{items.length} reflections gathered</span><ArrowUpRight size={16}/></div></article> })}</div></> : <EmptyPage icon={loading ? <LoaderCircle size={22} className="spin" /> : <Layers3 size={22} />} title={loading ? 'Finding the threads…' : 'Patterns emerge over time'} sub={loading ? 'Looking across your reflections.' : 'Save at least two journal entries and we’ll look for recurring themes.'} />}</>}

        {page === 'Memory map' && <><PageTitle eyebrow="PEOPLE, PLACES & MOMENTS" title="Your memory map" sub="A constellation of things that appear in your writing." action={<button className="quiet-button" onClick={() => void openGraph()}><Network size={15} /> Refresh map</button>} />{graph?.nodes.length ? <div className="map-layout"><div className="map-canvas"><div className="map-grid"/><div className="map-glow"/>{graph.relationships.map((edge, i) => { const source = graph.nodes.findIndex(n => n.id === edge.source); const target = graph.nodes.findIndex(n => n.id === edge.target); const a = graph.nodes.length ? (source / graph.nodes.length) * 280 + 90 : 100; const b = graph.nodes.length ? (target / graph.nodes.length) * 280 + 90 : 300; return <svg className="map-edge" key={i} viewBox="0 0 520 380" preserveAspectRatio="none"><path d={`M${a} 180 Q260 ${i % 2 ? 60 : 300} ${b} 180`} /></svg> })}{graph.nodes.map((node, i) => { const angle = (i / graph.nodes.length) * Math.PI * 2 - Math.PI / 2; const radius = graph.nodes.length < 4 ? 95 : 135; return <div key={node.id} className={`map-node ${i === 0 ? 'node-main' : ''}`} style={{ left: `calc(50% + ${Math.cos(angle) * radius}px)`, top: `calc(50% + ${Math.sin(angle) * radius}px)` }}><span>{node.label}</span></div> })}<div className="map-center"><Flower2 size={22}/></div></div><div className="map-legend"><div><span className="legend-dot person"/>People</div><div><span className="legend-dot place"/>Places & things</div><div><span className="legend-line"/>Mentioned together</div><p>{graph.nodes.length} entities <span>·</span> {graph.relationships.length} connections</p></div></div> : <EmptyPage icon={loading ? <LoaderCircle size={22} className="spin" /> : <Network size={22} />} title={loading ? 'Connecting the dots…' : 'Your map is taking shape'} sub={loading ? 'Finding familiar names and places in your journal.' : 'As you write, people and places will gather into a constellation here.'} />}</>}
      </div>
      <footer className="app-footer"><span>Made for your inner world <span className="footer-heart">✳</span></span><span>MEMORA <i /> PERSONAL JOURNAL</span></footer>
    </main>
    {settingsOpen && <div className="settings-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSettingsOpen(false) }}><section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="appearance-title"><header className="settings-header"><div className="settings-heading-icon"><Palette size={18}/></div><div><div className="eyebrow small-eyebrow">MAKE IT YOURS</div><h2 id="appearance-title">Appearance</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close appearance settings"><X size={18}/></button></header><div className="settings-section"><div className="settings-label-row"><div><b>Display mode</b><span>Choose a light or dark workspace</span></div></div><div className="mode-picker"><button className={appearanceMode === 'light' ? 'selected' : ''} onClick={() => setAppearanceMode('light')}><Sun size={16}/><span>Light</span></button><button className={appearanceMode === 'dark' ? 'selected' : ''} onClick={() => setAppearanceMode('dark')}><Moon size={16}/><span>Dark</span></button></div></div><div className="settings-section theme-section"><div className="settings-label-row"><div><b>Color theme</b><span>Pastel tones for a softer space</span></div></div><div className="theme-picker">{appearanceThemes.map(theme => <button key={theme.id} className={`theme-option ${themeId === theme.id ? 'selected' : ''}`} onClick={() => { setThemeId(theme.id); setCustomBackground('') }} aria-pressed={themeId === theme.id}><span className="theme-swatch" style={{ '--swatch': theme.color } as CSSProperties}>{themeId === theme.id && <span className="swatch-check"><span/></span>}</span><span className="theme-option-copy"><b>{theme.name}</b><small>{theme.description}</small></span></button>)}</div></div><div className="settings-section custom-section"><div className="settings-label-row"><div><b>Custom background</b><span>Pick a color for your canvas</span></div><label className="color-picker-control" aria-label="Choose a custom background color"><input type="color" value={customBackground || '#f5f4ef'} onChange={event => setCustomBackground(event.target.value)} /><span style={{ background: customBackground || 'linear-gradient(135deg, #e6e5dc 50%, #fffefa 50%)' }}/></label></div>{customBackground && <div className="custom-color-value"><span>{customBackground.toUpperCase()}</span><button onClick={() => setCustomBackground('')}>Reset to theme</button></div>}<p className="settings-footnote">Your appearance settings are saved on this device.</p></div></section></div>}
    {guideOpen && <div className="settings-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setGuideOpen(false) }}><section className="guide-panel" role="dialog" aria-modal="true" aria-labelledby="guide-title"><header className="settings-header"><div className="settings-heading-icon"><CircleHelp size={18}/></div><div><div className="eyebrow small-eyebrow">A LITTLE ORIENTATION</div><h2 id="guide-title">Quick guide</h2></div><button className="icon-button" onClick={() => setGuideOpen(false)} aria-label="Close quick guide"><X size={18}/></button></header><div className="guide-content"><p>Memora is your quiet place to collect thoughts and find your way back to them.</p><div><Feather size={16}/><span><b>Write a reflection</b><small>Use Today to save a note to your journal.</small></span></div><div><Search size={16}/><span><b>Find a memory</b><small>Search with words, feelings, or a moment you recall.</small></span></div><div><Palette size={16}/><span><b>Make it yours</b><small>Open Appearance in the sidebar to choose colors and display mode.</small></span></div><div className="guide-connection"><span className={`status-dot ${apiOnline === false ? 'guide-offline' : ''}`}/>{apiOnline === false ? 'The local API is not connected.' : apiOnline ? 'Connected to your local journal API.' : 'Checking local API connection…'}</div></div><div className="guide-actions"><button className="guide-secondary" onClick={() => setGuideOpen(false)}>Close</button><button className="save-button" onClick={() => { setGuideOpen(false); setPage('Journal') }}>Open journal <ArrowRight size={15}/></button></div></section></div>}
  </div>
}

function EntryRow({ entry, index, onClick, expanded = false }: { entry: Entry; index: number; onClick?: () => void; expanded?: boolean }) {
  return <article className={`entry-row ${expanded ? 'entry-expanded' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? e => { if (e.key === 'Enter') onClick() } : undefined}><div className={`entry-marker marker-${index % 4}`}><span>{index === 0 ? <Flower2 size={15}/> : index === 1 ? <Wind size={15}/> : index === 2 ? <Heart size={14}/> : <Sparkles size={14}/>}</span></div><div className="entry-main"><div className="entry-meta"><span>{relativeDay(entry.created_at)}</span><i/><span>{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(entry.created_at))}</span></div><p>{entry.text}</p><div className="entry-tags"><span><Tag size={12}/> Reflection</span></div></div><ArrowUpRight className="entry-arrow" size={17}/></article>
}

function PageTitle({ eyebrow, title, sub, action }: { eyebrow: string; title: string; sub: string; action?: ReactNode }) {
  return <section className="page-title"><div className="eyebrow"><span className="eyebrow-line"/>{eyebrow}</div><div className="page-title-row"><div><h1>{title}</h1><p>{sub}</p></div>{action}</div></section>
}

function EmptyPage({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return <div className="empty-page"><div className="empty-page-icon">{icon}</div><h3>{title}</h3><p>{sub}</p></div>
}

export default App
