import { useEffect } from 'react'

// Pop-up window used for record details on the list pages.
export default function Modal({ title, onClose, children, variant }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div className="hk-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`hk-modal__box${variant ? ` hk-modal__box--${variant}` : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        {!variant && (
          <button type="button" className="hk-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
