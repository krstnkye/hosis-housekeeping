import { useState } from 'react'
import { api } from '../api.js'
import ExportMenu from '../components/ExportMenu.jsx'
import Modal from '../components/Modal.jsx'
import { Badge, Card, DataTable, Field, LoadState, Notice, SearchBox } from '../components/ui.jsx'
import { formatDateTime, label } from '../format.js'
import { useLoad } from '../useLoad.js'

const REPORT_COLUMNS = [
  { title: 'Label', value: (i) => i.storage_label },
  { title: 'Item', value: (i) => i.item_description },
  { title: 'Found in', value: (i) => (i.room_number ? `Room ${i.room_number}, ${i.found_location}` : i.found_location) },
  { title: 'Found', value: (i) => formatDateTime(i.found_at) },
  { title: 'Found by', value: (i) => i.found_by_name },
  { title: 'Storage', value: (i) => i.storage_location },
  { title: 'Status', value: (i) => label(i.item_status) },
]

// HK-010 Record Found Item -> Store/Label -> HK-011 Search/View -> Valid Claim? -> HK-012 Release.
export default function LostFoundPage({ search: topSearch }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState(null)
  const [itemOverrides, setItemOverrides] = useState({})
  const items = useLoad(() => api.lostFound(status ? `?status=${status}` : ''), [status])
  const rooms = useLoad(() => api.rooms(), [])

  const query = (search || topSearch).toLowerCase()
  const list = (items.data?.items || [])
    .map((i) => (itemOverrides[i.item_id] ? { ...i, ...itemOverrides[i.item_id] } : i))
    .filter((i) => !query || `${i.storage_label} ${i.item_description} ${i.room_number || ''}`.toLowerCase().includes(query))
  const opened = list.find((i) => i.item_id === openId)

  function refresh(msg, itemId, updatedItem) {
    setFlash(msg)
    setCreating(false)
    setOpenId(null)
    if (updatedItem) {
      setItemOverrides((current) => ({ ...current, [updatedItem.item_id]: updatedItem }))
    }
    items.reload()
  }

  return (
    <div className="hk-stack">
      {flash && <Notice tone={flash.tone} title={flash.title}>{flash.text}</Notice>}
      <Card
        title="Found item records"
        subtitle="Click a record to open its details"
        actions={
          <div className="hk-actions">
            <button type="button" className="hk-btn hk-btn--primary" onClick={() => setCreating(true)}>+ Record found item</button>
            <ExportMenu title="Lost & Found Records" fileName="lost-and-found" columns={REPORT_COLUMNS} rows={list} />
          </div>
        }
      >
        <div className="hk-toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search label, item or room" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">Status</option>
            <option value="STORED">Stored</option>
            <option value="RELEASED">Released</option>
            <option value="DISPOSED">Disposed</option>
          </select>
        </div>
        <LoadState loading={items.loading && !items.data} error={items.error} />
        <DataTable
          rowKey="item_id"
          rows={list}
          onSelect={(i) => setOpenId(i.item_id)}
          empty="No found items recorded."
          columns={[
            { key: 'ref', title: 'Reference', render: (i) => <strong>{i.storage_label}</strong> },
            { key: 'item', title: 'Item', render: (i) => i.item_description },
            { key: 'found', title: 'Found', render: (i) => <span>{i.room_number ? `Room ${i.room_number}` : i.found_location}<small className="hk-block">{formatDateTime(i.found_at)}</small></span> },
            { key: 'storage', title: 'Storage', render: (i) => i.storage_location },
            { key: 'status', title: 'Status', render: (i) => <Badge value={i.item_status} /> },
          ]}
        />
      </Card>

      {opened && (
        <Modal title={`Found item ${opened.storage_label}`} onClose={() => setOpenId(null)}>
          <ItemDetail key={opened.item_id} item={opened} onSaved={refresh} />
          <ClaimHistory item={opened} />
        </Modal>
      )}
      {creating && rooms.data && (
        <Modal title="Record found item" onClose={() => setCreating(false)}>
          <NewItemForm rooms={rooms.data.rooms} onSaved={refresh} />
        </Modal>
      )}
    </div>
  )
}

function ClaimHistory({ item }) {
  const claims = useLoad(() => api.itemClaims(item.item_id), [item.item_id, item.item_status])
  const list = claims.data?.claims || []
  return (
    <Notice tone="violet" title="Chain of custody">
      <div>
        {item.storage_label} found by {item.found_by_name} in {item.room_number ? `room ${item.room_number}` : item.found_location} ({item.found_location}),
        stored at {item.storage_location}.
      </div>
      {list.map((c) => (
        <div key={c.claim_id}>
          {formatDateTime(c.claimed_at)}: claim by {c.claimant_name} {c.claim_status === 'VALID' ? 'verified and released' : 'rejected'} by {c.processed_by_name}.
        </div>
      ))}
    </Notice>
  )
}

function NewItemForm({ rooms, onSaved }) {
  const [form, setForm] = useState({ roomId: '', foundLocation: '', description: '', storageLocation: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const { item } = await api.createItem({ ...form, roomId: form.roomId || null })
      onSaved({ tone: 'green', title: `Item recorded as ${item.storage_label}`, text: `Label the item ${item.storage_label} and store it at ${item.storage_location}.` }, item.item_id, item)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Record found item" subtitle="A storage label is generated when you save">
      <div className="hk-form">
        <Field label="Room">
          <select value={form.roomId} onChange={set('roomId')}>
            <option value="">Not in a room</option>
            {rooms.map((r) => <option key={r.room_id} value={r.room_id}>{r.room_number} · {r.room_type}</option>)}
          </select>
        </Field>
        <Field label="Found location">
          <input value={form.foundLocation} onChange={set('foundLocation')} placeholder="e.g. Under the bed" />
        </Field>
        <Field label="Item description" wide>
          <textarea rows={2} value={form.description} onChange={set('description')} placeholder="Colour, brand, contents" />
        </Field>
        <Field label="Storage location" wide>
          <input value={form.storageLocation} onChange={set('storageLocation')} placeholder="e.g. Cabinet A - Shelf 1" />
        </Field>
      </div>
      {error && <Notice tone="red" title="Not saved">{error}</Notice>}
      <div className="hk-actions">
        <button type="button" className="hk-btn hk-btn--primary" disabled={busy || !form.description || !form.foundLocation || !form.storageLocation} onClick={save}>
          Save and label item
        </button>
      </div>
    </Card>
  )
}

function ItemDetail({ item, onSaved }) {
  const [form, setForm] = useState({ description: item.item_description, storageLocation: item.storage_location })
  const [claim, setClaim] = useState({ claimantName: '', claimantContact: '', idVerified: false, descriptionMatch: false })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const stored = item.item_status === 'STORED'
  const verified = claim.idVerified && claim.descriptionMatch
  const hasClaimant = claim.claimantName && claim.claimantContact
  const releaseReady = Boolean(hasClaimant && verified)

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      onSaved(result.message, item.item_id, result.item)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const update = () =>
    run(async () => {
      const res = await api.updateItem(item.item_id, form)
      return { message: { tone: 'green', title: 'Item details updated.' }, item: res.item }
    })

  const processClaim = () =>
    run(async () => {
      const res = await api.claimItem(item.item_id, claim)
      return {
        message: res.released
          ? { tone: 'green', title: `${item.storage_label} released to ${claim.claimantName}`, text: 'The found-item record is now marked Released.' }
          : { tone: 'amber', title: 'Claim rejected', text: 'The claim was recorded as rejected. The item stays in storage.' },
        item: res.item,
      }
    })

  return (
    <Card title={`Found item · ${item.storage_label}`} subtitle={`Recorded by ${item.found_by_name}`}>
      <div className="hk-badges"><Badge value={item.item_status} /></div>
      <div className="hk-form">
        <Field label="Found date / time">
          <input value={formatDateTime(item.found_at)} disabled />
        </Field>
        <Field label="Found location">
          <input value={`${item.room_number ? `Room ${item.room_number} · ` : ''}${item.found_location}`} disabled />
        </Field>
        <Field label="Item description" wide>
          <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={!stored} />
        </Field>
        <Field label="Storage location / label">
          <input value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} disabled={!stored} />
        </Field>
        <Field label="Item status">
          <input value={label(item.item_status)} disabled />
        </Field>
      </div>

      {stored && (
        <>
          <h3 className="hk-subhead">Claimant verification</h3>
          <div className="hk-form">
            <Field label="Claimant name">
              <input value={claim.claimantName} onChange={(e) => setClaim({ ...claim, claimantName: e.target.value })} />
            </Field>
            <Field label="Contact / ID number">
              <input value={claim.claimantContact} onChange={(e) => setClaim({ ...claim, claimantContact: e.target.value })} />
            </Field>
          </div>
          <label className="hk-check">
            <input type="checkbox" checked={claim.idVerified} onChange={(e) => setClaim({ ...claim, idVerified: e.target.checked })} />
            Valid ID checked
          </label>
          <label className="hk-check">
            <input type="checkbox" checked={claim.descriptionMatch} onChange={(e) => setClaim({ ...claim, descriptionMatch: e.target.checked })} />
            Claimant's description matches the item
          </label>
          {verified ? (
            <Notice tone="green" title="Valid claim">The item can be released to the claimant.</Notice>
          ) : (
            <Notice tone="amber" title="Release blocked - verification incomplete">
              Enter the claimant details, check a valid ID, and confirm that the description matches before releasing the item.
            </Notice>
          )}
        </>
      )}
      {error && <Notice tone="red" title="Not saved">{error}</Notice>}
      {stored && (
        <div className="hk-actions">
          <button type="button" className="hk-btn hk-btn--secondary" disabled={busy} onClick={update}>Save item details</button>
          <button type="button" className="hk-btn hk-btn--secondary" disabled={busy || !hasClaimant || verified} onClick={processClaim}>
            Record rejected claim
          </button>
          <button type="button" className="hk-btn hk-btn--primary" disabled={busy || !releaseReady} onClick={processClaim}>
            Release item
          </button>
        </div>
      )}
    </Card>
  )
}
