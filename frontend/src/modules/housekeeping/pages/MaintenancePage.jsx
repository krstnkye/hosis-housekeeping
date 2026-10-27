import { useState } from 'react'
import { api } from '../api.js'
import { Badge, Card, DataTable, Field, LoadState, Notice } from '../components/ui.jsx'
import { formatDateTime, label, PRIORITIES } from '../format.js'
import { useLoad } from '../useLoad.js'

const CATEGORIES = ['PLUMBING', 'ELECTRICAL', 'AIRCON', 'FURNITURE', 'APPLIANCE', 'OTHER']
const RELEASE_CHECKS = [
  'Engineering confirmed the repair is finished',
  'Area is safe (no exposed wiring, leaks or tools left)',
  'Housekeeping will clean the room after repair (DIRTY → cleaning task)',
  'Room goes through inspection before it is sold again',
]

// HK-015 Create Maintenance Request -> Set Room OUT OF ORDER -> Engineering Completes Repair
// -> Update Status / Create Cleaning Task.
export default function MaintenancePage() {
  const [selectedId, setSelectedId] = useState(null)
  const [flash, setFlash] = useState(null)
  const issues = useLoad(() => api.maintenance(), [])
  const rooms = useLoad(() => api.rooms(), [])

  const list = issues.data?.requests || []
  const selected = list.find((r) => r.request_id === selectedId) || list[0]

  function refresh(msg, id) {
    setFlash(msg)
    if (id) setSelectedId(id)
    issues.reload()
    rooms.reload()
  }

  return (
    <div className="hk-grid hk-grid--even">
      <div className="hk-stack">
        {flash && <Notice tone={flash.tone} title={flash.title}>{flash.text}</Notice>}
        {rooms.data && <ReportForm rooms={rooms.data.rooms} onSaved={refresh} />}
        <Card title={`Open issues · ${list.length}`}>
          <LoadState loading={issues.loading && !issues.data} error={issues.error} />
          <DataTable
            rowKey="request_id"
            rows={list}
            selectedKey={selected?.request_id}
            onSelect={(r) => setSelectedId(r.request_id)}
            empty="No open maintenance issues."
            columns={[
              { key: 'room', title: 'Room / Issue', render: (r) => <strong>{r.room_number} · {label(r.issue_category)}</strong> },
              { key: 'priority', title: 'Priority', render: (r) => <Badge value={r.priority} /> },
              { key: 'status', title: 'Repair status', render: (r) => <Badge value={r.status} /> },
            ]}
          />
        </Card>
      </div>
      <div className="hk-stack">
        {selected ? (
          <IssueTracker key={`${selected.request_id}-${selected.status}`} issue={selected} onSaved={refresh} />
        ) : (
          <Card title="Issue tracker"><p className="hk-muted">No open issues.</p></Card>
        )}
      </div>
    </div>
  )
}

function ReportForm({ rooms, onSaved }) {
  const empty = { roomId: '', priority: 'HIGH', category: 'PLUMBING', description: '', setOutOfOrder: true }
  const [form, setForm] = useState(empty)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })
  const room = rooms.find((r) => String(r.room_id) === String(form.roomId))

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const { request } = await api.reportIssue(form)
      setForm(empty)
      onSaved(
        {
          tone: 'green',
          title: `Issue sent to Engineering (request #${request.request_id})`,
          text: form.setOutOfOrder ? `Room ${room.room_number} is now OUT OF ORDER.` : undefined,
        },
        request.request_id
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Report issue" subtitle="Send room defects to Engineering">
      <div className="hk-form">
        <Field label="Room">
          <select value={form.roomId} onChange={set('roomId')}>
            <option value="">Select room</option>
            {rooms.map((r) => <option key={r.room_id} value={r.room_id}>{r.room_number} · {r.room_type} ({label(r.room_status)})</option>)}
          </select>
        </Field>
        <Field label="Priority / urgency">
          <select value={form.priority} onChange={set('priority')}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
          </select>
        </Field>
        <Field label="Issue category" wide>
          <select value={form.category} onChange={set('category')}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </Field>
        <Field label="Description" wide>
          <textarea rows={3} value={form.description} onChange={set('description')} placeholder="What is wrong and where" />
        </Field>
      </div>
      <label className="hk-check">
        <input type="checkbox" checked={form.setOutOfOrder} onChange={(e) => setForm({ ...form, setOutOfOrder: e.target.checked })} />
        Set room OUT OF ORDER until repaired
      </label>
      {form.setOutOfOrder && (
        <Notice tone="red" title="OUT OF ORDER - do not assign to guests">
          Front Office cannot sell the room until Engineering completes the repair and Housekeeping releases it.
        </Notice>
      )}
      {error && <Notice tone="red" title="Not sent">{error}</Notice>}
      <div className="hk-actions">
        <button type="button" className="hk-btn hk-btn--primary" disabled={busy || !form.roomId || !form.description} onClick={save}>
          Send to Engineering
        </button>
      </div>
    </Card>
  )
}

function IssueTracker({ issue, onSaved }) {
  const [status, setStatus] = useState(issue.status)
  const [checks, setChecks] = useState(RELEASE_CHECKS.map(() => false))
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const repaired = issue.status === 'REPAIRED'

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      onSaved(await action(), issue.request_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card title={`Room ${issue.room_number} · Issue tracker`} subtitle={`Request #${issue.request_id}`}>
        <div className="hk-badges">
          <Badge value={issue.room_status} />
          <Badge value={issue.status}>Repair: {label(issue.status)}</Badge>
          <Badge value={issue.priority}>{label(issue.priority)}</Badge>
        </div>
        <p>{label(issue.issue_category)}: {issue.issue_description}</p>
        <ul className="hk-list">
          <li><span>Reported by {issue.reported_by_name}</span><small>{formatDateTime(issue.reported_at)}</small></li>
          {issue.room_set_ooo && <li><span>Room set OUT OF ORDER</span><small>{formatDateTime(issue.reported_at)}</small></li>}
          {issue.resolved_at && <li><span>Engineering completed the repair</span><small>{formatDateTime(issue.resolved_at)}</small></li>}
        </ul>
        <Field label="Repair status (from Engineering)" wide>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="REPORTED">Reported</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="REPAIRED">Repaired</option>
          </select>
        </Field>
        {error && <Notice tone="red" title="Not saved">{error}</Notice>}
        <div className="hk-actions">
          <button
            type="button"
            className="hk-btn hk-btn--secondary"
            disabled={busy || status === issue.status}
            onClick={() =>
              run(async () => {
                await api.updateIssue(issue.request_id, { status })
                return { tone: 'green', title: `Repair status set to ${label(status)}.` }
              })
            }
          >
            Update repair status
          </button>
        </div>
      </Card>

      <Card title="After repair · safe-to-release conditions">
        <div className="hk-checklist">
          {RELEASE_CHECKS.map((text, i) => (
            <label key={text} className="hk-check">
              <input
                type="checkbox"
                checked={checks[i]}
                disabled={!repaired}
                onChange={(e) => setChecks(checks.map((c, j) => (j === i ? e.target.checked : c)))}
              />
              {text}
            </label>
          ))}
        </div>
        {!repaired && (
          <Notice tone="amber" title="Repair must be completed first">
            Engineering has to mark the repair as Repaired before the room can be released to Housekeeping.
          </Notice>
        )}
        <div className="hk-actions">
          <button
            type="button"
            className="hk-btn hk-btn--primary"
            disabled={busy || !repaired || !checks.every(Boolean)}
            onClick={() =>
              run(async () => {
                const res = await api.releaseRoom(issue.request_id)
                return res.task
                  ? { tone: 'green', title: `Room ${issue.room_number} is now DIRTY`, text: `Post-repair cleaning task #${res.task.task_id} was created. Assign it on the Cleaning Tasks page.` }
                  : { tone: 'green', title: 'Issue closed.' }
              })
            }
          >
            Update status & create cleaning task
          </button>
        </div>
      </Card>
    </>
  )
}
