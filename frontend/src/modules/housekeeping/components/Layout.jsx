import Logo from './Logo.jsx'
import { SearchIcon } from './ui.jsx'
import { TABS } from '../tabs.js'

// Hotel-wide navigation from the Figma design. Only Housekeeping is
// built in this module; the other departments' modules plug in later.
const NAV = [
  { id: 'dashboard', name: 'Dashboard', href: '#/dashboard', icon: 'M3 12 12 4l9 8v8h-6v-5H9v5H3z' },
  { id: 'reservation', name: 'Reservation', href: '#/reservation', icon: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4' },
  { id: 'front-office', name: 'Front office', href: '#/front-office', icon: 'M5 21V5h9l5 5v11zM14 5v5h5' },
  { id: 'guest-services', name: 'Guest services', href: '#/guest-services', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0' },
  { id: 'rooms', name: 'Rooms', href: '#/rooms', icon: 'M3 18V8h18v10M3 14h18M7 11h4' },
  { id: 'housekeeping', name: 'Housekeeping', href: '#/housekeeping/overview', icon: 'M7 21V10l5-6 5 6v11M10 21v-6h4v6' },
  { id: 'food-beverage', name: 'F&B Services', href: '#/food-beverage', icon: 'M7 3v8a3 3 0 0 0 6 0V3M10 3v18M17 3c-2 2-2 6 0 8v10' },
  { id: 'finance', name: 'Finance', href: '#/finance', icon: 'M12 3v18M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H6' },
  { id: 'reports', name: 'Reports', href: '#/reports', icon: 'M5 21V3h10l4 4v14zM9 13h6M9 17h6' },
  { id: 'settings', name: 'Settings', href: '#/settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2' },
]

function NavIcon({ d }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export function Sidebar({ activeSection = 'housekeeping' }) {
  return (
    <aside className="hk-sidebar">
      <div className="hk-brand">
        <Logo size={72} />
        <span className="hk-brand__name">Grand Horizon Hotel</span>
        <span className="hk-brand__tag">Stay · Relax · Belong</span>
      </div>
      <nav className="hk-nav" aria-label="Departments">
        {NAV.map((item) => {
          const active = item.id === activeSection
          return (
            <a
              key={item.name}
              href={item.href}
              className={`hk-nav__item${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              title={`Open ${item.name}`}
            >
              <NavIcon d={item.icon} />
              {item.name}
            </a>
          )
        })}
      </nav>
    </aside>
  )
}

export function Topbar({ user, search, onSearch, onLogout }) {
  return (
    <header className="hk-topbar">
      <div className="hk-topbar__search">
        <SearchIcon />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search"
          aria-label="Search the current page"
        />
      </div>
      <div className="hk-user">
        <span className="hk-user__avatar" aria-hidden="true">
          {user.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
        </span>
        <span className="hk-user__text">
          <strong>{user.name}</strong>
          <small>{user.position ? `Housekeeping ${user.position.toLowerCase()}` : user.role}</small>
        </span>
        <button type="button" className="hk-btn hk-btn--ghost-light" onClick={onLogout}>
          Log out
        </button>
      </div>
    </header>
  )
}

export function PageHeader({ title, subtitle }) {
  const now = new Date()
  return (
    <div className="hk-page-head">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="hk-page-head__date">
        <span>{now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
        <span>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
    </div>
  )
}

export function Tabs({ current }) {
  return (
    <nav className="hk-tabs" aria-label="Housekeeping functions">
      {TABS.map((t) => (
        <a
          key={t.id}
          href={`#/housekeeping/${t.id}`}
          className={`hk-tab${t.id === current ? ' is-active' : ''}`}
          aria-current={t.id === current ? 'page' : undefined}
        >
          {t.name}
        </a>
      ))}
    </nav>
  )
}
