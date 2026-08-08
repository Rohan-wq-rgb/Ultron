import { Plus, Search, Trash2 } from 'lucide-react'

export default function Sidebar({ chats, activeChatId, onNewChat, onSelectChat, onDeleteChat, search, setSearch, collapsed, onToggle }) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-top">
        <button className="brand" onClick={onToggle} aria-label="Toggle sidebar">
          <span className="brand-dot" />
          <div>
            <div className="brand-title">ULTRON AI</div>
            <div className="brand-sub">CORE ONLINE</div>
          </div>
        </button>
        <button className="primary-btn small" onClick={onNewChat}><Plus size={16} /> New Chat</button>
      </div>

      <label className="search-box">
        <Search size={16} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" />
      </label>

      <div className="chat-list">
        {chats.map((chat) => (
          <div key={chat.id} className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`}>
            <button className="chat-select" onClick={() => onSelectChat(chat.id)}>
              <div className="chat-title">{chat.title}</div>
              <div className="chat-meta">{chat.model}</div>
            </button>
            <button className="icon-btn danger" onClick={() => onDeleteChat(chat.id)} aria-label="Delete chat"><Trash2 size={16} /></button>
          </div>
        ))}
        {!chats.length && <div className="empty-state">No chats yet.</div>}
      </div>
    </aside>
  )
}
