import { useState } from 'react'
import { api } from '../api.js'
import ExportMenu from '../components/ExportMenu.jsx'
import { exportPdf } from '../exportReport.js'
import { Badge, Card, DataTable, Field, LoadState, Notice } from '../components/ui.jsx'
import { formatDateTime, formatTime, label } from '../format.js'
import { useLoad } from '../useLoad.js'

const CHECKLIST = [
  { id: 'bed', title: 'Bed and linen', text: 'Fresh linen, bed made, no stains' },
  { id: 'bathroom', title: 'Bathroom sanitation', text: 'Toilet, shower and sink cleaned and dry' },
  { id: 'amenities', title: 'Amenities replenished', text: 'Toiletries, towels, water and coffee set' },
  { id: 'floors', title: 'Floors and surfaces', text: 'Vacuumed, dusted, no trash left' },
  { id: 'fixtures', title: 'Fixtures and equipment', text: 'Lights, aircon, TV and phone working' },
]

const PROGRESS = [
  { value: 'COMPLETED', text: 'Awaiting inspection' },
  { value: 'RETURNED', text: 'Returned for re-cleaning' },
  { value: 'INSPECTED', text: 'Passed' },
  { value: '', text: 'All progress' },
]

const REPORT_COLUMNS = [
  { title: 'Room', value: (t) => `${t.room_number} ${t.room_type}` },
  { title: 'Cleaning type', value: (t) => label(t.task_type) },
  { title: 'Cleaned by', value: (t) => t.housekeeper?.trim() || '-' },
  { title: 'Priority', value: (t) => label(t.priority) },
  { title: 'Progress', value: (t) => progressText(t.task_status) },
  { title: 'Finished', value: (t) => formatDateTime(t.completion_time) },
]

function progressText(status) {
  return PROGRESS.find((p) => p.value === status)?.text || label(status)
}

// HK-007 Inspect Room -> Inspection Passed? -> Mark INSPECTED / Return for Re-cleaning.
export default function InspectionPage({ user }) {
  const [progress, setProgress] = useState('COMPLETED')
  const list = useLoad(
    () =>
      Promise.all(['COMPLETED', 'RETURNED', 'INSPECTED'].map((s) => api.tasks(`?status=${s}`))).then((r) =>
        r.flatMap((x) => x.tasks)
      ),
    []
  )
  const activity = useLoad(() => api.activity(), [])
  const [selectedId, setSelectedId] = useState(null)
  const [flash, setFlash] = useState(null)
  const canInspect = ['INSPECTOR', 'SUPERVISOR'].includes(user.position) || user.role === 'ADMIN'

  const rows = (list.data || []).filter((t) => !progress || t.task_status === progress)
  const selected = rows.find((t) => t.task_id === selectedId) || rows[0]
  const waiting = (list.data || []).filter((t) => t.task_status === 'COMPLETED').length

  return (
    <div className="hk-grid hk-grid--narrow-left">
      <div className="hk-stack">
        {flash && <Notice tone={flash.tone} title={flash.title}>{flash.text}</Notice>}
        <Card title={`Awaiting inspection · ${waiting}`} subtitle="CLEAN rooms are not yet approved.">
          <label className="hk-inline-field">
            Progress
            <select value={progress} onChange={(e) => setProgress(e.target.value)}>
              {PROGRESS.map((p) => <option key={p.value} value={p.value}>{p.text}</option>)}
            </select>
          </label>
          <LoadState loading={list.loading && !list.data} error={list.error} />
          <DataTable
            rowKey="task_id"
            rows={rows}
            selectedKey={selected?.task_id}
            onSelect={(t) => setSelectedId(t.task_id)}
            empty="No rooms with this progress."
            columns={[
              { key: 'room', title: 'Room', render: (t) => <strong>{t.room_number}</strong> },
              { key: 'hk', title: 'Cleaned by', render: (t) => t.housekeeper?.trim() || '-' },
              { key: 'priority', title: 'Priority', render: (t) => <Badge value={t.priority} /> },
            ]}
          />
          <p className="hk-footnote">Oldest first; inspections can be prioritized by arrival time.</p>
          <div className="hk-report-bar">
            <button
              type="button"
              className="hk-btn hk-btn--secondary hk-btn--block"
              disabled={!rows.length}
              onClick={() => exportPdf({ title: 'Room Inspection Report', fileName: 'inspection-report', columns: REPORT_COLUMNS, rows })}
            >
              Generate report
            </button>
            <ExportMenu label="Export · PDF / Excel" title="Room Inspection Report" fileName="inspection-report" columns={REPORT_COLUMNS} rows={rows} />
          </div>
        </Card>
        <Card title="Recent activity" subtitle="Latest room status changes">
          {activity.data?.activity.length === 0 && <p className="hk-muted">No activity yet.</p>}
          <ul className="hk-list">
            {(activity.data?.activity || []).slice(0, 8).map((a) => (
              <li key={a.log_id}>
                <span>
                  Room {a.room_number}: {label(a.previous_status)} → <strong>{label(a.new_status)}</strong>
                </span>
                <small>{a.changed_by?.trim() || 'System'} · {formatDateTime(a.changed_at)}</small>
              </li>
            ))}
          </ul>
        </Card>
        {selected && (
          <Card title="Cleaning evidence">
            <ul className="hk-list">
              <li>
                <span>Task #{selected.task_id} · {label(selected.task_type)}</span>
              </li>
              <li>
                <span>
                  {selected.housekeeper?.trim() || '-'} · {formatTime(selected.start_time)} - {formatTime(selected.completion_time)}
                </span>
              </li>
            </ul>
            {selected.notes && <p className="hk-muted">{selected.notes}</p>}
          </Card>
        )}
      </div>

      {selected?.task_status === 'COMPLETED' ? (
        <InspectionForm
          key={selected.task_id}
          task={selected}
          user={user}
          canInspect={canInspect}
          onDone={(msg) => {
            setFlash(msg)
            setSelectedId(null)
            list.reload()
            activity.reload()
          }}
        />
      ) : selected ? (
        <InspectionHistory key={selected.task_id} task={selected} />
      ) : (
        <Card title="Inspect room"><p className="hk-muted">Select a room from the list.</p></Card>
      )}
    </div>
  )
}

function InspectionHistory({ task }) {
  const history = useLoad(() => api.inspections(`?taskId=${task.task_id}`), [task.task_id])
  return (
    <Card title={`Room ${task.room_number} · ${task.room_type}`} subtitle={`${label(task.task_type)} cleaning by ${task.housekeeper?.trim() || '-'}`}>
      <div className="hk-badges"><Badge value={task.task_status}>{progressText(task.task_status)}</Badge><Badge value={task.priority}>{label(task.priority)} priority</Badge></div>
      {task.task_status === 'RETURNED' && (
        <Notice tone="amber" title="Waiting for re-cleaning">The housekeeper has to clean the room again before it can be inspected.</Notice>
      )}
      <h3 className="hk-subhead">Inspection results</h3>
      <LoadState loading={history.loading && !history.data} error={history.error} />
      <ul className="hk-list">
        {(history.data?.inspections || []).map((i) => (
          <li key={i.inspection_id}>
            <span><Badge value={i.inspection_result} /> {i.remarks || 'No notes'}</span>
            <small>{i.inspector} · {formatDateTime(i.inspected_at)}</small>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function InspectionForm({ task, user, canInspect, onDone }) {
  const [checks, setChecks] = useState(Object.fromEntries(CHECKLIST.map((c) => [c.id, false])))
  const [remarks, setRemarks] = useState('')
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const allChecked = Object.values(checks).every(Boolean)

  async function submit(result) {
    setBusy(true)
    setMessage(null)
    try {
      await api.inspect({ taskId: task.task_id, result, checklist: checks, remarks })
      onDone(
        result === 'PASSED'
          ? { tone: 'green', title: `Room ${task.room_number} marked INSPECTED`, text: 'Front Office has been notified.' }
          : { tone: 'amber', title: `Room ${task.room_number} returned for re-cleaning`, text: 'The task is back with the housekeeper and the room is DIRTY.' }
      )
    } catch (err) {
      setMessage({ tone: 'red', title: 'Inspection not saved', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={`Inspect Room ${task.room_number} · ${task.room_type}`} subtitle="Tick each item that meets the standard">
      <div className="hk-form">
        <Field label="Inspector">
          <input value={user.name} disabled />
        </Field>
        <Field label="Room status">
          <input value={label(task.room_status)} disabled />
        </Field>
      </div>
      <h3 className="hk-subhead">Inspection checklist</h3>
      <div className="hk-checklist">
        {CHECKLIST.map((c) => (
          <label key={c.id} className="hk-check hk-check--block">
            <input
              type="checkbox"
              checked={checks[c.id]}
              disabled={!canInspect}
              onChange={(e) => setChecks({ ...checks, [c.id]: e.target.checked })}
            />
            <span>
              <strong>{c.title}</strong>
              <small>{c.text}</small>
            </span>
          </label>
        ))}
      </div>
      <Field label="Inspector notes / reason for re-cleaning" wide>
        <textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} disabled={!canInspect} />
      </Field>

      {!canInspect && <Notice tone="amber" title="Inspectors only">Only inspectors and supervisors can record inspection results.</Notice>}
      {canInspect && allChecked && (
        <Notice tone="green" title="Pass: INSPECTED → Front Office notified">
          All checklist items met. Passing marks the room INSPECTED and tells Front Office it is ready.
        </Notice>
      )}
      {message && <Notice tone={message.tone} title={message.title}>{message.text}</Notice>}

      <div className="hk-actions">
        <button type="button" className="hk-btn hk-btn--primary" disabled={!canInspect || !allChecked || busy} onClick={() => submit('PASSED')}>
          Pass - Mark INSPECTED
        </button>
        <button type="button" className="hk-btn hk-btn--secondary" disabled={!canInspect || !remarks || busy} onClick={() => submit('FAILED')}>
          Fail - Return for re-cleaning
        </button>
      </div>
    </Card>
  )
}
