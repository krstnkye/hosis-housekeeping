import { useEffect, useRef, useState } from 'react'
import { api, fetchImage } from '../api.js'
import ExportMenu from '../components/ExportMenu.jsx'
import Modal from '../components/Modal.jsx'
import { Badge, Card, DataTable, Field, LoadState, Notice, SearchBox } from '../components/ui.jsx'
import { formatDateTime, label } from '../format.js'
import { useLoad } from '../useLoad.js'

const ID_TYPES = [
  ['PASSPORT', 'Passport'],
  ['DRIVERS_LICENSE', "Driver's license"],
  ['NATIONAL_ID', 'National ID (PhilSys)'],
  ['UMID', 'UMID'],
  ['SSS', 'SSS ID'],
  ['PHILHEALTH', 'PhilHealth ID'],
  ['POSTAL_ID', 'Postal ID'],
  ['VOTERS_ID', "Voter's ID"],
  ['COMPANY_ID', 'Company ID'],
  ['OTHER', 'Other government ID'],
]
const ID_LABEL = Object.fromEntries(ID_TYPES)

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
export default function LostFoundPage({ search: topSearch, user }) {
  const supervisor = user?.position === 'SUPERVISOR' || user?.role === 'ADMIN'
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [labelFor, setLabelFor] = useState(null)
  const [flash, setFlash] = useState(null)
  const [itemOverrides, setItemOverrides] = useState({})
  const items = useLoad(() => api.lostFound(status ? `?status=${status}` : ''), [status])
  const rooms = useLoad(() => api.rooms(), [], { refresh: false })

  const query = (search || topSearch).toLowerCase()
  const list = (items.data?.items || [])
    .map((i) => (itemOverrides[i.item_id] ? { ...i, ...itemOverrides[i.item_id] } : i))
    .filter((i) => !query || `${i.storage_label} ${i.item_description} ${i.room_number || ''}`.toLowerCase().includes(query))
  const selected = list.find((i) => i.item_id === selectedId) || list[0]
  const opened = list.find((i) => i.item_id === openId)

  function refresh(msg, itemId, updatedItem) {
    setFlash(msg)
    setCreating(false)
    setOpenId(null)
    if (itemId) setSelectedId(itemId)
    if (updatedItem) {
      setItemOverrides((current) => ({ ...current, [updatedItem.item_id]: updatedItem }))
    }
    items.reload()
  }

  return (
    <div className="hk-stack">
      {flash && <Notice tone={flash.tone} title={flash.title}>{flash.text}</Notice>}
      <div className="hk-grid">
        <Card
          title="Found item records"
          subtitle="Select a record to see its details"
          actions={
            <div className="hk-actions">
              <ExportMenu title="Lost & Found Records" fileName="lost-and-found" columns={REPORT_COLUMNS} rows={list} />
              <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                <option value="">Status</option>
                <option value="STORED">Stored</option>
                <option value="RELEASED">Released</option>
                <option value="DISPOSED">Disposed</option>
              </select>
            </div>
          }
        >
          <div className="hk-toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder="Search label, item or room" />
          </div>
          <LoadState loading={items.loading && !items.data} error={items.error} />
          <DataTable
            rowKey="item_id"
            rows={list}
            selectedKey={selected?.item_id}
            onSelect={(i) => setSelectedId(i.item_id)}
            darkHover
            empty="No found items recorded."
            columns={[
              { key: 'ref', title: 'Reference', render: (i) => <strong>{i.storage_label}</strong> },
              { key: 'item', title: 'Item', render: (i) => i.item_description },
              { key: 'found', title: 'Found', render: (i) => <span>{i.room_number ? `Room ${i.room_number}` : i.found_location}<small className="hk-block">{formatDateTime(i.found_at)}</small></span> },
              { key: 'status', title: 'Status', render: (i) => <Badge value={i.item_status} /> },
            ]}
          />
          <div className="hk-actions hk-actions--split">
            <button type="button" className="hk-btn hk-btn--secondary" disabled={!selected} onClick={() => setOpenId(selected.item_id)}>
              View selected record →
            </button>
            <button type="button" className="hk-btn hk-btn--primary" onClick={() => setCreating(true)}>+ Record found item</button>
          </div>
        </Card>

        <div className="hk-stack">
          {selected ? (
            <>
              <Card title="Found item detail" subtitle={`Recorded by ${selected.found_by_name}`} actions={<Badge value={selected.item_status} />}>
                <dl className="hk-facts">
                  <dt>Reference</dt><dd>{selected.storage_label}</dd>
                  <dt>Item</dt><dd>{selected.item_description}</dd>
                  <dt>Found</dt><dd>{selected.room_number ? `Room ${selected.room_number} · ` : ''}{selected.found_location}</dd>
                  <dt>Date / time</dt><dd>{formatDateTime(selected.found_at)}</dd>
                  <dt>Storage</dt><dd>{selected.storage_location}</dd>
                </dl>
                {selected.photo_ids?.length > 0 && <PhotoStrip item={selected} />}
                {selected.item_status === 'DISPOSED' && (
                  <Notice tone="amber" title={`Disposed by ${selected.disposed_by_name || 'a supervisor'}`}>
                    {formatDateTime(selected.disposed_at)} · {selected.disposal_reason}
                  </Notice>
                )}
                <div className="hk-actions">
                  <button type="button" className="hk-btn hk-btn--secondary" onClick={() => setLabelFor(selected)}>Print label</button>
                  <button type="button" className="hk-btn hk-btn--primary" onClick={() => setOpenId(selected.item_id)}>
                    {selected.item_status === 'STORED' ? 'Found item → verify claim' : 'Found item →'}
                  </button>
                </div>
              </Card>
              <ClaimHistory item={selected} />
            </>
          ) : (
            <Card title="Found item detail"><p className="hk-muted">No record selected.</p></Card>
          )}
        </div>
      </div>

      {opened && (
        <Modal title={`Found item ${opened.storage_label}`} onClose={() => setOpenId(null)}>
          <ItemDetail key={opened.item_id} item={opened} onSaved={refresh} supervisor={supervisor} onPhotoAdded={items.reload} />
        </Modal>
      )}
      {labelFor && (
        <Modal title={`Label ${labelFor.storage_label}`} onClose={() => setLabelFor(null)}>
          <ItemLabel item={labelFor} />
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
    <Card title="Chain of custody">
      <div className="hk-custody">
        {item.storage_label} found by {item.found_by_name} in {item.room_number ? `room ${item.room_number}` : item.found_location} ({item.found_location}),
        stored at {item.storage_location}.
      </div>
      {list.map((c) => (
        <div key={c.claim_id} className="hk-custody">
          {formatDateTime(c.claimed_at)}: claim by {c.claimant_name}
          {c.id_type ? ` (${ID_LABEL[c.id_type] || label(c.id_type)} ending ${c.id_last4})` : ''}{' '}
          {c.claim_status === 'VALID' ? 'verified and released' : 'rejected'} by {c.processed_by_name}.
        </div>
      ))}
      {item.item_status === 'DISPOSED' && (
        <div className="hk-custody">
          {formatDateTime(item.disposed_at)}: disposed by {item.disposed_by_name}. Reason: {item.disposal_reason}
        </div>
      )}
    </Card>
  )
}

function NewItemForm({ rooms, onSaved }) {
  const [form, setForm] = useState({ roomId: '', foundLocation: '', description: '', storageLocation: '' })
  const [photo, setPhoto] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const { item } = await api.createItem({ ...form, roomId: form.roomId || null })
      if (photo) {
        try {
          await api.addItemPhoto(item.item_id, photo)
        } catch {
          // The item is saved; the photo can be added again from its record.
        }
      }
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
          <input value={form.storageLocation} onChange={set('storageLocation')} maxLength={100} placeholder="e.g. Cabinet A - Shelf 1" />
        </Field>
        <Field label="Photo (optional)" wide>
          <PhotoPicker onPick={setPhoto} onError={setError} />
        </Field>
      </div>
      {photo && <img className="hk-photo-preview" src={photo} alt="Selected item" />}
      {error && <Notice tone="red" title="Not saved">{error}</Notice>}
      <div className="hk-actions">
        <button type="button" className="hk-btn hk-btn--primary" disabled={busy || !form.description || !form.foundLocation || !form.storageLocation} onClick={save}>
          Save and label item
        </button>
      </div>
    </Card>
  )
}

function ItemDetail({ item, onSaved, supervisor, onPhotoAdded }) {
  const [form, setForm] = useState({ description: item.item_description, storageLocation: item.storage_location })
  const [claim, setClaim] = useState({ claimantName: '', claimantContact: '', idType: '', idNumber: '', idVerified: false, descriptionMatch: false })
  const [disposeReason, setDisposeReason] = useState('')
  const [photos, setPhotos] = useState(item.photo_ids || [])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const stored = item.item_status === 'STORED'
  const idRecorded = Boolean(claim.idType && claim.idNumber.trim().length >= 4)
  const verified = claim.idVerified && idRecorded && claim.descriptionMatch
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

  // Adding a photo keeps this window open; the list picks it up on its next refresh.
  async function addPhoto(image) {
    setBusy(true)
    setError(null)
    try {
      const res = await api.addItemPhoto(item.item_id, image)
      setPhotos((current) => [...current, res.photo.photo_id])
      onPhotoAdded?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const dispose = () =>
    run(async () => {
      const res = await api.disposeItem(item.item_id, { reason: disposeReason })
      return { message: { tone: 'green', title: `${item.storage_label} marked as disposed.`, text: 'The reason and your name are kept on the record.' }, item: res.item }
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
      <h3 className="hk-subhead">Photos</h3>
      {photos.length ? <PhotoStrip item={{ ...item, photo_ids: photos }} /> : <p className="hk-muted">No photos yet.</p>}
      {stored && photos.length < 3 && (
        <div className="hk-actions hk-actions--left">
          <PhotoPicker onPick={addPhoto} onError={setError} label="Add photo" />
        </div>
      )}
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
            <Field label="Contact number or email">
              <input value={claim.claimantContact} onChange={(e) => setClaim({ ...claim, claimantContact: e.target.value })} />
            </Field>
            <Field label="ID presented">
              <select value={claim.idType} onChange={(e) => setClaim({ ...claim, idType: e.target.value })}>
                <option value="">Select ID type</option>
                {ID_TYPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </Field>
            <Field label="ID number">
              <input value={claim.idNumber} onChange={(e) => setClaim({ ...claim, idNumber: e.target.value })} autoComplete="off" placeholder="Only the last 4 characters are saved" />
            </Field>
          </div>
          <label className="hk-check">
            <input type="checkbox" checked={claim.idVerified} onChange={(e) => setClaim({ ...claim, idVerified: e.target.checked })} />
            The ID is valid and matches the claimant
          </label>
          <label className="hk-check">
            <input type="checkbox" checked={claim.descriptionMatch} onChange={(e) => setClaim({ ...claim, descriptionMatch: e.target.checked })} />
            Claimant's description matches the item
          </label>
          {verified ? (
            <Notice tone="green" title="Valid claim">The item can be released to the claimant.</Notice>
          ) : (
            <Notice tone="amber" title="Release blocked - verification incomplete">
              Enter the claimant details, record the ID type and number, check the ID, and confirm that the description matches before releasing the item.
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
      {stored && supervisor && (
        <>
          <h3 className="hk-subhead">Dispose of unclaimed item</h3>
          <Field label="Reason (kept on the record)" wide>
            <input value={disposeReason} onChange={(e) => setDisposeReason(e.target.value)} maxLength={255} placeholder="e.g. Unclaimed after 90 days, donated to charity" />
          </Field>
          <div className="hk-actions">
            <button type="button" className="hk-btn hk-btn--danger" disabled={busy || !disposeReason.trim()} onClick={dispose}>
              Mark as disposed
            </button>
          </div>
        </>
      )}
    </Card>
  )
}

// Picks an image, shrinks it to at most 1280 px on the long side and returns a
// JPEG data URL (usually well under the 2 MB limit).
function PhotoPicker({ onPick, onError, label: text = 'Choose photo' }) {
  const input = useRef(null)

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      onError('Choose a JPEG, PNG or WebP photo.')
      return
    }
    try {
      onPick(await shrink(file))
    } catch {
      onError('That photo could not be read.')
    }
  }

  return (
    <>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={pick} />
      <button type="button" className="hk-btn hk-btn--secondary" onClick={() => input.current.click()}>{text}</button>
    </>
  )
}

function shrink(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('unreadable'))
    }
    img.src = url
  })
}

// Item photos are protected, so they are loaded with the session token.
function PhotoStrip({ item }) {
  return (
    <div className="hk-photos">
      {item.photo_ids.map((id) => <ItemPhoto key={id} path={api.itemPhotoPath(item.item_id, id)} alt={item.item_description} />)}
    </div>
  )
}

function ItemPhoto({ path, alt }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let url = null
    let active = true
    fetchImage(path)
      .then((u) => {
        url = u
        if (active) setSrc(u)
      })
      .catch(() => {})
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [path])
  return src ? (
    <a href={src} target="_blank" rel="noreferrer" className="hk-photos__item"><img src={src} alt={alt} /></a>
  ) : (
    <span className="hk-photos__item hk-photos__item--loading" aria-label="Loading photo" />
  )
}

// Storage label with a QR code. Scanning it shows the label and description,
// so the item can be matched to its record. Printed on its own page.
function ItemLabel({ item }) {
  const [qr, setQr] = useState(null)
  useEffect(() => {
    let active = true
    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(`HOSIS LOST & FOUND\n${item.storage_label}\n${item.item_description}`, { margin: 1, width: 240 })
      )
      .then((data) => active && setQr(data))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [item])

  function print() {
    document.body.classList.add('hk-printing-label')
    const done = () => {
      document.body.classList.remove('hk-printing-label')
      window.removeEventListener('afterprint', done)
    }
    window.addEventListener('afterprint', done)
    window.print()
  }

  return (
    <Card title="Storage label" subtitle="Print and attach it to the item or its bag">
      <div className="hk-print-label">
        {qr ? <img src={qr} alt={`QR code for ${item.storage_label}`} /> : <span className="hk-print-label__qr-wait">Making QR code...</span>}
        <div>
          <strong className="hk-print-label__code">{item.storage_label}</strong>
          <span>{item.item_description}</span>
          <small>Found {formatDateTime(item.found_at)}{item.room_number ? ` · Room ${item.room_number}` : ''}</small>
          <small>Store at: {item.storage_location}</small>
          <small>Grand Horizon Hotel · Housekeeping Lost &amp; Found</small>
        </div>
      </div>
      <div className="hk-actions">
        <button type="button" className="hk-btn hk-btn--primary" disabled={!qr} onClick={print}>Print label</button>
      </div>
    </Card>
  )
}
