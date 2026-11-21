import { useRef, useState } from 'react'
import { api } from '../api.js'
import { ProfileAvatar } from '../components/Layout.jsx'
import { Badge, Card, Field, LoadState, Notice } from '../components/ui.jsx'
import { label, longDate, staffId } from '../format.js'
import { useLoad } from '../useLoad.js'

const MIN_PASSWORD = 8

// Account: the signed-in staff member's profile, user ID, email and password.
export default function AccountPage({ onSessionChange }) {
  const { data, error, loading } = useLoad(() => api.account(), [], { refresh: false })
  if (!data) return <LoadState loading={loading} error={error} />
  return <AccountContent initialAccount={data.account} onSessionChange={onSessionChange} />
}

function AccountContent({ initialAccount, onSessionChange }) {
  const [account, setAccount] = useState(initialAccount)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    firstName: initialAccount.first_name,
    lastName: initialAccount.last_name,
    email: initialAccount.email || '',
  })
  const [saving, setSaving] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const photoInput = useRef(null)
  const a = account
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  function cancelEdit() {
    setForm({ firstName: a.first_name, lastName: a.last_name, email: a.email || '' })
    setMessage(null)
    setEditing(false)
  }

  async function saveProfile(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const res = await api.updateProfile(form)
      setAccount(res.account)
      setForm({ firstName: res.account.first_name, lastName: res.account.last_name, email: res.account.email || '' })
      setEditing(false)
      setMessage({ tone: 'green', title: 'Profile updated', text: 'Your name and email have been saved.' })
      onSessionChange?.({ token: res.token, user: res.user })
    } catch (err) {
      setMessage({ tone: 'red', title: 'Profile not updated', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function choosePhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setMessage({ tone: 'red', title: 'Photo not updated', text: 'Choose a JPEG, PNG or WebP photo.' })
      return
    }
    setPhotoBusy(true)
    setMessage(null)
    try {
      const image = await prepareProfilePhoto(file)
      await api.updateProfilePhoto(image)
      setAccount((current) => ({ ...current, has_profile_photo: true }))
      window.dispatchEvent(new Event('hosis-profile-photo-changed'))
      setMessage({ tone: 'green', title: 'Profile photo updated', text: 'Your new photo is now shown on your account and in the header.' })
    } catch (err) {
      setMessage({ tone: 'red', title: 'Photo not updated', text: err.message === 'unreadable' ? 'That photo could not be read.' : err.message })
    } finally {
      setPhotoBusy(false)
    }
  }

  async function removePhoto() {
    setPhotoBusy(true)
    setMessage(null)
    try {
      await api.deleteProfilePhoto()
      setAccount((current) => ({ ...current, has_profile_photo: false }))
      window.dispatchEvent(new Event('hosis-profile-photo-changed'))
      setMessage({ tone: 'green', title: 'Profile photo removed', text: 'Your initials will be shown until you add another photo.' })
    } catch (err) {
      setMessage({ tone: 'red', title: 'Photo not removed', text: err.message })
    } finally {
      setPhotoBusy(false)
    }
  }

  return (
    <div className="hk-grid hk-grid--even">
      <Card title="Account details" subtitle="The account you use to sign in to Housekeeping">
        <div className="hk-account-head">
          <ProfileAvatar user={{ name: `${a.first_name} ${a.last_name}` }} className="hk-account-head__avatar" />
          <div>
            <strong>{a.first_name} {a.last_name}</strong>
            <small>Housekeeping {label(a.position)}</small>
          </div>
          <Badge value={a.employment_status === 'ACTIVE' ? 'AVAILABLE' : 'CLOSED'}>{label(a.employment_status)}</Badge>
        </div>
        <div className="hk-profile-photo-actions">
          <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={choosePhoto} />
          <button type="button" className="hk-btn hk-btn--secondary hk-btn--small" disabled={photoBusy} onClick={() => photoInput.current.click()}>
            {photoBusy ? 'Processing photo...' : a.has_profile_photo ? 'Change photo' : 'Add photo'}
          </button>
          {a.has_profile_photo && (
            <button type="button" className="hk-btn hk-btn--secondary hk-btn--small" disabled={photoBusy} onClick={removePhoto}>Remove photo</button>
          )}
          <small>Use a clear head-and-shoulders photo. JPEG, PNG or WebP.</small>
        </div>
        <dl className="hk-facts">
          <dt>User ID</dt>
          <dd><strong>{staffId(a.user_id)}</strong></dd>
          <dt>Username</dt>
          <dd>{a.username}</dd>
          <dt>Email</dt>
          <dd className="hk-break">{a.email || 'No email on file'}</dd>
          <dt>Department</dt>
          <dd>{label(a.role)}</dd>
          <dt>Position</dt>
          <dd>{label(a.position)}</dd>
          <dt>Account created</dt>
          <dd>{longDate(a.created_at.slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' })}</dd>
        </dl>
        {message && <Notice tone={message.tone} title={message.title}>{message.text}</Notice>}
        {editing ? (
          <form className="hk-profile-form hk-stack" onSubmit={saveProfile}>
            <div className="hk-form">
              <Field label="First name">
                <input required maxLength={50} value={form.firstName} onChange={set('firstName')} autoComplete="given-name" />
              </Field>
              <Field label="Last name">
                <input required maxLength={50} value={form.lastName} onChange={set('lastName')} autoComplete="family-name" />
              </Field>
              <Field label="Email" wide>
                <input required type="email" maxLength={100} value={form.email} onChange={set('email')} autoComplete="email" />
              </Field>
            </div>
            <p className="hk-muted">Your username, department and position can only be changed by an administrator.</p>
            <div className="hk-actions">
              <button type="submit" className="hk-btn hk-btn--primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save profile'}
              </button>
              <button type="button" className="hk-btn hk-btn--secondary" disabled={saving} onClick={cancelEdit}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="hk-profile-actions">
            <Notice tone="violet" title="Sign in with your email or username">
              You can update your name and email here. Your work assignment details remain administrator-managed.
            </Notice>
            <button type="button" className="hk-btn hk-btn--secondary" onClick={() => { setMessage(null); setEditing(true) }}>
              Edit profile
            </button>
          </div>
        )}
      </Card>

      <PasswordForm onChanged={(res) => onSessionChange?.({ token: res.token, user: res.user })} />
    </div>
  )
}

// Crop to a square and resize to 512 px so profile photos stay quick to load.
function prepareProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 512
      const context = canvas.getContext('2d')
      context.fillStyle = '#fff'
      context.fillRect(0, 0, 512, 512)
      context.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 512, 512)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.86))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('unreadable'))
    }
    img.src = url
  })
}

// Also used on its own when a temporary password must be replaced.
export function PasswordForm({ onChanged, currentLabel = 'Current password' }) {
  const empty = { currentPassword: '', newPassword: '', confirm: '' }
  const [form, setForm] = useState(empty)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const tooShort = form.newPassword.length > 0 && form.newPassword.length < MIN_PASSWORD
  const mismatch = form.confirm.length > 0 && form.confirm !== form.newPassword
  const ready = form.currentPassword && form.newPassword.length >= MIN_PASSWORD && form.confirm === form.newPassword

  async function save(e) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await api.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      setForm(empty)
      setMessage({ tone: 'green', title: 'Password changed', text: 'Use your new password the next time you sign in. Other devices signed in with the old password are signed out.' })
      // The old token no longer works; keep this device signed in with the new one.
      onChanged?.(res)
    } catch (err) {
      setMessage({ tone: 'red', title: 'Password not changed', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const type = show ? 'text' : 'password'
  return (
    <Card title="Change password" subtitle="Keep your account private; never share your password">
      <form className="hk-stack" onSubmit={save}>
        <Field label={currentLabel}>
          <input type={type} value={form.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" />
        </Field>
        <Field label="New password">
          <input type={type} value={form.newPassword} onChange={set('newPassword')} autoComplete="new-password" aria-invalid={tooShort || undefined} />
        </Field>
        <Field label="Confirm new password">
          <input type={type} value={form.confirm} onChange={set('confirm')} autoComplete="new-password" aria-invalid={mismatch || undefined} />
        </Field>
        <label className="hk-check">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show passwords
        </label>
        <ul className="hk-rules">
          <li className={form.newPassword.length >= MIN_PASSWORD ? 'is-ok' : ''}>At least {MIN_PASSWORD} characters</li>
          <li className={form.confirm && !mismatch ? 'is-ok' : ''}>Both new passwords match</li>
        </ul>
        {message && <Notice tone={message.tone} title={message.title}>{message.text}</Notice>}
        <div className="hk-actions">
          <button type="submit" className="hk-btn hk-btn--primary" disabled={!ready || busy}>
            {busy ? 'Saving...' : 'Change password'}
          </button>
        </div>
      </form>
    </Card>
  )
}
