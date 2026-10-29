import Icon from './Icon.jsx'

// Icons for the room status boxes (Occupied, Dirty, Clean, Inspected, Out of order).
const PATHS = {
  OCCUPIED: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  DIRTY: 'M4 20h16M7 20l2-9h6l2 9M10 11V4h4v7',
  CLEAN: 'M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z',
  INSPECTED: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
  OUT_OF_ORDER: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
}

export default function StatusIcon({ status, small }) {
  return (
    <span className={`hk-status-icon hk-status-icon--${status.toLowerCase()}${small ? ' hk-status-icon--small' : ''}`}>
      <Icon d={PATHS[status]} size={small ? 13 : 22} />
    </span>
  )
}
