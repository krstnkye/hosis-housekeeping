import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import NotificationBell from './NotificationBell.jsx'
import { api } from '../api.js'
import { Notice } from './ui.jsx'
import { TABS } from '../tabs.js'
import logoSidebar from '../assets/logo-sidebar.png'
import logoMark from '../assets/logo-mark.png'

// Housekeeping menu from the Figma design. It can be minimized to icons only.
export function Sidebar({ current, collapsed, onToggle }) {
  return (
    <aside className={`hk-sidebar${collapsed ? ' is-collapsed' : ''}`}>
      <button
        type="button"
        className="hk-sidebar__toggle"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand menu' : 'Minimize menu'}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand menu' : 'Minimize menu'}
      >
        <Icon d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
      </button>
      <div className="hk-brand">
        <img
          src={collapsed ? logoMark : logoSidebar}
          alt="Grand Horizon Hotel - Stay, Relax, Belong"
          className={collapsed ? 'hk-brand__mark' : 'hk-brand__logo'}
        />
      </div>
      <nav className="hk-nav" aria-label="Housekeeping functions">
        {TABS.map((t) => {
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

// Top bar: page title (where the search bar used to be), bell, user and End session.
export function Topbar({ title, subtitle, user, onLogout }) {
  const [confirm, setConfirm] = useState(false)
  const now = new Date()
  return (
    <header className="hk-topbar">
      <div className="hk-topbar__title">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="hk-user">
        <span className="hk-topbar__date">
          {now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <NotificationBell />
        <span className="hk-user__avatar" aria-hidden="true">
          <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />
        </span>
        <span className="hk-user__text">
          <strong>{user.name}</strong>
          <small>{user.position ? `Housekeeping ${user.position.toLowerCase()}` : user.role}</small>
        </span>
        <button type="button" className="hk-btn hk-btn--end" onClick={() => setConfirm(true)}>
          End session
        </button>
      </div>
      {confirm && <EndSession onCancel={() => setConfirm(false)} onConfirm={onLogout} />}
    </header>
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
