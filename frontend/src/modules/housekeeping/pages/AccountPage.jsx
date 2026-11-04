import { useState } from 'react'
import { api } from '../api.js'
import { Badge, Card, Field, LoadState, Notice } from '../components/ui.jsx'
import { label, longDate, staffId } from '../format.js'
import { useLoad } from '../useLoad.js'

const MIN_PASSWORD = 8

// Account: the signed-in staff member's user ID, email and password.
export default function AccountPage() {
  const { data, error, loading } = useLoad(() => api.account(), [])
  if (!data) return <LoadState loading={loading} error={error} />
  const a = data.account

  return (
    <div className="hk-grid hk-grid--even">
      <Card title="Account details" subtitle="The account you use to sign in to Housekeeping">
        <div className="hk-account-head">
          <span className="hk-account-head__avatar" aria-hidden="true">
            {a.first_name.charAt(0)}
            {a.last_name.charAt(0)}
          </span>
          <div>
            <strong>{a.first_name} {a.last_name}</strong>
            <small>Housekeeping {label(a.position)}</small>
          </div>
          <Badge value={a.employment_status === 'ACTIVE' ? 'AVAILABLE' : 'CLOSED'}>{label(a.employment_status)}</Badge>
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
        <Notice tone="violet" title="Sign in with your email or username">
          To change your name or email, ask your supervisor or HR to update your staff record.
        </Notice>
      </Card>

      <PasswordForm />
    </div>
  )
}

function PasswordForm() {
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
      await api.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      setForm(empty)
      setMessage({ tone: 'green', title: 'Password changed', text: 'Use your new password the next time you sign in.' })
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
        <Field label="Current password">
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
