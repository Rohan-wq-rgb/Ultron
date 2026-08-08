import { Copy, Volume2, RefreshCcw, Trash2 } from 'lucide-react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

export default function MessageBubble({ message, onSpeak, onCopy, onRegenerate, onDelete }) {
  const html = DOMPurify.sanitize(marked.parse(message.content || ''))

  return (
    <div className={`message ${message.role}`}>
      <div className="message-head">
        <span className="message-role">{message.role === 'user' ? 'You' : 'ULTRON'}</span>
        <div className="message-actions">
          {message.role === 'assistant' && <button className="icon-btn" onClick={() => onSpeak(message.content)}><Volume2 size={16} /></button>}
          <button className="icon-btn" onClick={() => onCopy(message.content)}><Copy size={16} /></button>
          {message.role === 'assistant' && <button className="icon-btn" onClick={onRegenerate}><RefreshCcw size={16} /></button>}
          <button className="icon-btn danger" onClick={onDelete}><Trash2 size={16} /></button>
        </div>
      </div>
      <div className="message-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
