// Display helpers shared by the Housekeeping pages.

export const ROOM_STATUSES = ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'DIRTY', 'CLEAN', 'INSPECTED', 'OUT_OF_ORDER']
export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT']

// "OUT_OF_ORDER" -> "Out of order"
export function label(value) {
  if (!value) return ''
  const text = value.replace(/_/g, ' ').toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatTime(value) {
  if (!value) return '-'
  // TIME columns arrive as "13:00:00"
  if (/^\d{2}:\d{2}/.test(value) && value.length <= 8) {
    const [h, m] = value.split(':').map(Number)
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
  }
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function todayISO() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

const TONES = {
  AVAILABLE: 'green',
  INSPECTED: 'green',
  CLEAN: 'blue',
  COMPLETED: 'green',
  RELEASED: 'green',
  PASSED: 'green',
  VALID: 'green',
  REPAIRED: 'green',
  CLOSED: 'grey',
  DIRTY: 'amber',
  PENDING: 'amber',
  OPEN: 'amber',
  STORED: 'blue',
  ASSIGNED: 'blue',
  IN_PROGRESS: 'violet',
  REPORTED: 'amber',
  OCCUPIED: 'violet',
  RESERVED: 'grey',
  RETURNED: 'red',
  FAILED: 'red',
  REJECTED: 'red',
  OUT_OF_ORDER: 'red',
  DISPOSED: 'grey',
  URGENT: 'red',
  HIGH: 'amber',
  NORMAL: 'grey',
  LOW: 'grey',
}

export function tone(value) {
  return TONES[value] || 'grey'
}
