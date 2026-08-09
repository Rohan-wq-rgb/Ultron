import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Mic, PauseCircle, SendHorizonal, Settings, LogOut, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from './services/api'
import Sidebar from './components/Sidebar'
import MessageBubble from './components/MessageBubble'
import SettingsPanel from './components/SettingsPanel'
import Modal from './components/Modal'
import { useVoiceTyping } from './hooks/useVoiceTyping'

const defaultSystemPrompt = `You are ULTRON, an advanced AI assistant. You are intelligent, precise, calm, helpful and technically capable. Give clear answers. Think carefully before answering. Use structured explanations when useful. Never pretend to have capabilities you do not have. Prioritize accuracy and user safety.`

const initialForm = { email: '', password: '' }

function getCsrfToken() {
  return document.cookie.split('; ').find((row) => row.startsWith('ultron_csrf='))?.split('=')[1] || ''
}

export default function App() {
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState(initialForm)
  const [user, setUser] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [sending, setSending] = useState(false)
  const [model, setModel] = useState('llama-3.3-70b-versatile')
  const [temperature, setTemperature] = useState(0.6)
  const [maxTokens, setMaxTokens] = useState(1024)
  const [systemPrompt, setSystemPrompt] = useState(defaultSystemPrompt)

  const inputRef = useRef(null)
  const endRef = useRef(null)
  const csrfToken = getCsrfToken()

  const { supported: voiceSupported, listening, error: voiceError, start, stop } = useVoiceTyping((text) => {
    setInput((prev) => (prev ? `${prev} ${text}` : text))
  })

  const visibleChats = useMemo(() => chats.filter((c) => c.title.toLowerCase().includes(search.toLowerCase())), [chats, search])

  useEffect(() => {
    loadSession()
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadSession() {
    try {
      const me = await api.me()
      setUser(me.user)
      await loadChats()
      await loadApiKeyStatus()
    } catch {
      setUser(null)
    } finally {
      setLoadingAuth(false)
    }
  }

  async function loadChats() {
    const data = await api.listChats()
    setChats(data.chats || [])
    if (!activeChatId && data.chats?.length) {
      setActiveChatId(data.chats[0].id)
      await openChat(data.chats[0].id)
    } else if (data.chats?.length) {
      const found = data.chats.find((c) => c.id === activeChatId) || data.chats[0]
      if (found) await openChat(found.id)
    }
  }

  async function loadApiKeyStatus() {
    try {
      const status = await api.apiKeyStatus()
      setApiKeyConfigured(Boolean(status.configured))
    } catch {
      setApiKeyConfigured(false)
    }
  }

  async function openChat(id) {
    const data = await api.getChat(id)
    setActiveChat(data.chat)
    setActiveChatId(id)
    setMessages(data.messages || [])
    setModel(data.chat?.model || 'llama-3.3-70b-versatile')
    setTemperature(data.chat?.temperature ?? 0.6)
    setMaxTokens(data.chat?.max_tokens ?? 1024)
    setSystemPrompt(data.chat?.system_prompt || defaultSystemPrompt)
  }

    async function handleAuthSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      if (authMode === 'login') {
        await api.login(authForm.email, authForm.password)
        await loadSession()
        return
      }

      const res = await api.register(authForm.email, authForm.password)
      if (res.verification_required) {
        setPendingEmail(authForm.email)
        setAuthStep('verify')
        setError('Verification code sent to your email.')
      }
    } catch (err) {
      if (err?.status === 403 && err.message?.toLowerCase().includes('verify')) {
        setPendingEmail(authForm.email)
        setAuthStep('verify')
      }
      setError(err.message)
    }
    }

  async function handleLogout() {
    try {
      await api.logout(csrfToken)
      setUser(null)
      setChats([])
      setMessages([])
      setActiveChat(null)
      setActiveChatId(null)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSaveApiKey(token) {
  try {
    await api.saveApiKey(apiKey, token)
    setApiKey('')
    setApiKeyConfigured(true)
    setShowSettings(false)
  } catch (err) {
    setError(err.message)
  }
  }

  async function newChat() {
    try {
      const created = await api.createChat(
        { title: 'New Chat', model, temperature, max_tokens: maxTokens, system_prompt: systemPrompt },
        csrfToken
      )
      await loadChats()
      await openChat(created.chat.id)
      setInput('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function saveActiveChatMeta(next = {}) {
    if (!activeChatId) return
    try {
      const updated = await api.updateChat(activeChatId, { model, temperature, max_tokens: maxTokens, system_prompt: systemPrompt, ...next }, csrfToken)
      setActiveChat(updated.chat)
      await loadChats()
    } catch (err) {
      setError(err.message)
    }
  }

  function handleCommand(text) {
    const cmd = text.trim().toLowerCase()
    if (!cmd.startsWith('/')) return false
    if (cmd === '/clear') {
      setMessages([])
      return true
    }
    if (cmd === '/new') {
      newChat()
      return true
    }
    if (cmd === '/settings') {
      setShowSettings(true)
      return true
    }
    if (cmd === '/voice') {
      listening ? stop() : start()
      return true
    }
    if (cmd === '/history') {
      setCollapsed(false)
      return true
    }
    if (cmd === '/help') {
      setError('Commands: /help /clear /new /history /settings /voice')
      return true
    }
    return false
  }

  async function sendMessage(textOverride) {
    const text = (textOverride ?? input).trim()
    if (!text || sending) return
    if (handleCommand(text)) {
      setInput('')
      return
    }
    setError('')
    setSending(true)
    const optimisticUser = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages((prev) => [...prev, optimisticUser])
    setInput('')

    try {
      if (!activeChatId) {
        await newChat()
      }
      const res = await api.sendChat({ message: text, chat_id: activeChatId, model, temperature, max_tokens: maxTokens, system_prompt: systemPrompt }, csrfToken)
      setActiveChatId(res.chat.id)
      setActiveChat(res.chat)
      setMessages(res.messages || [])
      await loadChats()
    } catch (err) {
      setError(err.message)
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id))
    } finally {
      setSending(false)
    }
  }

  function speak(text) {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1
    window.speechSynthesis.speak(utterance)
  }

  function stopSpeaking() {
    window.speechSynthesis.cancel()
  }

  async function copyText(text) {
    await navigator.clipboard.writeText(text)
  }

  async function regenerateLast() {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUser) await sendMessage(lastUser.content)
  }

  async function deleteMessageLocal(id) {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }

  async function deleteChat(id) {
    try {
      await api.deleteChat(id, csrfToken)
      if (id === activeChatId) {
        setActiveChatId(null)
        setActiveChat(null)
        setMessages([])
      }
      await loadChats()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loadingAuth) {
    return <div className="boot-screen">INITIALIZING ULTRON CORE...</div>
  }

  if (!user) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand">ULTRON AI</div>
          <p className="auth-copy">A secure command-center assistant with voice typing, encrypted Groq keys, and private chat history.</p>

          <div className="auth-switch">
            <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Login</button>
            <button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Register</button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <input type="email" placeholder="Email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} />
            <input type="password" placeholder="Password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} />
            <button className="primary-btn" type="submit">{authMode === 'login' ? 'Login' : 'Create account'}</button>
          </form>

          {error && <div className="error-box">{error}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar
        chats={visibleChats}
        activeChatId={activeChatId}
        onNewChat={newChat}
        onSelectChat={openChat}
        onDeleteChat={deleteChat}
        search={search}
        setSearch={setSearch}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
      />

      <main className="main-panel">
        <header className="topbar">
          <div>
            <div className="status-line">● ONLINE · VOICE CHANNEL READY · AI LINK ESTABLISHED</div>
            <h1>How may I assist you?</h1>
          </div>
          <div className="topbar-actions">
            <button className="icon-btn" onClick={() => setShowSettings(true)}><Settings size={18} /></button>
            <button className="icon-btn" onClick={handleLogout}><LogOut size={18} /></button>
          </div>
        </header>

        <section className="chat-stage">
          <AnimatePresence>
            {messages.length === 0 ? (
              <motion.div className="hero-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <Bot size={34} />
                <h2>ULTRON CORE ONLINE</h2>
                <p>Type a prompt, use your microphone, or issue a command like <code>/help</code>.</p>
              </motion.div>
            ) : (
              <div className="message-stack">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onSpeak={speak}
                    onCopy={copyText}
                    onRegenerate={regenerateLast}
                    onDelete={() => deleteMessageLocal(message.id)}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
          <div ref={endRef} />
        </section>

        <section className="composer">
          <button className={`mic-btn ${listening ? 'listening' : ''}`} onClick={listening ? stop : start} title={voiceSupported ? 'Voice typing' : 'Voice typing not supported'}>
            <Mic size={20} />
          </button>
          <button className="mic-btn" onClick={stopSpeaking} title="Stop speaking">
            <PauseCircle size={20} />
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? 'Listening...' : 'Ask Ultron...'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendMessage()
            }}
          />
          <button className="send-btn" onClick={() => sendMessage()}>
            <SendHorizonal size={18} />
          </button>
        </section>

        <div className="command-strip">
          <button onClick={() => sendMessage('/help')}>/help</button>
          <button onClick={() => sendMessage('/clear')}>/clear</button>
          <button onClick={() => sendMessage('/new')}>/new</button>
          <button onClick={() => sendMessage('/history')}>/history</button>
          <button onClick={() => sendMessage('/settings')}>/settings</button>
          <button onClick={() => sendMessage('/voice')}>/voice</button>
        </div>

        {error && <div className="error-box">{error}</div>}
        {voiceError && <div className="error-box">{voiceError}</div>}
      </main>

      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        apiKey={apiKey}
        setApiKey={setApiKey}
        onSaveApiKey={handleSaveApiKey}
        apiKeyConfigured={apiKeyConfigured}
        csrfToken={csrfToken}
        model={model}
        setModel={setModel}
        temperature={temperature}
        setTemperature={setTemperature}
        maxTokens={maxTokens}
        setMaxTokens={setMaxTokens}
        systemPrompt={systemPrompt}
        setSystemPrompt={setSystemPrompt}
      />
    </div>
  )
        }
  const [authStep, setAuthStep] = useState('credentials')
  const [otp, setOtp] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  async function handleVerifyOtp(e) {
    e.preventDefault()
    setError('')
    try {
      await api.verifyOtp(pendingEmail, otp)
      setAuthStep('credentials')
      setOtp('')
      setPendingEmail('')
      await loadSession()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleResendOtp() {
    setError('')
    try {
      await api.resendOtp(pendingEmail)
      setError('Verification code resent to your email.')
    } catch (err) {
      setError(err.message)
    }
  }
              
