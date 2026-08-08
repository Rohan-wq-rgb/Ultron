import { X } from 'lucide-react'

export default function Modal({ open, title, onClose, children }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
