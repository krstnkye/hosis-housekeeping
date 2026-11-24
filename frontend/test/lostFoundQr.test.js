import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import QRCode from 'qrcode'
import { buildLostFoundQrPayload, resolveLostFoundPublicOrigin } from '../src/modules/housekeeping/lostFoundQr.js'

const watch = {
  item_id: 17,
  public_code: '1234567890abcdef1234567890abcdef',
  storage_label: 'LF-0017',
  item_description: 'Black Casio wristwatch',
  found_location: 'Under the bedside table',
  room_number: '203',
  found_at: '2026-11-21T09:30:00',
  storage_location: 'Security cabinet A',
  found_by_name: 'Maria Santos',
  claimant_name: 'Private Guest',
  claimant_contact: 'private@example.test',
  access_token: 'secret-token',
}

test('Lost & Found QR is a permanent HOSIS link without private data', () => {
  const payload = buildLostFoundQrPayload(watch, 'https://hosis.example')
  assert.equal(payload, 'https://hosis.example/#/lost-found/item/1234567890abcdef1234567890abcdef')
  for (const privateValue of [watch.storage_location, watch.found_by_name, watch.claimant_name, watch.claimant_contact, watch.access_token]) {
    assert.doesNotMatch(payload, new RegExp(privateValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  }
  assert.match(payload, /^https:\/\/hosis\.example\/#\/lost-found\/item\//)
  assert.doesNotMatch(payload, /password|bearer|access[_ -]?token/i)
})
test('different items receive different permanent QR links', () => {
  const watchPayload = buildLostFoundQrPayload(watch, 'https://hosis.example')
  const phonePayload = buildLostFoundQrPayload({ ...watch, item_id: 18, public_code: 'abcdef1234567890abcdef1234567890', storage_label: 'LF-0018', item_description: 'Blue mobile phone' }, 'https://hosis.example')
  assert.notEqual(watchPayload, phonePayload)
  assert.doesNotMatch(watchPayload, /Blue mobile phone/)
  assert.doesNotMatch(phonePayload, /Black Casio wristwatch/)
})

test('the permanent payload generates a real PNG QR image', async () => {
  const dataUrl = await QRCode.toDataURL(buildLostFoundQrPayload(watch, 'https://hosis.example'), { errorCorrectionLevel: 'Q', margin: 2, width: 360 })
  assert.match(dataUrl, /^data:image\/png;base64,/)
  assert.ok(Buffer.from(dataUrl.split(',')[1], 'base64').length > 1000)
})

test('loopback browser address becomes a phone-reachable LAN address and keeps the active port', () => {
  assert.equal(resolveLostFoundPublicOrigin({
    currentOrigin: 'http://127.0.0.1:5174',
    configured: 'http://192.168.1.25:5173',
    lanHost: '192.168.100.116',
  }), 'http://192.168.100.116:5174')
})

test('an HTTPS deployment remains the permanent public QR origin', () => {
  assert.equal(resolveLostFoundPublicOrigin({
    currentOrigin: 'http://127.0.0.1:5174',
    configured: 'https://hotel.example.com',
    lanHost: '192.168.100.116',
  }), 'https://hotel.example.com')
})
