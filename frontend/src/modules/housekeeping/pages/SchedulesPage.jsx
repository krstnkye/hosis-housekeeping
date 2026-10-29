import { useState } from 'react'
import { api } from '../api.js'
import { Badge, Card, DataTable, Field, LoadState, Notice } from '../components/ui.jsx'
import DatePicker, { DateNav } from '../components/DatePicker.jsx'
import MySchedulePage from './MySchedulePage.jsx'
import { formatTime, label, longDate, todayISO } from '../format.js'
import { useLoad } from '../useLoad.js'

const SHIFT_TIMES = {
  MORNING: ['06:00', '14:00'],
  AFTERNOON: ['14:00', '22:00'],
  NIGHT: ['22:00', '06:00'],
}

const VIEWS = [
  ['', 'Availability'],
  ['ASSIGNED', 'Assigned'],
  ['DAY_OFF', 'Day Off'],
]

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// HK-008 View Staff Schedule, HK-009 Create/Update Schedule, Assign Workload/Shift.
export default function SchedulesPage({ user, search }) {
  const [mode, setMode] = useState(user.position === 'HOUSEKEEPER' ? 'mine' : 'staff')
  if (user.position === 'HOUSEKEEPER') return <MySchedulePage user={user} />
  return (
    <div className="hk-stack">
      <div className="hk-segmented" role="group" aria-label="Schedule view">
        <button type="button" className={mode === 'mine' ? 'is-active' : ''} aria-pressed={mode === 'mine'} onClick={() => setMode('mine')}>
          My schedule
        </button>
        <button type="button" className={mode === 'staff' ? 'is-active' : ''} aria-pressed={mode === 'staff'} onClick={() => setMode('staff')}>
          HK staff
        </button>
      </div>
      {mode === 'mine' ? <MySchedulePage user={user} /> : <StaffSchedules user={user} search={search} />}
    </div>
  )
}

function StaffSchedules({ user, search }) {
  const [date, setDate] = useState(todayISO)
  const [view, setView] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState(null)
  const schedules = useLoad(() => api.schedules(date), [date])
  const staff = useLoad(() => api.staff(), [])
  const isSupervisor = user.position === 'SUPERVISOR' || user.role === 'ADMIN'

  const onDuty = schedules.data?.schedules || []
  const scheduled = new Set(onDuty.map((s) => s.staff_id))
  const dayOff = (staff.data?.staff || [])
    .filter((s) => !scheduled.has(s.user_id))
    .map((s) => ({ schedule_id: `off-${s.user_id}`, staff_id: s.user_id, staff_name: s.name, position: s.position, off: true }))
  const all = view === 'ASSIGNED' ? onDuty : view === 'DAY_OFF' ? dayOff : [...onDuty, ...dayOff]
  const rows = all.filter(
    (s) => !search || `${s.staff_name} ${s.assigned_area || ''}`.toLowerCase().includes(search.toLowerCase())
  )
  const selected = creating ? null : onDuty.find((s) => s.schedule_id === selectedId) || null
  const assigned = onDuty.reduce((n, s) => n + s.assigned_tasks, 0)
  const completed = onDuty.reduce((n, s) => n + (s.completed_tasks || 0), 0)

  const coverage = Object.keys(SHIFT_TIMES).map((shift) => {
    const people = onDuty.filter((s) => s.shift === shift)
    const parts = ['HOUSEKEEPER', 'INSPECTOR', 'SUPERVISOR']
      .map((pos) => [pos, people.filter((s) => s.position === pos).length])
      .filter(([, n]) => n)
      .map(([pos, n]) => plural(n, label(pos).toLowerCase()))
    return { shift, count: people.length, text: parts.join(' + ') || 'No staff scheduled' }
  })

  return (
    <div className="hk-grid">
      <div className="hk-stack">
        {flash && <Notice tone={flash.tone} title={flash.title}>{flash.text}</Notice>}
        <Card title={date === todayISO() ? "Today's staff schedule" : 'Staff schedule'} subtitle="Housekeepers, inspectors and supervisors">
          <div className="hk-chips" role="group" aria-label="Filter staff">
            {VIEWS.map(([v, text]) => (
              <button key={v || 'all'} type="button" className={`hk-chip${view === v ? ' is-active' : ''}`} aria-pressed={view === v} onClick={() => setView(v)}>
                {text}
                <span>{v === 'ASSIGNED' ? onDuty.length : v === 'DAY_OFF' ? dayOff.length : onDuty.length + dayOff.length}</span>
              </button>
            ))}
          </div>
          <DateNav value={date} onChange={setDate}>
            <Badge value="AVAILABLE">{onDuty.length} staff on duty</Badge>
          </DateNav>
          <LoadState loading={schedules.loading && !schedules.data} error={schedules.error} />
          <DataTable
            rowKey="schedule_id"
            rows={rows}
            selectedKey={selected?.schedule_id}
            darkHover
            onSelect={(s) => {
              if (s.off) return
              setCreating(false)
              setSelectedId(s.schedule_id)
            }}
            empty={view === 'DAY_OFF' ? 'Everyone is scheduled on this day.' : 'Nobody is scheduled on this day.'}
            columns={[
              { key: 'name', title: 'Housekeeper', render: (s) => <span><strong>{s.staff_name}</strong><small className="hk-block">{label(s.position)}</small></span> },
              { key: 'shift', title: 'Shift', render: (s) => (s.off ? <Badge value="DAY_OFF">Day off</Badge> : <span>{label(s.shift)}<small className="hk-block">{formatTime(s.start_time)} - {formatTime(s.end_time)}</small></span>) },
              { key: 'tasks', title: 'Assigned', render: (s) => (s.off ? '-' : <span>{plural(s.assigned_tasks, 'room')}<small className="hk-block">{s.assigned_area}</small></span>) },
              { key: 'done', title: 'Complete', render: (s) => (s.off ? '-' : `${s.completed_tasks || 0} / ${s.assigned_tasks}`) },
            ]}
          />
          {onDuty.length > 0 && (
            <Notice tone="violet" title={`${plural(assigned, 'cleaning task')} allocated · ${completed} complete · ${assigned - completed} remaining`}>
              Move rooms between housekeepers on the Cleaning Tasks page to balance the workload.
            </Notice>
          )}
        </Card>
        <Card title="Shift coverage">
          <ul className="hk-list hk-list--plain">
            {coverage.map((c) => (
              <li key={c.shift}>
                <span><strong>{label(c.shift)} shift</strong> · {c.text}</span>
                <small>{SHIFT_TIMES[c.shift].map(formatTime).join(' - ')}</small>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {staff.data ? (
        <ScheduleForm
          key={selected?.schedule_id || `new-${date}`}
          schedule={selected}
          date={date}
          staff={staff.data.staff}
          isSupervisor={isSupervisor}
          onNew={() => {
            setCreating(true)
            setSelectedId(null)
          }}
          onSaved={(msg) => {
            setFlash(msg)
            setCreating(false)
            schedules.reload()
          }}
        />
      ) : (
        <Card title="Create / update schedule"><LoadState loading={staff.loading} error={staff.error} /></Card>
      )}
    </div>
  )
}

function ScheduleForm({ schedule, date, staff, isSupervisor, onNew, onSaved }) {
  const [form, setForm] = useState({
    staffId: schedule?.staff_id || '',
    shiftDate: schedule?.shift_date || date,
    shift: schedule?.shift || 'MORNING',
    startTime: schedule?.start_time?.slice(0, 5) || '06:00',
    endTime: schedule?.end_time?.slice(0, 5) || '14:00',
    assignedArea: schedule?.assigned_area || '',
    notes: schedule?.notes || '',
  })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  function setShift(e) {
    const shift = e.target.value
    const [startTime, endTime] = SHIFT_TIMES[shift]
    setForm({ ...form, shift, startTime, endTime })
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (schedule) {
        await api.updateSchedule(schedule.schedule_id, form)
      } else {
        await api.createSchedule(form)
      }
      onSaved({ tone: 'green', title: 'Schedule saved.' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title="Create / update schedule"
      subtitle={schedule ? `Editing ${schedule.staff_name}'s shift` : 'Add a shift for a staff member'}
      actions={schedule && isSupervisor && <button type="button" className="hk-btn hk-btn--secondary" onClick={onNew}>+ New schedule</button>}
    >
      <div className="hk-form">
        <Field label="Staff member" wide>
          <select value={form.staffId} onChange={set('staffId')} disabled={!!schedule || !isSupervisor}>
            <option value="">Select staff</option>
            {staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.name} ({label(s.position)})</option>)}
          </select>
        </Field>
        <Field label="Schedule date">
          <DatePicker
            value={form.shiftDate}
            onChange={(d) => setForm({ ...form, shiftDate: d })}
            disabled={!isSupervisor}
            format={(d) => longDate(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          />
        </Field>
        <Field label="Shift">
          <select value={form.shift} onChange={setShift} disabled={!isSupervisor}>
            {Object.keys(SHIFT_TIMES).map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </Field>
        <Field label="Shift start">
          <input type="time" value={form.startTime} onChange={set('startTime')} disabled={!isSupervisor} />
        </Field>
        <Field label="Shift end">
          <input type="time" value={form.endTime} onChange={set('endTime')} disabled={!isSupervisor} />
        </Field>
        <Field label="Assigned area / workload" wide>
          <input value={form.assignedArea} onChange={set('assignedArea')} placeholder="e.g. Floor 2, rooms 201-205" disabled={!isSupervisor} />
        </Field>
        <Field label="Notes" wide>
          <textarea rows={2} value={form.notes} onChange={set('notes')} disabled={!isSupervisor} />
        </Field>
      </div>
      {!isSupervisor && <Notice tone="amber" title="View only">Only supervisors can create or change schedules.</Notice>}
      {error && <Notice tone="red" title="Schedule not saved">{error}</Notice>}
      {isSupervisor && (
        <div className="hk-actions">
          <button
            type="button"
            className="hk-btn hk-btn--primary"
            disabled={busy || !form.staffId || !form.assignedArea}
            onClick={save}
          >
            Save schedule
          </button>
        </div>
      )}
    </Card>
  )
}
