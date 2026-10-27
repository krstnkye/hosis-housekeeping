import { useEffect, useState } from 'react'
import { clearSession, getSession, setUnauthorizedHandler } from './api.js'
import { PageHeader, Sidebar, Tabs, Topbar } from './components/Layout.jsx'
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
// -> Select Function (one tab per function).
const PAGES = {
  overview: { component: OverviewPage, title: 'Housekeeping Dashboard', subtitle: 'Today at a glance. Select a function to start working.' },
  rooms: { component: RoomStatusPage, title: 'Room Status', subtitle: 'Monitor room readiness and keep Front Office updated.' },
  tasks: { component: CleaningTasksPage, title: 'Cleaning Tasks', subtitle: 'Create, assign and track today’s cleaning work.' },
  inspection: { component: InspectionPage, title: 'Room Inspection', subtitle: 'Review completed cleaning before approving a room for sale.' },
  schedules: { component: SchedulesPage, title: 'Housekeeping Schedules', subtitle: 'Balance staff shifts and room workloads for today.' },
  'lost-found': { component: LostFoundPage, title: 'Lost & Found', subtitle: 'Record, store and release found belongings with a clear chain of custody.' },
  requests: { component: GuestRequestsPage, title: 'Guest Requests', subtitle: 'Assign and resolve guest housekeeping requests quickly.' },
  maintenance: { component: MaintenancePage, title: 'Maintenance Issues', subtitle: 'Report defects, coordinate with Engineering and protect room readiness.' },
}

function currentTab() {
  const id = window.location.hash.replace('#/housekeeping/', '')
  return TABS.some((t) => t.id === id) ? id : 'overview'
}

export default function HousekeepingApp() {
  const [session, setSession] = useState(getSession)
  const [tab, setTab] = useState(currentTab)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const onHash = () => {
      setTab(currentTab())
      setSearch('')
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession()
      setSession(null)
    })
  }, [])

  if (!session) {
    return <LoginPage onLogin={setSession} />
  }

  const page = PAGES[tab]
  const Page = page.component

  return (
    <div className="hk-app">
      <Sidebar />
      <div className="hk-main">
        <Topbar
          user={session.user}
          search={search}
          onSearch={setSearch}
          onLogout={() => {
            clearSession()
            setSession(null)
          }}
        />
        <main className="hk-content">
          <PageHeader title={page.title} subtitle={page.subtitle} />
          <Tabs current={tab} />
          <Page key={tab} user={session.user} search={search} />
        </main>
        <footer className="hk-footer">
          <span>Grand Horizon Hotel · Housekeeping operations</span>
          <span>HOSIS</span>
        </footer>
      </div>
    </div>
  )
}
