import { useState } from 'react'
import { api } from '../api.js'
import { Badge, Card, DataTable, Field, LoadState, Notice, SearchBox } from '../components/ui.jsx'
import { formatDateTime, formatTime, label, PRIORITIES } from '../format.js'
import { useLoad } from '../useLoad.js'

const REQUEST_TYPES = ['TOWELS', 'AMENITIES', 'EXTRA_BED', 'CLEANING', 'LAUNDRY', 'OTHER']

// HK-013 Record Request -> Assign / Process Request -> HK-014 Complete Request.
export default function GuestRequestsPage({ search: topSearch }) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState(null)
  const open = useLoad(() => api.guestRequests(), [])
  const done = useLoad(() => api.guestRequests('?view=completed'), [])
  const lookups = useLoad(() => Promise.all([api.rooms(), api.staff(), api.guests()]), [])

  const query = (search || topSearch).toLowerCase()
  const list = (open.data?.requests || []).filter(
    (r) => !query || `${r.room_number} ${r.guest_name || ''} ${r.request_details}`.toLowerCase().includes(query)
  )
  const selected = creating ? null : list.find((r) => r.request_id === selectedId) || list[0]
  const completed = done.data?.requests || []

  function refresh(msg) {
    setFlash(msg)
    setCreating(false)
    setSelectedId(null)
    open.reload()
    done.reload()
  }

  return (
    <div className="hk-grid">
      <div className="hk-stack">
        {flash && <Notice tone={flash.tone} title={flash.title}>{flash.text}</Notice>}
        <Card title={`Open requests · ${list.length}`} subtitle="Sorted by priority, then time requested">
          <div className="hk-toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder="Search guest or room" />
          </div>
          <LoadState loading={open.loading && !open.data} error={open.error} />
          <DataTable
            rowKey="request_id"
            rows={list}
            selectedKey={selected?.request_id}
            onSelect={(r) => {
              setCreating(false)
              setSelectedId(r.request_id)
            }}
            empty="No open guest requests."
            columns={[
              { key: 'room', title: 'Room / Request', render: (r) => <strong>{r.room_number} · {label(r.request_type)}</strong> },
              { key: 'priority', title: 'Priority', render: (r) => <Badge value={r.priority} /> },
              { key: 'staff', title: 'Assigned', render: (r) => r.assigned_to?.trim() || 'Unassigned' },
              { key: 'status', title: 'Status', render: (r) => <Badge value={r.request_status} /> },
            ]}
          />
        </Card>
        <Card title={`Completed today · ${completed.length}`} subtitle="Kept separate from the open queue">
          <ul className="hk-list">
            {completed.map((r) => (
              <li key={r.request_id}>
                <span><Badge value="COMPLETED" /> Room {r.room_number} · {label(r.request_type)}</span>
                <small>{r.assigned_to?.trim()} · {formatTime(r.completed_at)}</small>
              </li>
            ))}
          </ul>
          {completed.length === 0 && <p className="hk-muted">Nothing completed yet today.</p>}
        </Card>
      </div>

      {lookups.data ? (
        <RequestForm
          key={selected?.request_id || 'new'}
          request={selected}
          rooms={lookups.data[0].rooms}
          staff={lookups.data[1].staff}
          guests={lookups.data[2].guests}
          onNew={() => setCreating(true)}
          onSaved={refresh}
        />
      ) : (
        <Card title="Request details"><LoadState loading={lookups.loading} error={lookups.error} /></Card>
      )}
    </div>
  )
}

function RequestForm({ request, rooms, staff, guests, onNew, onSaved }) {
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
      actions={request && <button type="button" className="hk-btn hk-btn--secondary" onClick={onNew}>+ Record new</button>}
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
      <Notice tone="violet" title="Keep the open queue tidy">Completed requests move to "Completed today" and leave the open list.</Notice>
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
