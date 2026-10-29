import { useState } from 'react'
import { api } from '../api.js'
import ExportMenu from '../components/ExportMenu.jsx'
import Modal from '../components/Modal.jsx'
import { Badge, Card, DataTable, Field, LoadState, Notice, SearchBox } from '../components/ui.jsx'
import { formatDateTime, label, PRIORITIES } from '../format.js'
import { useLoad } from '../useLoad.js'

const REQUEST_TYPES = ['TOWELS', 'AMENITIES', 'EXTRA_BED', 'CLEANING', 'LAUNDRY', 'OTHER']

const REPORT_COLUMNS = [
  { title: 'Room', value: (r) => r.room_number },
  { title: 'Request', value: (r) => label(r.request_type) },
  { title: 'Details', value: (r) => r.request_details },
  { title: 'Guest', value: (r) => r.guest_name?.trim() || '-' },
  { title: 'Priority', value: (r) => label(r.priority) },
  { title: 'Assigned', value: (r) => r.assigned_to?.trim() || 'Unassigned' },
  { title: 'Status', value: (r) => label(r.request_status) },
  { title: 'Requested', value: (r) => formatDateTime(r.requested_at) },
]

// HK-013 Record Request -> Assign / Process Request -> HK-014 Complete Request.
export default function GuestRequestsPage({ search: topSearch }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState(null)
  const requests = useLoad(() => api.guestRequests('?view=all'), [])
  const lookups = useLoad(() => Promise.all([api.rooms(), api.staff(), api.guests()]), [])

  const query = (search || topSearch).toLowerCase()
  const list = (requests.data?.requests || []).filter(
    (r) =>
      (!status || r.request_status === status) &&
      (!priority || r.priority === priority) &&
      (!query || `${r.room_number} ${r.guest_name || ''} ${r.request_details}`.toLowerCase().includes(query))
  )
  const opened = (requests.data?.requests || []).find((r) => r.request_id === openId)
  const openCount = (requests.data?.requests || []).filter((r) => r.request_status !== 'COMPLETED').length

  function refresh(msg) {
    setFlash(msg)
    setCreating(false)
    setOpenId(null)
    requests.reload()
  }

  const formProps = lookups.data && {
    rooms: lookups.data[0].rooms,
    staff: lookups.data[1].staff,
    guests: lookups.data[2].guests,
    onSaved: refresh,
  }

  return (
    <div className="hk-stack">
      {flash && <Notice tone={flash.tone} title={flash.title}>{flash.text}</Notice>}
      <Card
        title="Guest request records"
        subtitle={`${openCount} open · click a record to open its details`}
        actions={
          <div className="hk-actions">
            <button type="button" className="hk-btn hk-btn--primary" onClick={() => setCreating(true)} disabled={!lookups.data}>+ Record request</button>
            <ExportMenu title="Guest Requests" fileName="guest-requests" columns={REPORT_COLUMNS} rows={list} />
          </div>
        }
      >
        <div className="hk-toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search guest, room or request" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">Status</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
            <option value="">Priority</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
          </select>
        </div>
        <LoadState loading={requests.loading && !requests.data} error={requests.error} />
        <DataTable
          rowKey="request_id"
          rows={list}
          onSelect={(r) => setOpenId(r.request_id)}
          empty="No guest requests match these filters."
          columns={[
            { key: 'room', title: 'Room / Request', render: (r) => <strong>{r.room_number} · {label(r.request_type)}</strong> },
            { key: 'details', title: 'Details', render: (r) => r.request_details },
            { key: 'priority', title: 'Priority', render: (r) => <Badge value={r.priority} /> },
            { key: 'staff', title: 'Assigned', render: (r) => r.assigned_to?.trim() || 'Unassigned' },
            { key: 'status', title: 'Status', render: (r) => <Badge value={r.request_status} /> },
          ]}
        />
      </Card>

      {opened && formProps && (
        <Modal title={`Request for room ${opened.room_number}`} onClose={() => setOpenId(null)}>
          {opened.request_status === 'COMPLETED' ? (
            <CompletedRequest request={opened} />
          ) : (
            <RequestForm key={opened.request_id} request={opened} {...formProps} />
          )}
        </Modal>
      )}
      {creating && formProps && (
        <Modal title="Record guest request" onClose={() => setCreating(false)}>
          <RequestForm {...formProps} />
        </Modal>
      )}
    </div>
  )
}

function CompletedRequest({ request }) {
  return (
    <Card title={`Request details · Room ${request.room_number}`} subtitle={`Requested ${formatDateTime(request.requested_at)}`}>
      <div className="hk-badges"><Badge value="COMPLETED" /><Badge value={request.priority}>{label(request.priority)} priority</Badge></div>
      <p><strong>{label(request.request_type)}:</strong> {request.request_details}</p>
      <ul className="hk-list">
        <li><span>Guest</span><small>{request.guest_name?.trim() || '-'}</small></li>
        <li><span>Handled by</span><small>{request.assigned_to?.trim() || '-'}</small></li>
        <li><span>Completed</span><small>{formatDateTime(request.completed_at)}</small></li>
        <li><span>Completion note</span><small>{request.completion_notes || '-'}</small></li>
      </ul>
    </Card>
  )
}

function RequestForm({ request, rooms, staff, guests, onSaved }) {
  const [form, setForm] = useState({
    roomId: request?.room_id || '',
    guestId: request?.guest_id || '',
    requestType: request?.request_type || 'TOWELS',
    priority: request?.priority || 'NORMAL',
    details: request?.request_details || '',
    staffId: request?.staff_id || '',
  })
  const [completionNotes, setCompletionNotes] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })
  const payload = { ...form, guestId: form.guestId || null, staffId: form.staffId || null }

  async function run(action, msg) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onSaved({ tone: 'green', title: msg })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title={request ? `Request details · Room ${request.room_number}` : 'Record guest request'}
      subtitle={request ? `Requested ${formatDateTime(request.requested_at)}${request.guest_name?.trim() ? ` by ${request.guest_name}` : ''}` : 'Log a new housekeeping request from a guest'}
    >
      {request && <div className="hk-badges"><Badge value={request.request_status} /><Badge value={request.priority}>{label(request.priority)} priority</Badge></div>}
      <div className="hk-form">
        <Field label="Room">
          <select value={form.roomId} onChange={set('roomId')} disabled={!!request}>
            <option value="">Select room</option>
            {rooms.map((r) => <option key={r.room_id} value={r.room_id}>{r.room_number} · {r.room_type}</option>)}
          </select>
        </Field>
        <Field label="Guest">
          <select value={form.guestId} onChange={set('guestId')} disabled={!!request}>
            <option value="">Not specified</option>
            {guests.map((g) => <option key={g.guest_id} value={g.guest_id}>{g.name}</option>)}
          </select>
        </Field>
        <Field label="Request type">
          <select value={form.requestType} onChange={set('requestType')}>
            {REQUEST_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select value={form.priority} onChange={set('priority')}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
          </select>
        </Field>
        <Field label="Request description" wide>
          <textarea rows={2} value={form.details} onChange={set('details')} placeholder="e.g. Two extra towels and a toothbrush kit" />
        </Field>
        <Field label="Assigned staff" wide>
          <select value={form.staffId} onChange={set('staffId')}>
            <option value="">Not assigned</option>
            {staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
          </select>
        </Field>
        {request && (
          <Field label="Completion note" wide>
            <input value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} placeholder="e.g. Delivered to the guest at the door" />
          </Field>
        )}
      </div>
      {request && (
        <label className="hk-check">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          Delivery confirmed with the guest or by the staff member
        </label>
      )}
      {error && <Notice tone="red" title="Not saved">{error}</Notice>}
      <div className="hk-actions">
        <button
          type="button"
          className="hk-btn hk-btn--primary"
          disabled={busy || !form.roomId || !form.details}
          onClick={() =>
            request
              ? run(() => api.updateGuestRequest(request.request_id, payload), 'Request updated.')
              : run(() => api.createGuestRequest(payload), 'Guest request recorded.')
          }
        >
          {request ? 'Save update' : 'Record request'}
        </button>
        {request && (
          <button
            type="button"
            className="hk-btn hk-btn--secondary"
            disabled={busy || !confirmed}
            onClick={() => run(() => api.completeGuestRequest(request.request_id, { completionNotes }), `Request for room ${request.room_number} completed.`)}
          >
            Complete request
          </button>
        )}
      </div>
    </Card>
  )
}
