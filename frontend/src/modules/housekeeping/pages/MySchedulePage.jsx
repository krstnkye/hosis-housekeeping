import { useState } from 'react'
import { api } from '../api.js'
import { Badge, Card, DataTable, LoadState, Notice } from '../components/ui.jsx'
import { DateNav } from '../components/DatePicker.jsx'
import { formatTime, label, longDate, todayISO } from '../format.js'
import { useLoad } from '../useLoad.js'

const DONE = ['COMPLETED', 'INSPECTED']

// My Schedule (Figma "My Schedule — HK Staff"): the signed-in staff member's
// shift, assigned rooms and remaining work for one day.
export default function MySchedulePage({ user }) {
  const today = todayISO()
  const [date, setDate] = useState(today)
  const mine = useLoad(() => Promise.all([api.mySchedule(), api.tasks('?mine=1')]), [])
  if (!mine.data) return <LoadState loading={mine.loading} error={mine.error} />
  const [{ schedules }, { tasks }] = mine.data

  const shift = schedules.find((s) => s.shift_date === date)
  const isToday = date === today
  // The task queue covers today; other days use the counts stored with the shift.
  const dayTasks = isToday ? tasks : []
  const assigned = isToday ? dayTasks.length : shift?.assigned_tasks || 0
  const completed = isToday ? dayTasks.filter((t) => DONE.includes(t.task_status)).length : shift?.completed_tasks || 0
  const remaining = dayTasks.filter((t) => !DONE.includes(t.task_status))
  const pct = assigned ? Math.round((completed / assigned) * 100) : 0
  const upcoming = schedules.filter((s) => s.shift_date > date).slice(0, 3)

  return (
    <div className="hk-grid">
      <div className="hk-stack">
        <Card title={isToday ? "Today's schedule" : 'My schedule'} subtitle={`Shifts and rooms for ${user.name}`}>
          <DateNav value={date} onChange={setDate}>
            <button type="button" className="hk-btn hk-btn--secondary" onClick={() => setDate(today)} disabled={isToday}>Today</button>
          </DateNav>
          <div className="hk-stats hk-stats--three">
            <div className="hk-stat hk-stat--figma">
              <span className="hk-stat__title">ASSIGNED</span>
              <strong className="hk-stat__value">{assigned}</strong>
              <span className="hk-stat__note">rooms on this shift</span>
            </div>
            <div className="hk-stat hk-stat--figma">
              <span className="hk-stat__title">COMPLETED</span>
              <strong className="hk-stat__value">{completed}</strong>
              <span className="hk-stat__note">cleaned or inspected</span>
            </div>
            <div className="hk-stat hk-stat--figma">
              <span className="hk-stat__title">REMAINING</span>
              <strong className="hk-stat__value">{assigned - completed}</strong>
              <span className="hk-stat__note">still to clean</span>
            </div>
          </div>
        </Card>

        <Card title="My remaining rooms" subtitle={isToday ? 'Highest priority first' : 'Room list is shown for today only'}>
          <DataTable
            rowKey="task_id"
            rows={remaining}
            darkHover
            empty={isToday ? 'All your rooms are done.' : 'Pick today to see your room list.'}
            columns={[
              { key: 'room', title: 'Room', render: (t) => <span><strong>Room {t.room_number}</strong><small className="hk-block">{t.room_type}</small></span> },
              { key: 'type', title: 'Cleaning', render: (t) => label(t.task_type) },
              { key: 'priority', title: 'Priority', render: (t) => <Badge value={t.priority}>{label(t.priority)}</Badge> },
              { key: 'status', title: 'Status', render: (t) => <Badge value={t.task_status}>{label(t.task_status)}</Badge> },
            ]}
          />
          {assigned > 0 && (
            <Notice tone={completed === assigned ? 'green' : 'violet'} title={`${completed} of ${assigned} cleaning tasks completed`}>
              {completed === assigned ? 'Your rooms are waiting for inspection.' : 'Start the next room from the Cleaning Tasks page.'}
            </Notice>
          )}
          <div className="hk-actions">
            <a className="hk-btn hk-btn--primary" href="#/housekeeping/tasks">View my cleaning tasks</a>
          </div>
          <div className="hk-progress">
            <div className="hk-progress__label">
              <span>{isToday ? "Today's progress" : 'Progress'}</span>
              <span>{pct}%</span>
            </div>
            <div className="hk-progress__bar"><span style={{ width: `${pct}%` }} /></div>
          </div>
        </Card>
      </div>

      <div className="hk-stack">
        <Card title={shift ? `My ${label(shift.shift).toLowerCase()} shift` : 'My shift'}>
          {shift ? (
            <>
              <div className="hk-next-shift">
                <span>{longDate(date, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                <strong>{formatTime(shift.start_time)} - {formatTime(shift.end_time)}</strong>
                <small>{shift.assigned_area}</small>
              </div>
              <Notice tone="green" title={isToday ? 'On duty' : 'Scheduled'}>
                Break · {breakTime(shift.start_time)} (30 minutes)
              </Notice>
            </>
          ) : (
            <Notice tone="amber" title="Day off">You have no shift on this day.</Notice>
          )}
        </Card>
        <Card title="Shift notes">
          <p className="hk-muted">{shift?.notes || 'No notes from your supervisor.'}</p>
          {upcoming.length > 0 && (
            <ul className="hk-list hk-list--plain">
              {upcoming.map((s) => (
                <li key={s.schedule_id}>
                  <span><strong>{longDate(s.shift_date, { weekday: 'short', month: 'short', day: 'numeric' })}</strong> · {label(s.shift)}</span>
                  <small>{formatTime(s.start_time)} - {formatTime(s.end_time)}</small>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Notice tone="violet" title="Need a schedule change?">
          Only supervisors can change shifts. Talk to your supervisor if you need a swap or a day off.
        </Notice>
      </div>
    </div>
  )
}

// Break starts four hours into the shift.
function breakTime(start) {
  const [h, m] = start.split(':').map(Number)
  return formatTime(`${String((h + 4) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
}
