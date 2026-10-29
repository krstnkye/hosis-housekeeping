import { useEffect, useState } from 'react'
import { label } from '../format.js'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import NotificationBell from './NotificationBell.jsx'
import { api } from '../api.js'
import { Notice } from './ui.jsx'
import { TABS } from '../tabs.js'
import logoSidebar from '../assets/logo-sidebar.png'
import logoMark from '../assets/logo-mark.png'

// Housekeeping menu from the Figma design. It can be minimized to icons only.
// Housekeepers see "My Schedule" in place of the supervisor's Schedules page.
export function Sidebar({ current, collapsed, onToggle, tabs = TABS }) {
  return (
    <aside className={`hk-sidebar${collapsed ? ' is-collapsed' : ''}`}>
      <div className="hk-brand">
        <img
          src={collapsed ? logoMark : logoSidebar}
          alt="Grand Horizon Hotel - Stay, Relax, Belong"
          className={collapsed ? 'hk-brand__mark' : 'hk-brand__logo'}
        />
      </div>
      <button
        type="button"
        className="hk-sidebar__toggle"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand menu' : 'Minimize menu'}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand menu' : 'Minimize menu'}
      >
        <Icon d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} size={16} />
      </button>
      <nav className="hk-nav" aria-label="Housekeeping functions">
        {tabs.map((t) => {
          const active = t.id === current
          return (
            <a
              key={t.id}
              href={`#/housekeeping/${t.id}`}
              className={`hk-nav__item${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-label={collapsed ? t.name : undefined}
              title={collapsed ? t.name : undefined}
            >
              <Icon d={t.icon} />
              {!collapsed && <span>{t.name}</span>}
            </a>
          )
        })}
      </nav>
    </aside>
  )
}

// Top bar from the Figma design: notification bell on the left, the signed-in
// staff member and End session on the right.
export function Topbar({ user, onLogout }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <header className="hk-topbar">
      <NotificationBell />
      <div className="hk-user">
        <span className="hk-user__avatar" aria-hidden="true">
          <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" size={18} />
        </span>
        <span className="hk-user__text">
          <strong>{user.name}</strong>
          <small>{user.position ? `Housekeeping ${label(user.position)} · Shared session active` : user.role}</small>
        </span>
        <button type="button" className="hk-btn hk-btn--end" onClick={() => setConfirm(true)}>
          End session
        </button>
      </div>
      {confirm && <EndSession onCancel={() => setConfirm(false)} onConfirm={onLogout} />}
    </header>
  )
}

// Page title with today's date and a clock, as in every Figma frame.
export function PageHeader({ title, subtitle, actions }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="hk-page-head">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="hk-page-head__side">
        {actions}
        <time className="hk-page-head__clock" dateTime={now.toISOString()}>
          {now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          <br />
          {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </time>
      </div>
    </div>
  )
}

// "End current session?" confirmation from the Figma design.
function EndSession({ onCancel, onConfirm }) {
  const [stats, setStats] = useState(null)
  useEffect(() => {
    api.dashboard().then((d) => setStats(d.stats)).catch(() => {})
  }, [])
  const openWork = stats && stats.open_tasks + stats.awaiting_inspection + stats.open_requests > 0

  return (
    <Modal title="End current session?" onClose={onCancel} variant="confirm">
      <div className="hk-confirm__head">End current session?</div>
      <div className="hk-confirm__body">
        <p>You'll leave this Housekeeping session and return to staff sign-in.</p>
        {openWork && (
          <Notice tone="amber" title="Unfinished work stays open">
            {stats.open_tasks} cleaning task(s) remaining · {stats.awaiting_inspection} pending inspection(s)
            <br />
            {stats.open_requests} open guest request(s)
            <br />
            Ending this session does not end your shift, complete or cancel tasks, or release rooms.
          </Notice>
        )}
        <p className="hk-confirm__hint">Choose No to return to the Housekeeping Dashboard and continue working.</p>
        <div className="hk-actions">
          <button type="button" className="hk-btn hk-btn--secondary" onClick={onCancel}>
            No, continue working
          </button>
          <button type="button" className="hk-btn hk-btn--primary" onClick={onConfirm}>
            Yes, end session
          </button>
        </div>
      </div>
    </Modal>
  )
}
