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
import SystemModulePage from './pages/SystemModulePage.jsx'
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

const SYSTEM_PAGES = {
  dashboard: { title: 'Hotel Dashboard', subtitle: 'Hotel-wide operational overview.', route: '#/dashboard', owner: 'Main HOSIS integration team', description: 'This route is reserved for the combined dashboard that summarizes every department.' },
  reservation: { title: 'Reservation', subtitle: 'Reservation operations and booking management.', route: '#/reservation', owner: 'Reservation group', description: 'This route is ready to receive the class Reservation subsystem.' },
  'front-office': { title: 'Front Office', subtitle: 'Guest arrivals, departures and room availability.', route: '#/front-office', owner: 'Front Office group', description: 'This route is ready to receive the class Front Office subsystem and Housekeeping room-ready notifications.' },
  'guest-services': { title: 'Guest Services', subtitle: 'Guest assistance and service coordination.', route: '#/guest-services', owner: 'Guest Services group', description: 'This route is ready to receive the class Guest Services subsystem.' },
  rooms: { title: 'Rooms', subtitle: 'Hotel-wide room inventory and availability.', route: '#/rooms', owner: 'Rooms group', description: 'This route is ready to receive the shared Rooms subsystem. Housekeeping room status remains available under Housekeeping.' },
  'food-beverage': { title: 'F&B Services', subtitle: 'Food and beverage operations.', route: '#/food-beverage', owner: 'Food and Beverage group', description: 'This route is ready to receive the class Food and Beverage subsystem.' },
  finance: { title: 'Finance', subtitle: 'Financial records and accounting operations.', route: '#/finance', owner: 'Finance group', description: 'This route is ready to receive the class Finance subsystem.' },
  reports: { title: 'Reports', subtitle: 'Cross-department reports and analytics.', route: '#/reports', owner: 'Main HOSIS integration team', description: 'This route is ready for consolidated reports from every subsystem.' },
  settings: { title: 'Settings', subtitle: 'System configuration and access management.', route: '#/settings', owner: 'Main HOSIS integration team', description: 'This route is ready for the shared system settings module.' },
}

function currentRoute() {
  const segments = window.location.hash.replace(/^#\//, '').split('/').filter(Boolean)
  if (segments[0] === 'housekeeping') {
    const tab = TABS.some((item) => item.id === segments[1]) ? segments[1] : 'overview'
    return { section: 'housekeeping', tab }
  }
  const section = SYSTEM_PAGES[segments[0]] ? segments[0] : 'housekeeping'
  return { section, tab: 'overview' }
}

export default function HousekeepingApp() {
  const [session, setSession] = useState(getSession)
  const [route, setRoute] = useState(currentRoute)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const onHash = () => {
      setRoute(currentRoute())
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

  const isHousekeeping = route.section === 'housekeeping'
  const page = isHousekeeping ? PAGES[route.tab] : SYSTEM_PAGES[route.section]
  const Page = isHousekeeping ? page.component : null

  return (
    <div className="hk-app">
      <Sidebar activeSection={route.section} />
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
          {isHousekeeping ? (
            <>
              <Tabs current={route.tab} />
              <Page key={route.tab} user={session.user} search={search} />
            </>
          ) : (
            <SystemModulePage module={page} />
          )}
        </main>
        <footer className="hk-footer">
          <span>Grand Horizon Hotel · Housekeeping operations</span>
          <span>HOSIS</span>
        </footer>
      </div>
    </div>
  )
}
