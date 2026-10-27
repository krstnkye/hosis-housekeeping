import { useState } from 'react'
import { api } from '../api.js'
import { Badge, Card, DataTable, Field, LoadState, Notice } from '../components/ui.jsx'
import { addDays, formatTime, label, todayISO } from '../format.js'
import { useLoad } from '../useLoad.js'

const SHIFT_TIMES = {
  MORNING: ['06:00', '14:00'],
  AFTERNOON: ['14:00', '22:00'],
  NIGHT: ['22:00', '06:00'],
}

// HK-008 View Staff Schedule, HK-009 Create/Update Schedule, Assign Workload/Shift.
export default function SchedulesPage({ user, search }) {
  const [date, setDate] = useState(todayISO)
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState(null)
  const schedules = useLoad(() => api.schedules(date), [date])
  const staff = useLoad(() => api.staff(), [])
  const isSupervisor = user.position === 'SUPERVISOR' || user.role === 'ADMIN'

  const rows = (schedules.data?.schedules || []).filter(
    (s) => !search || `${s.staff_name} ${s.assigned_area}`.toLowerCase().includes(search.toLowerCase())
  )
  const selected = creating ? null : rows.find((s) => s.schedule_id === selectedId) || null
  const coverage = schedules.data?.coverage
  const busiest = [...rows].sort((a, b) => b.assigned_tasks - a.assigned_tasks)[0]

  return (
    <div className="hk-grid">
      <div className="hk-stack">
        {flash && <Notice tone={flash.tone} title={flash.title}>{flash.text}</Notice>}
        <Card title="Staff schedule" subtitle="Housekeepers, inspectors and supervisors on duty">
          <div className="hk-toolbar">
            <div className="hk-date-nav">
              <button type="button" className="hk-btn hk-btn--secondary" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              <button type="button" className="hk-btn hk-btn--secondary" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
            </div>
            <Badge value="AVAILABLE">{rows.length} staff on duty</Badge>
          </div>
          <LoadState loading={schedules.loading && !schedules.data} error={schedules.error} />
          <DataTable
            rowKey="schedule_id"
            rows={rows}
            selectedKey={selected?.schedule_id}
            onSelect={(s) => {
              setCreating(false)
              setSelectedId(s.schedule_id)
            }}
            empty="Nobody is scheduled on this day."
            columns={[
              { key: 'name', title: 'Staff', render: (s) => <span><strong>{s.staff_name}</strong><small className="hk-block">{label(s.position)}</small></span> },
              { key: 'shift', title: 'Shift', render: (s) => `${formatTime(s.start_time)} - ${formatTime(s.end_time)}` },
              { key: 'area', title: 'Assigned area', render: (s) => s.assigned_area },
              { key: 'tasks', title: 'Workload', render: (s) => `${s.assigned_tasks} task(s)` },
            ]}
          />
          {busiest && busiest.assigned_tasks > 0 && (
            <Notice tone="violet" title={`Highest workload: ${busiest.staff_name} (${busiest.assigned_tasks} tasks)`}>
              Consider moving tasks to staff with fewer rooms on the Cleaning Tasks page.
            </Notice>
          )}
        </Card>
        {coverage && (
          <Card title="Shift coverage">
            <div className="hk-coverage">
              {Object.entries(coverage).map(([shift, count]) => (
                <div key={shift}>
                  <span>{label(shift)}</span>
                  <strong>{count}</strong>
                  <small>{SHIFT_TIMES[shift].map(formatTime).join(' - ')}</small>
                </div>
              ))}
            </div>
          </Card>
        )}
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
          <input type="date" value={form.shiftDate} onChange={set('shiftDate')} disabled={!isSupervisor} />
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
