import { useState } from 'react'
import { api } from '../api.js'
import Icon from '../components/Icon.jsx'
import { Badge, Card, DataTable, LoadState, Notice } from '../components/ui.jsx'
import { formatDateTime, formatTime, label, todayISO } from '../format.js'
import { useLoad } from '../useLoad.js'

const DONE = ['COMPLETED', 'INSPECTED']
const TODO = ['PENDING', 'ASSIGNED', 'RETURNED']

// Icon for each kind of notification from the bell's /alerts feed.
const ALERT_ICONS = {
  TASK: 'M4 21V9h7v12M11 21V5h9v16M14 9h3M14 13h3',
  REQUEST: 'M12 21a9 9 0 1 1 6.4-15.4M21 4l-9 9-3-3',
  ROOM_READY: 'M3 18V8h18v10M3 14h18M7 11h4',
  MAINTENANCE: 'M7 3h10v4H7zM9 7v14h6V7',
  INSPECTION: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM8 20a4 4 0 0 1 8 0z',
}

const SHORTCUTS = [
  { href: '#/housekeeping/tasks', title: 'My cleaning tasks', note: 'Start and finish your rooms', icon: 'M4 21V9h7v12M11 21V5h9v16M14 9h3M14 13h3M7 13h1M4 21h16' },
  { href: '#/housekeeping/requests', title: 'Guest requests', note: 'Deliver towels, amenities and more', icon: 'M12 21a9 9 0 1 1 6.4-15.4M21 4l-9 9-3-3M9.5 15.5h4' },
  { href: '#/housekeeping/lost-found', title: 'Record a found item', note: 'Log belongings left in a room', icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 14v3' },
  { href: '#/housekeeping/report', title: 'Report room condition', note: 'Tell Front Office or Maintenance', icon: 'M5 21V4h11l-1.5 4L16 12H5M9 8h2' },
]

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// Staff Dashboard: what a housekeeper sees after signing in. It only shows the
// signed-in staff member's own work (tasks, requests, shift, notifications);
// creating and assigning work stays on the supervisor dashboard and pages.
export default function StaffDashboardPage({ user }) {
  const [flash, setFlash] = useState(null)
  const [busy, setBusy] = useState(false)
  const today = todayISO()
  const { data, error, loading, reload } = useLoad(
    () => Promise.all([api.tasks('?mine=1'), api.guestRequests(), api.mySchedule(), api.alerts()]),
    []
  )
  if (!data) return <LoadState loading={loading} error={error} />
  const [{ tasks }, { requests }, { schedules }, { alerts }] = data

  const done = tasks.filter((t) => DONE.includes(t.task_status))
  const inProgress = tasks.filter((t) => t.task_status === 'IN_PROGRESS')
  const todo = tasks.filter((t) => TODO.includes(t.task_status))
  const returned = tasks.filter((t) => t.task_status === 'RETURNED')
  const open = [...inProgress, ...todo]
  const pct = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0
  // Finish the room in progress first, then the highest-priority room (the API sorts by priority).
  const next = inProgress[0] || todo[0]

  const myRequests = requests.filter((q) => q.staff_id === user.userId)
  const unassigned = requests.filter((q) => !q.staff_id)
  const shift = schedules.find((s) => s.shift_date === today)
  const upcoming = schedules.find((s) => s.shift_date > today)
  // Same feed as the bell: tasks assigned or returned to this user, new guest requests, rooms released.
  const myAlerts = alerts.slice(0, 6)

  async function run(action, success) {
    setBusy(true)
    setFlash(null)
    try {
      await action()
      setFlash({ tone: 'green', title: success })
      reload()
    } catch (err) {
      setFlash({ tone: 'red', title: 'Not saved', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hk-stack">
      <div className="hk-stats hk-staff-stats">
        <StaffStat title="ASSIGNED TODAY" value={tasks.length} note="rooms on your list" />
        <StaffStat title="TO DO" value={todo.length} note={returned.length ? `${returned.length} returned for re-cleaning` : 'waiting to be started'} warn={returned.length > 0} />
        <StaffStat title="IN PROGRESS" value={inProgress.length} note="cleaning now" />
        <StaffStat title="COMPLETED" value={done.length} note="cleaned or inspected" />
        <StaffStat title="MY REQUESTS" value={myRequests.length} note="guest requests to deliver" />
      </div>

      {flash && <Notice tone={flash.tone} title={flash.title}>{flash.text}</Notice>}

      <div className="hk-grid">
        <div className="hk-stack">
          <Card title="Next room" subtitle={next ? (next.task_status === 'IN_PROGRESS' ? 'You are cleaning this room now' : 'Highest priority room on your list') : 'Nothing waiting for you'}>
            {next ? (
              <NextRoom task={next} busy={busy} onRun={run} />
            ) : (
              <Notice tone="green" title={tasks.length ? 'All your rooms are done' : 'No rooms assigned yet'}>
                {tasks.length
                  ? 'Your rooms are waiting for inspection. Check guest requests while you wait.'
                  : 'Your supervisor has not assigned rooms to you today.'}
              </Notice>
            )}
            <div className="hk-progress">
              <div className="hk-progress__label">
                <span>Today's progress · {done.length} of {plural(tasks.length, 'room')}</span>
                <span>{pct}%</span>
              </div>
              <div className="hk-progress__bar"><span style={{ width: `${pct}%` }} /></div>
            </div>
          </Card>

          <Card
            title="My cleaning tasks"
            subtitle={open.length ? `${plural(open.length, 'room')} left · highest priority first` : 'Assigned to you today'}
            actions={<a className="hk-link" href="#/housekeeping/tasks">Open Cleaning Tasks</a>}
          >
            <DataTable
              rowKey="task_id"
              rows={tasks}
              darkHover
              empty="No cleaning tasks assigned to you today."
              columns={[
                { key: 'room', title: 'Room', render: (t) => <span><strong>Room {t.room_number}</strong><small className="hk-block">{t.room_type}</small></span> },
                { key: 'type', title: 'Cleaning', render: (t) => label(t.task_type) },
                { key: 'due', title: 'Due', render: (t) => formatTime(t.due_time) },
                { key: 'priority', title: 'Priority', render: (t) => <Badge value={t.priority} /> },
                { key: 'status', title: 'Status', render: (t) => <Badge value={t.task_status} /> },
              ]}
            />
            <p className="hk-footnote">Completed rooms go to the inspector. Returned rooms need re-cleaning.</p>
          </Card>

          <Card
            title="My guest requests"
            subtitle={myRequests.length ? 'Deliver these, then mark them done' : 'Requests assigned to you'}
            actions={<a className="hk-link" href="#/housekeeping/requests">Open Guest Requests</a>}
          >
            {myRequests.length ? (
              <ul className="hk-staff-list">
                {myRequests.map((q) => (
                  <li key={q.request_id}>
                    <div>
                      <strong>Room {q.room_number} · {label(q.request_type)}</strong>
                      <small>{q.request_details || 'No details'} · requested {formatDateTime(q.requested_at)}</small>
                    </div>
                    <div className="hk-staff-list__side">
                      <Badge value={q.priority} />
                      <button
                        type="button"
                        className="hk-btn hk-btn--secondary"
                        disabled={busy}
                        onClick={() => run(() => api.completeGuestRequest(q.request_id, {}), `Room ${q.room_number} request marked done.`)}
                      >
                        Mark done
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hk-muted">No guest requests are assigned to you.</p>
            )}
            {unassigned.length > 0 && (
              <Notice tone="amber" title={`${plural(unassigned.length, 'request')} waiting for someone`}>
                Open Guest Requests to pick one up and assign it to yourself.
              </Notice>
            )}
          </Card>
        </div>

        <div className="hk-stack">
          <Card title="My shift today" actions={<a className="hk-link" href="#/housekeeping/schedules">Schedules</a>}>
            {shift ? (
              <div className="hk-next-shift">
                <span>{label(shift.shift)} shift</span>
                <strong>{formatTime(shift.start_time)} - {formatTime(shift.end_time)}</strong>
                <small>{shift.assigned_area || 'Area to be confirmed'}</small>
              </div>
            ) : (
              <Notice tone="amber" title="Day off">You have no shift today.</Notice>
            )}
            {shift?.notes && <p className="hk-muted hk-staff-note">Supervisor note: {shift.notes}</p>}
            {!shift && upcoming && (
              <p className="hk-muted hk-staff-note">
                Next shift: {formatDateLabel(upcoming.shift_date)} · {formatTime(upcoming.start_time)} - {formatTime(upcoming.end_time)}
              </p>
            )}
          </Card>

          <Card title="Notifications" subtitle="Assignments and requests that need you">
            {myAlerts.length ? (
              <ul className="hk-staff-alerts">
                {myAlerts.map((a, i) => (
                  <li key={`${a.type}-${i}`}>
                    <a href={`#/housekeeping/${a.page}`}>
                      <span className={`hk-staff-alerts__icon hk-staff-alerts__icon--${a.type.toLowerCase()}`} aria-hidden="true">
                        <Icon d={ALERT_ICONS[a.type] || ALERT_ICONS.TASK} size={16} />
                      </span>
                      <span>
                        <strong>{a.message}</strong>
                        <small>{a.at ? formatDateTime(a.at) : 'Just now'}</small>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hk-muted">You're all caught up.</p>
            )}
          </Card>

          <Card title="Quick actions">
            <div className="hk-staff-shortcuts">
              {SHORTCUTS.map((s) => (
                <a key={s.href} href={s.href} className="hk-staff-shortcut">
                  <Icon d={s.icon} size={20} />
                  <span>
                    <strong>{s.title}</strong>
                    <small>{s.note}</small>
                  </span>
                </a>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function StaffStat({ title, value, note, warn }) {
  return (
    <div className="hk-stat hk-stat--figma">
      <span className="hk-stat__title">{title}</span>
      <strong className="hk-stat__value">{value}</strong>
      <span className={`hk-stat__note${warn ? ' hk-text--red' : ''}`}>{note}</span>
    </div>
  )
}

// The room to work on now, with the button for its next step.
function NextRoom({ task, busy, onRun }) {
  const blocked = task.room_status === 'OUT_OF_ORDER'
  const working = task.task_status === 'IN_PROGRESS'
  return (
    <div className="hk-staff-next">
      <div className="hk-staff-next__room">
        <span>Room</span>
        <strong>{task.room_number}</strong>
        <small>{task.room_type}</small>
      </div>
      <div className="hk-staff-next__body">
        <div className="hk-badges">
          <Badge value={task.task_status} />
          <Badge value={task.priority}>{label(task.priority)} priority</Badge>
        </div>
        <p>
          <strong>{label(task.task_type)}</strong>
          {task.due_time ? ` · due ${formatTime(task.due_time)}` : ''}
        </p>
        {task.notes && <p className="hk-muted">{task.notes}</p>}
        {task.task_status === 'RETURNED' && (
          <Notice tone="red" title="Returned by the inspector">Clean this room again before it can be approved.</Notice>
        )}
        {blocked && <Notice tone="amber" title="Room is out of order">Wait for Engineering to finish the repair.</Notice>}
        <div className="hk-actions">
          {working ? (
            <button
              type="button"
              className="hk-btn hk-btn--primary"
              disabled={busy || blocked}
              onClick={() => onRun(() => api.completeTask(task.task_id), `Room ${task.room_number} marked clean. It is now waiting for inspection.`)}
            >
              Mark cleaning complete
            </button>
          ) : (
            <button
              type="button"
              className="hk-btn hk-btn--primary"
              disabled={busy || blocked}
              onClick={() => onRun(() => api.startTask(task.task_id), `Started cleaning Room ${task.room_number}.`)}
            >
              Start cleaning
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function formatDateLabel(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}
