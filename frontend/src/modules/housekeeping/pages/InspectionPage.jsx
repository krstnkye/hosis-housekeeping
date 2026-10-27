import { useState } from 'react'
import { api } from '../api.js'
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

// HK-007 Inspect Room -> Inspection Passed? -> Mark INSPECTED / Return for Re-cleaning.
export default function InspectionPage({ user }) {
  const queue = useLoad(() => api.inspectionQueue(), [])
  const recent = useLoad(() => api.inspections(), [])
  const [selectedId, setSelectedId] = useState(null)
  const [flash, setFlash] = useState(null)
  const canInspect = ['INSPECTOR', 'SUPERVISOR'].includes(user.position) || user.role === 'ADMIN'

  const list = queue.data?.queue || []
  const selected = list.find((t) => t.task_id === selectedId) || list[0]

  return (
    <div className="hk-grid hk-grid--narrow-left">
      <div className="hk-stack">
        {flash && <Notice tone={flash.tone} title={flash.title}>{flash.text}</Notice>}
        <Card title={`Awaiting inspection · ${list.length}`} subtitle="Rooms cleaned but not yet approved">
          <LoadState loading={queue.loading && !queue.data} error={queue.error} />
          <DataTable
            rowKey="task_id"
            rows={list}
            selectedKey={selected?.task_id}
            onSelect={(t) => setSelectedId(t.task_id)}
            empty="No rooms waiting for inspection."
            columns={[
              { key: 'room', title: 'Room', render: (t) => <strong>{t.room_number}</strong> },
              { key: 'hk', title: 'Cleaned by', render: (t) => t.housekeeper?.trim() || '-' },
              { key: 'done', title: 'Done', render: (t) => formatTime(t.completion_time) },
            ]}
          />
          <p className="hk-footnote">Rooms are sold only after they pass inspection.</p>
        </Card>
        {selected && (
          <Card title="Cleaning evidence">
            <p>{label(selected.task_type)} cleaning by {selected.housekeeper?.trim() || '-'}</p>
            <p className="hk-muted">
              Started {formatTime(selected.start_time)} · Finished {formatTime(selected.completion_time)}
            </p>
            {selected.previous_inspections > 0 && (
              <div className="hk-badges"><Badge value="RETURNED">Re-cleaned after {selected.previous_inspections} failed inspection(s)</Badge></div>
            )}
            {selected.notes && <p className="hk-muted">Note: {selected.notes}</p>}
          </Card>
        )}
        <Card title="Recent results">
          {recent.data?.inspections.length === 0 && <p className="hk-muted">No inspections recorded yet.</p>}
          <ul className="hk-list">
            {(recent.data?.inspections || []).slice(0, 5).map((i) => (
              <li key={i.inspection_id}>
                <span>Room {i.room_number} <Badge value={i.inspection_result} /></span>
                <small>{i.inspector} · {formatDateTime(i.inspected_at)}</small>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {selected ? (
        <InspectionForm
          key={selected.task_id}
          task={selected}
          user={user}
          canInspect={canInspect}
          onDone={(msg) => {
            setFlash(msg)
            setSelectedId(null)
            queue.reload()
            recent.reload()
          }}
        />
      ) : (
        <Card title="Inspect room"><p className="hk-muted">Select a room from the list.</p></Card>
      )}
    </div>
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
