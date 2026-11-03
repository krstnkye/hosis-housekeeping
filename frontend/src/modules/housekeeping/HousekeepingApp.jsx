import { useEffect, useState } from 'react'
import { clearSession, getSession, setExternalSession, setUnauthorizedHandler } from './api.js'
import { PageHeader, Sidebar, Topbar } from './components/Layout.jsx'
import { TABS } from './tabs.js'
import LoginPage from './pages/LoginPage.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import RoomStatusPage from './pages/RoomStatusPage.jsx'
import CleaningTasksPage from './pages/CleaningTasksPage.jsx'
import InspectionPage from './pages/InspectionPage.jsx'
import SchedulesPage from './pages/SchedulesPage.jsx'
import LostFoundPage from './pages/LostFoundPage.jsx'
import GuestRequestsPage from './pages/GuestRequestsPage.jsx'
import MaintenancePage from './pages/MaintenancePage.jsx'
import './housekeeping.css'

// Pages follow the flowchart: Log in -> Authorized? -> Housekeeping Dashboard
// -> Select Function (one sidebar item per function).
const PAGES = {
  overview: { component: OverviewPage, title: 'Housekeeping Dashboard', subtitle: 'Monitor today’s room readiness and housekeeping workload.' },
  rooms: { component: RoomStatusPage, title: 'Room Status', subtitle: 'Monitor room readiness and keep Front Office updated.' },
  tasks: { component: CleaningTasksPage, title: 'Cleaning Tasks', subtitle: 'Create, assign and track today’s cleaning work.' },
  inspection: { component: InspectionPage, title: 'Room Inspection', subtitle: 'Review completed cleaning before approving a room for guests.' },
  schedules: { component: SchedulesPage, title: 'Schedules', subtitle: 'Balance staff shifts and room workloads for today.' },
  'lost-found': { component: LostFoundPage, title: 'LOST & FOUND', subtitle: 'Record, store and return found belongings with verified claims.' },
  requests: { component: GuestRequestsPage, title: 'Guest Request', subtitle: 'Assign and resolve guest needs without losing track of open work.' },
  maintenance: { component: MaintenancePage, title: 'Maintenance', subtitle: 'Report defects, coordinate with Engineering and protect room readiness.' },
}

function currentTab() {
  const id = window.location.hash.replace('#/housekeeping/', '')
  return TABS.some((t) => t.id === id) ? id : 'overview'
}

const ALLOWED_ROLES = ['HOUSEKEEPING', 'ADMIN']

// Standalone: <HousekeepingApp /> shows its own login page.
// Inside the combined HOSIS app: <HousekeepingApp session={{ token, user }} onLogout={...} />
// uses the app shell's login instead. `user` must carry userId, name, role and position.
export default function HousekeepingApp({ session: shellSession = null, onLogout: shellLogout = null }) {
  setExternalSession(shellSession)
  const [ownSession, setSession] = useState(() => (shellSession ? null : getSession()))
  const session = shellSession || ownSession
  const [tab, setTab] = useState(currentTab)
  // Pages can place buttons in the page header (e.g. Export) through a portal.
  const [headerActions, setHeaderActions] = useState(null)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('hosis_sidebar') === 'collapsed'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const onHash = () => setTab(currentTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (shellLogout) {
        shellLogout()
        return
      }
      clearSession()
      setSession(null)
    })
  }, [shellLogout])

  if (!session) {
    return <LoginPage onLogin={setSession} />
  }

  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return (
      <div className="hk-app">
        <main className="hk-content">
          <PageHeader title="Access denied" subtitle="This account is not authorized for the Housekeeping module." actions={null} />
        </main>
      </div>
    )
  }

  // Housekeepers get their own schedule page (Figma "My Schedule - HK staff").
  const ownSchedule = session.user.position === 'HOUSEKEEPER'
  const page =
    ownSchedule && tab === 'schedules'
      ? { ...PAGES.schedules, title: 'My Schedule', subtitle: 'Your shift, assigned rooms and remaining work for today.' }
      : PAGES[tab]
  const Page = page.component
  const tabs = ownSchedule ? TABS.map((t) => (t.id === 'schedules' ? { ...t, name: 'My Schedule' } : t)) : TABS

  function toggleSidebar() {
    setCollapsed(!collapsed)
    try {
      localStorage.setItem('hosis_sidebar', collapsed ? 'open' : 'collapsed')
    } catch {
      // Remembering the menu state is optional.
    }
  }

  return (
    <div className={`hk-app${collapsed ? ' is-collapsed' : ''}`}>
      <Sidebar current={tab} tabs={tabs} collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="hk-main">
        <Topbar
          user={session.user}
          onLogout={() => {
            if (shellLogout) {
              shellLogout()
              return
            }
            clearSession()
            setSession(null)
          }}
        />
        <main className="hk-content">
          <PageHeader title={page.title} subtitle={page.subtitle} actions={<span className="hk-actions" ref={setHeaderActions} />} />
          <Page key={tab} user={session.user} search="" headerActions={headerActions} />
        </main>
        <footer className="hk-footer">
          <span>Grand Horizon Hotel · Housekeeping operations</span>
          <span>HOSIS</span>
        </footer>
      </div>
    </div>
  )
}
