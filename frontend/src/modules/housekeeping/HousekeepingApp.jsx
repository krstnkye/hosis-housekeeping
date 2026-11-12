import { useCallback, useEffect, useState } from 'react'
import { clearSession, getSession, replaceSession, setExternalSession, setUnauthorizedHandler } from './api.js'
import { PageHeader, Sidebar, Topbar } from './components/Layout.jsx'
import { STAFF_TABS, TABS, TAB_POSITIONS } from './tabs.js'
import LoginPage from './pages/LoginPage.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import StaffDashboardPage from './pages/StaffDashboardPage.jsx'
import RoomStatusPage from './pages/RoomStatusPage.jsx'
import CleaningTasksPage from './pages/CleaningTasksPage.jsx'
import InspectionPage from './pages/InspectionPage.jsx'
import SchedulesPage from './pages/SchedulesPage.jsx'
import RoomReportPage from './pages/RoomReportPage.jsx'
import PersonalRecordPage from './pages/PersonalRecordPage.jsx'
import AccountPage, { PasswordForm } from './pages/AccountPage.jsx'
import InventoryPage from './pages/InventoryPage.jsx'
import ReportsPage from './pages/ReportsPage.jsx'
import StaffAccountsPage from './pages/StaffAccountsPage.jsx'
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
  inventory: { component: InventoryPage, title: 'Inventory', subtitle: 'Linen, guest amenities and cleaning supplies on hand.' },
  reports: { component: ReportsPage, title: 'Reports', subtitle: 'Housekeeping performance and history for any date range.' },
  'staff-accounts': { component: StaffAccountsPage, title: 'Staff Accounts', subtitle: 'Forgotten passwords and temporary passwords for your team.' },
  record: { component: PersonalRecordPage, title: 'Personal Record', subtitle: 'Your work history, inspection results and reports.' },
  account: { component: AccountPage, title: 'Account', subtitle: 'Your user ID, email and password.' },
}

// What regular housekeeping staff see in place of the supervisor pages, and
// their menu. They cannot record inspections, so Inspection is left out.
const STAFF_PAGES = {
  overview: { component: StaffDashboardPage, title: 'Staff Dashboard', subtitle: 'Your rooms, guest requests and shift for today.' },
  schedules: { ...PAGES.schedules, title: 'Schedules', subtitle: 'Your shifts and assigned area, and who is on duty with you.' },
  report: { component: RoomReportPage, title: 'Report Room Condition', subtitle: 'Tell Front Office and Maintenance about a room’s condition.' },
  record: { component: PersonalRecordPage, title: 'Personal Record', subtitle: 'Your work history, inspection results and reports.' },
  account: { component: AccountPage, title: 'Account', subtitle: 'Your user ID, email and password.' },
}
const ALL_TABS = [...TABS, ...STAFF_TABS]
const STAFF_MENU = ['overview', 'rooms', 'tasks', 'schedules', 'requests', 'report', 'lost-found', 'maintenance', 'inventory', 'record', 'account']
  .map((id) => ALL_TABS.find((t) => t.id === id))
// Supervisors and inspectors: the full Housekeeping menu plus their own
// record and account.
const LEAD_MENU = [...TABS, ...STAFF_TABS.filter((t) => t.id !== 'report')]

function leadMenu(user) {
  return LEAD_MENU.filter((t) => !TAB_POSITIONS[t.id] || TAB_POSITIONS[t.id].includes(user.position) || user.role === 'ADMIN')
}

function currentTab() {
  const id = window.location.hash.replace('#/housekeeping/', '')
  return ALL_TABS.some((t) => t.id === id) ? id : 'overview'
}

// Phones and small tablets get the drawer menu instead of the fixed sidebar.
const MOBILE_QUERY = '(max-width: 860px)'

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
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

  const mobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  useEffect(() => {
    const onHash = () => {
      setTab(currentTab())
      setMenuOpen(false)
      window.scrollTo(0, 0)
    }
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

  function updateSession(next) {
    if (shellSession) return
    replaceSession(next)
    setSession(next)
  }

  function logout() {
    if (shellLogout) {
      shellLogout()
      return
    }
    clearSession()
    setSession(null)
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

  // A temporary password set by the supervisor must be replaced first.
  if (session.user.mustChangePassword) {
    return (
      <div className="hk-app hk-app--plain">
        <main className="hk-content hk-content--narrow">
          <PageHeader
            title="Choose a new password"
            subtitle="Your supervisor gave you a temporary password. Choose your own before you continue."
            actions={<button type="button" className="hk-btn hk-btn--secondary" onClick={logout}>Sign out</button>}
          />
          <PasswordForm
            currentLabel="Temporary password"
            onChanged={(res) => updateSession({ token: res.token, user: res.user })}
          />
        </main>
      </div>
    )
  }

  // Housekeepers (regular staff) get the staff dashboard and staff menu.
  const staff = session.user.position === 'HOUSEKEEPER'
  const tabs = staff ? STAFF_MENU : leadMenu(session.user)
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'overview'
  const page = (staff && STAFF_PAGES[activeTab]) || PAGES[activeTab]
  const Page = page.component

  function toggleSidebar() {
    setCollapsed(!collapsed)
    try {
      localStorage.setItem('hosis_sidebar', collapsed ? 'open' : 'collapsed')
    } catch {
      // Remembering the menu state is optional.
    }
  }

  return (
    <div className={`hk-app${collapsed && !mobile ? ' is-collapsed' : ''}`}>
      <Sidebar
        current={activeTab}
        tabs={tabs}
        collapsed={collapsed && !mobile}
        onToggle={toggleSidebar}
        mobile={mobile}
        open={mobile && menuOpen}
        onClose={closeMenu}
      />
      <div className="hk-main">
        <Topbar
          user={session.user}
          onMenu={mobile ? () => setMenuOpen(true) : null}
          menuOpen={mobile && menuOpen}
          onLogout={logout}
        />
        <main className="hk-content">
          <PageHeader title={page.title} subtitle={page.subtitle} actions={<span className="hk-actions" ref={setHeaderActions} />} />
          <Page key={activeTab} user={session.user} search="" headerActions={headerActions} onSessionChange={updateSession} />
        </main>
        <footer className="hk-footer">
          <span>Grand Horizon Hotel · Housekeeping operations</span>
          <span>HOSIS</span>
        </footer>
      </div>
    </div>
  )
}
