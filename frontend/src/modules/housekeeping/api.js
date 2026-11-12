const TOKEN_KEY = 'hosis_token'
const USER_KEY = 'hosis_user'

// The token is kept in localStorage when "Remember me" is ticked,
// otherwise only for this browser tab (sessionStorage).
function storage() {
  return localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage
}

// When Housekeeping runs inside the combined HOSIS app, the app shell owns the
// login and passes its session in (see HousekeepingApp's `session` prop).
let externalSession = null
export function setExternalSession(session) {
  externalSession = session && session.token && session.user ? session : null
}

export function getSession() {
  if (externalSession) return externalSession
  const store = storage()
  const token = store.getItem(TOKEN_KEY)
  const user = store.getItem(USER_KEY)
  return token && user ? { token, user: JSON.parse(user) } : null
}

export function saveSession({ token, user }, remember) {
  const store = remember ? localStorage : sessionStorage
  store.setItem(TOKEN_KEY, token)
  store.setItem(USER_KEY, JSON.stringify(user))
}

// After a password change the server hands back a new token (the old one
// stops working). Keep it in the same place as the current session.
export function replaceSession({ token, user }) {
  if (externalSession) return
  const store = storage()
  store.setItem(TOKEN_KEY, token)
  store.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  for (const store of [localStorage, sessionStorage]) {
    store.removeItem(TOKEN_KEY)
    store.removeItem(USER_KEY)
  }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

let onUnauthorized = () => {}
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

export async function request(method, path, body) {
  const session = getSession()
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    if (res.status === 401 && session) onUnauthorized()
    throw new ApiError(res.status, data?.error || 'Request failed')
  }
  return data
}

// Loads a protected image (e.g. a lost-and-found photo) and returns a
// blob: URL the page can show in an <img>.
export async function fetchImage(path) {
  const session = getSession()
  const res = await fetch(`/api${path}`, {
    headers: session ? { Authorization: `Bearer ${session.token}` } : {},
  })
  if (!res.ok) throw new ApiError(res.status, 'Photo could not be loaded')
  return URL.createObjectURL(await res.blob())
}

const HK = '/housekeeping'

export const api = {
  login: (body) => request('POST', '/auth/login', body),
  account: () => request('GET', '/auth/account'),
  changePassword: (body) => request('POST', '/auth/password', body),
  forgotPassword: (body) => request('POST', '/auth/forgot-password', body),

  passwordResets: () => request('GET', `${HK}/password-resets`),
  resetStaffPassword: (userId) => request('POST', `${HK}/password-resets/staff/${userId}`),
  dismissReset: (id) => request('POST', `${HK}/password-resets/${id}/dismiss`),

  reportSummary: (from, to) => request('GET', `${HK}/reports/summary?from=${from}&to=${to}`),
  reportHistory: (type, from, to) => request('GET', `${HK}/reports/history?type=${type}&from=${from}&to=${to}`),

  inventory: (q = '') => request('GET', `${HK}/inventory${q}`),
  inventoryMovements: (q = '') => request('GET', `${HK}/inventory/movements${q}`),
  createInventoryItem: (body) => request('POST', `${HK}/inventory`, body),
  updateInventoryItem: (id, body) => request('PATCH', `${HK}/inventory/${id}`, body),
  moveStock: (id, body) => request('POST', `${HK}/inventory/${id}/movements`, body),

  dashboard: () => request('GET', `${HK}/dashboard`),
  staff: () => request('GET', `${HK}/staff`),
  guests: () => request('GET', `${HK}/guests`),
  notifications: () => request('GET', `${HK}/notifications`),
  alerts: () => request('GET', `${HK}/alerts`),
  activity: () => request('GET', `${HK}/activity`),

  rooms: (q = '') => request('GET', `${HK}/rooms${q}`),
  room: (id) => request('GET', `${HK}/rooms/${id}`),
  setRoomStatus: (id, body) => request('PATCH', `${HK}/rooms/${id}/status`, body),

  tasks: (q = '') => request('GET', `${HK}/tasks${q}`),
  workload: () => request('GET', `${HK}/tasks/workload`),
  createTask: (body) => request('POST', `${HK}/tasks`, body),
  updateTask: (id, body) => request('PATCH', `${HK}/tasks/${id}`, body),
  startTask: (id) => request('POST', `${HK}/tasks/${id}/start`),
  completeTask: (id) => request('POST', `${HK}/tasks/${id}/complete`),

  inspectionQueue: () => request('GET', `${HK}/inspections/queue`),
  inspections: (q = '') => request('GET', `${HK}/inspections${q}`),
  inspect: (body) => request('POST', `${HK}/inspections`, body),

  schedules: (date) => request('GET', `${HK}/schedules?date=${date}`),
  mySchedule: () => request('GET', `${HK}/schedules/mine`),
  scheduleDays: (month) => request('GET', `${HK}/schedules/days?month=${month}`),
  createSchedule: (body) => request('POST', `${HK}/schedules`, body),
  updateSchedule: (id, body) => request('PATCH', `${HK}/schedules/${id}`, body),

  guestRequests: (q = '') => request('GET', `${HK}/guest-requests${q}`),
  createGuestRequest: (body) => request('POST', `${HK}/guest-requests`, body),
  updateGuestRequest: (id, body) => request('PATCH', `${HK}/guest-requests/${id}`, body),
  completeGuestRequest: (id, body) => request('POST', `${HK}/guest-requests/${id}/complete`, body),

  lostFound: (q = '') => request('GET', `${HK}/lost-found${q}`),
  createItem: (body) => request('POST', `${HK}/lost-found`, body),
  updateItem: (id, body) => request('PATCH', `${HK}/lost-found/${id}`, body),
  itemClaims: (id) => request('GET', `${HK}/lost-found/${id}/claims`),
  claimItem: (id, body) => request('POST', `${HK}/lost-found/${id}/claims`, body),
  disposeItem: (id, body) => request('POST', `${HK}/lost-found/${id}/dispose`, body),
  addItemPhoto: (id, image) => request('POST', `${HK}/lost-found/${id}/photos`, { image }),
  deleteItemPhoto: (id, photoId) => request('DELETE', `${HK}/lost-found/${id}/photos/${photoId}`),
  itemPhotoPath: (id, photoId) => `${HK}/lost-found/${id}/photos/${photoId}`,

  maintenance: (q = '') => request('GET', `${HK}/maintenance${q}`),
  reportIssue: (body) => request('POST', `${HK}/maintenance`, body),
  updateIssue: (id, body) => request('PATCH', `${HK}/maintenance/${id}`, body),
  releaseRoom: (id) => request('POST', `${HK}/maintenance/${id}/release`),

  myRecord: () => request('GET', `${HK}/me/record`),
  myReports: () => request('GET', `${HK}/me/reports`),
  reportCondition: (body) => request('POST', `${HK}/room-reports`, body),
}
