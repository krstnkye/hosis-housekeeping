import { useEffect, useState } from 'react'
import { formatDateTime, label } from '../format.js'
import '../housekeeping.css'

export default function PublicLostFoundPage({ code }) {
  const [state, setState] = useState({ loading: true, item: null, error: null })

  useEffect(() => {
    let active = true
    fetch(`/api/public/lost-found/${encodeURIComponent(code)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Lost & Found item not found.')
        return data
      })
      .then((data) => active && setState({ loading: false, item: data.item, error: null }))
      .catch((error) => active && setState({ loading: false, item: null, error: error.message }))
    return () => { active = false }
  }, [code])

  return (
    <main className="hk-public-item">
      <section className="hk-public-item__card">
        <header className="hk-public-item__brand">
          <span>GH</span>
          <div><strong>Grand Horizon Hotel</strong><small>HOSIS · Lost &amp; Found verification</small></div>
        </header>
        {state.loading && <p className="hk-muted">Checking this Lost &amp; Found label...</p>}
        {state.error && (
          <div className="hk-notice hk-notice--red" role="alert">
            <strong>Item could not be verified</strong><div>{state.error}</div>
          </div>
        )}
        {state.item && (
          <>
            <div className="hk-public-item__verified">✓ Permanent HOSIS item record</div>
            <h1>{state.item.item_description}</h1>
            <dl className="hk-facts">
              <dt>Reference</dt><dd>{state.item.storage_label}</dd>
              <dt>Status</dt><dd><span className="hk-badge">{label(state.item.item_status)}</span></dd>
              <dt>Found at</dt><dd>{state.item.room_number ? `Room ${state.item.room_number} · ` : ''}{state.item.found_location}</dd>
              <dt>Found on</dt><dd>{formatDateTime(state.item.found_at)}</dd>
            </dl>
            <div className="hk-notice hk-notice--violet">
              <strong>Privacy protected</strong>
              <div>Guest, claimant, staff and internal storage details are not displayed. Contact the hotel Lost &amp; Found desk and quote the reference above.</div>
            </div>
            <p className="hk-public-item__permanent">This QR link has no expiration date. The current item status is read directly from HOSIS.</p>
          </>
        )}
      </section>
    </main>
  )
}
