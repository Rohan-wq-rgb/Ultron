import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  Mic,
  PauseCircle,
  SendHorizonal,
  Settings,
  LogOut,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import { api } from './services/api'
import Sidebar from './components/Sidebar'
import MessageBubble from './components/MessageBubble'
import SettingsPanel from './components/SettingsPanel'
import { useVoiceTyping } from './hooks/useVoiceTyping'

const defaultSystemPrompt = `You are ULTRON, an advanced AI assistant.

You are intelligent, precise, calm, helpful and technically capable.

Give clear answers.
Think carefully before answering.
Use structured explanations when useful.
Never pretend to have capabilities you do not have.
Prioritize accuracy and user safety.`

const initialForm = {
  email: '',
  password: '',
}

function getCsrfToken() {
  return (
    document.cookie
      .split('; ')
      .find((row) => row.startsWith('ultron_csrf='))
      ?.split('=')[1] || ''
  )
}

export default function App() {
  // =========================
  // AUTH STATE
  // =========================

  const [authMode, setAuthMode] = useState('login')

  // credentials = email/password
  // otp = OTP verification screen
  const [authStep, setAuthStep] = useState('credentials')

  const [authForm, setAuthForm] = useState(initialForm)

  const [pendingEmail, setPendingEmail] = useState('')

  const [otp, setOtp] = useState('')

  const [user, setUser] = useState(null)

  const [loadingAuth, setLoadingAuth] = useState(true)

  const [error, setError] = useState('')

  // =========================
  // SETTINGS
  // =========================

  const [showSettings, setShowSettings] = useState(false)

  const [apiKey, setApiKey] = useState('')

  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)

  // =========================
  // CHAT STATE
  // =========================

  const [chats, setChats] = useState([])

  const [activeChatId, setActiveChatId] = useState(null)

  const [activeChat, setActiveChat] = useState(null)

  const [messages, setMessages] = useState([])

  const [input, setInput] = useState('')

  const [search, setSearch] = useState('')

  const [collapsed, setCollapsed] = useState(false)

  const [sending, setSending] = useState(false)

  // =========================
  // AI SETTINGS
  // =========================

  const [model, setModel] = useState(
    'llama-3.3-70b-versatile'
  )

  const [temperature, setTemperature] = useState(0.6)

  const [maxTokens, setMaxTokens] = useState(1024)

  const [systemPrompt, setSystemPrompt] =
    useState(defaultSystemPrompt)

  // =========================
  // REFS
  // =========================

  const inputRef = useRef(null)

  const endRef = useRef(null)

  const csrfToken = getCsrfToken()

  // =========================
  // VOICE
  // =========================

  const {
    supported: voiceSupported,
    listening,
    error: voiceError,
    start,
    stop,
  } = useVoiceTyping((text) => {
    setInput((prev) =>
      prev ? `${prev} ${text}` : text
    )
  })

  // =========================
  // FILTER CHATS
  // =========================

  const visibleChats = useMemo(() => {
    return chats.filter((chat) =>
      chat.title
        .toLowerCase()
        .includes(search.toLowerCase())
    )
  }, [chats, search])

  // =========================
  // INITIAL SESSION
  // =========================

  useEffect(() => {
    loadSession()
  }, [])

  // =========================
  // AUTO SCROLL
  // =========================

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: 'smooth',
    })
  }, [messages])

  // =========================
  // LOAD SESSION
  // =========================

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

  // =========================
  // LOAD CHATS
  // =========================

  async function loadChats() {
    const data = await api.listChats()

    const chatList = data.chats || []

    setChats(chatList)

    if (!chatList.length) {
      setActiveChatId(null)
      setActiveChat(null)
      setMessages([])
      return
    }

    if (!activeChatId) {
      setActiveChatId(chatList[0].id)

      await openChat(chatList[0].id)

      return
    }

    const found =
      chatList.find(
        (chat) => chat.id === activeChatId
      ) || chatList[0]

    if (found) {
      await openChat(found.id)
    }
  }

  // =========================
  // API KEY STATUS
  // =========================

  async function loadApiKeyStatus() {
    try {
      const status = await api.apiKeyStatus()

      setApiKeyConfigured(
        Boolean(status.configured)
      )
    } catch {
      setApiKeyConfigured(false)
    }
  }

  // =========================
  // OPEN CHAT
  // =========================

  async function openChat(id) {
    try {
      const data = await api.getChat(id)

      setActiveChat(data.chat)

      setActiveChatId(id)

      setMessages(data.messages || [])

      setModel(
        data.chat?.model ||
          'llama-3.3-70b-versatile'
      )

      setTemperature(
        data.chat?.temperature ?? 0.6
      )

      setMaxTokens(
        data.chat?.max_tokens ?? 1024
      )

      setSystemPrompt(
        data.chat?.system_prompt ||
          defaultSystemPrompt
      )
    } catch (err) {
      setError(err.message)
    }
  }

  // =========================
  // AUTH SUBMIT
  // =========================

  async function handleAuthSubmit(e) {
    e.preventDefault()

    setError('')

    const email = authForm.email.trim()

    const password = authForm.password

    if (!email || !password) {
      setError(
        'Please enter your email and password.'
      )

      return
    }

    try {
      // =========================
      // LOGIN
      // =========================

      if (authMode === 'login') {
        await api.login(email, password)

        await loadSession()

        return
      }

      // =========================
      // REGISTER
      // =========================

      const result = await api.register(
        email,
        password
      )

      /*
       * Backend should return:
       *
       * {
       *   otp_required: true,
       *   email: "user@example.com"
       * }
       */

      if (
        result?.otp_required === true
      ) {
        setPendingEmail(
          result.email || email
        )

        setOtp('')

        setAuthStep('otp')

        setError('')

        return
      }

      // Fallback if backend does not require OTP
      await loadSession()
    } catch (err) {
      setError(
        err.message ||
          'Authentication failed.'
      )
    }
  }

  // =========================
  // VERIFY OTP
  // =========================

  async function handleVerifyOtp(e) {
    e.preventDefault()

    setError('')

    const cleanOtp = otp
      .replace(/\D/g, '')
      .slice(0, 6)

    if (cleanOtp.length !== 6) {
      setError(
        'Please enter the 6-digit OTP.'
      )

      return
    }

    if (!pendingEmail) {
      setError(
        'Verification email is missing. Please register again.'
      )

      return
    }

    try {
      await api.verifyOtp(
        pendingEmail,
        cleanOtp
      )

      setOtp('')

      setPendingEmail('')

      setAuthStep('credentials')

      setAuthMode('login')

      setError(
        'Email verified successfully. Please login.'
      )
    } catch (err) {
      setError(
        err.message ||
          'Invalid or expired OTP.'
      )
    }
  }

  // =========================
  // RESEND OTP
  // =========================

  async function handleResendOtp() {
    setError('')

    if (!pendingEmail) {
      setError(
        'Email address is missing.'
      )

      return
    }

    try {
      await api.resendOtp(
        pendingEmail
      )

      setOtp('')

      setError(
        'A new OTP has been sent to your email.'
      )
    } catch (err) {
      setError(
        err.message ||
          'Could not resend OTP.'
      )
    }
  }

  // =========================
  // LOGOUT
  // =========================

  async function handleLogout() {
    try {
      await api.logout(csrfToken)

      setUser(null)

      setChats([])

      setMessages([])

      setActiveChat(null)

      setActiveChatId(null)

      setAuthMode('login')

      setAuthStep('credentials')

      setAuthForm(initialForm)

      setPendingEmail('')

      setOtp('')
    } catch (err) {
      setError(err.message)
    }
  }

  // =========================
  // SAVE API KEY
  // =========================

  async function handleSaveApiKey(token) {
    try {
      if (!apiKey.trim()) {
        setError(
          'Please enter your Groq API key.'
        )

        return
      }

      await api.saveApiKey(
        apiKey.trim(),
        token
      )

      setApiKey('')

      setApiKeyConfigured(true)

      setShowSettings(false)

      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  // =========================
  // NEW CHAT
  // =========================

  async function newChat() {
    try {
      const created =
        await api.createChat(
          {
            title: 'New Chat',
            model,
            temperature,
            max_tokens: maxTokens,
            system_prompt: systemPrompt,
          },
          csrfToken
        )

      await loadChats()

      await openChat(
        created.chat.id
      )

      setInput('')
    } catch (err) {
      setError(err.message)
    }
  }

  // =========================
  // SAVE CHAT SETTINGS
  // =========================

  async function saveActiveChatMeta(
    next = {}
  ) {
    if (!activeChatId) return

    try {
      const updated =
        await api.updateChat(
          activeChatId,
          {
            model,
            temperature,
            max_tokens: maxTokens,
            system_prompt: systemPrompt,
            ...next,
          },
          csrfToken
        )

      setActiveChat(updated.chat)

      await loadChats()
    } catch (err) {
      setError(err.message)
    }
  }

  // =========================
  // COMMAND SYSTEM
  // =========================

  function handleCommand(text) {
    const cmd =
      text.trim().toLowerCase()

    if (!cmd.startsWith('/')) {
      return false
    }

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
      listening
        ? stop()
        : start()

      return true
    }

    if (cmd === '/history') {
      setCollapsed(false)

      return true
    }

    if (cmd === '/help') {
      setError(
        'Commands: /help /clear /new /history /settings /voice'
      )

      return true
    }

    return false
  }

  // =========================
  // SEND MESSAGE
  // =========================

  async function sendMessage(
    textOverride
  ) {
    const text = (
      textOverride ?? input
    ).trim()

    if (!text || sending) {
      return
    }

    if (handleCommand(text)) {
      setInput('')

      return
    }

    setError('')

    setSending(true)

    const optimisticUser = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    }

    setMessages((prev) => [
      ...prev,
      optimisticUser,
    ])

    setInput('')

    try {
      let chatId = activeChatId

      // Create chat if necessary
      if (!chatId) {
        const created =
          await api.createChat(
            {
              title: 'New Chat',
              model,
              temperature,
              max_tokens: maxTokens,
              system_prompt: systemPrompt,
            },
            csrfToken
          )

        chatId = created.chat.id

        setActiveChatId(chatId)

        setActiveChat(
          created.chat
        )
      }

      const res =
        await api.sendChat(
          {
            message: text,
            chat_id: chatId,
            model,
            temperature,
            max_tokens: maxTokens,
            system_prompt:
              systemPrompt,
          },
          csrfToken
        )

      setActiveChatId(
        res.chat.id
      )

      setActiveChat(
        res.chat
      )

      setMessages(
        res.messages || []
      )

      await loadChats()
    } catch (err) {
      setError(err.message)

      setMessages((prev) =>
        prev.filter(
          (message) =>
            message.id !==
            optimisticUser.id
        )
      )
    } finally {
      setSending(false)
    }
  }

  // =========================
  // TEXT TO SPEECH
  // =========================

  function speak(text) {
    if (
      !('speechSynthesis' in window)
    ) {
      setError(
        'Text-to-speech is not supported in this browser.'
      )

      return
    }

    window.speechSynthesis.cancel()

    const utterance =
      new SpeechSynthesisUtterance(
        text
      )

    utterance.rate = 1

    window.speechSynthesis.speak(
      utterance
    )
  }

  function stopSpeaking() {
    if (
      'speechSynthesis' in window
    ) {
      window.speechSynthesis.cancel()
    }
  }

  // =========================
  // COPY MESSAGE
  // =========================

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(
        text
      )
    } catch {
      setError(
        'Could not copy message.'
      )
    }
  }

  // =========================
  // REGENERATE
  // =========================

  async function regenerateLast() {
    const lastUser =
      [...messages]
        .reverse()
        .find(
          (message) =>
            message.role === 'user'
        )

    if (lastUser) {
      await sendMessage(
        lastUser.content
      )
    }
  }

  // =========================
  // DELETE MESSAGE UI
  // =========================

  function deleteMessageLocal(id) {
    setMessages((prev) =>
      prev.filter(
        (message) =>
          message.id !== id
      )
    )
  }

  // =========================
  // DELETE CHAT
  // =========================

  async function deleteChat(id) {
    try {
      await api.deleteChat(
        id,
        csrfToken
      )

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

  // =========================
  // LOADING SCREEN
  // =========================

  if (loadingAuth) {
    return (
      <div className="boot-screen">
        INITIALIZING ULTRON CORE...
      </div>
    )
  }

  // =========================
  // AUTH SCREEN
  // =========================

  if (!user) {
    return (
      <div className="auth-screen">
        <div className="auth-card">

          <div className="auth-brand">
            ULTRON AI
          </div>

          <p className="auth-copy">
            A secure command-center
            assistant with voice typing,
            encrypted Groq keys, and
            private chat history.
          </p>

          {/* LOGIN / REGISTER SWITCH */}

          {authStep === 'credentials' && (
            <div className="auth-switch">

              <button
                type="button"
                className={
                  authMode === 'login'
                    ? 'active'
                    : ''
                }
                onClick={() => {
                  setAuthMode('login')
                  setAuthStep(
                    'credentials'
                  )
                  setError('')
                }}
              >
                Login
              </button>

              <button
                type="button"
                className={
                  authMode === 'register'
                    ? 'active'
                    : ''
                }
                onClick={() => {
                  setAuthMode(
                    'register'
                  )
                  setAuthStep(
                    'credentials'
                  )
                  setError('')
                }}
              >
                Register
              </button>

            </div>
          )}

          {/* =========================
              EMAIL + PASSWORD
          ========================= */}

          {authStep === 'credentials' && (
            <form
              className="auth-form"
              onSubmit={
                handleAuthSubmit
              }
            >

              <input
                type="email"
                placeholder="Email"
                autoComplete="email"
                value={
                  authForm.email
                }
                onChange={(e) =>
                  setAuthForm({
                    ...authForm,
                    email:
                      e.target.value,
                  })
                }
                required
              />

              <input
                type="password"
                placeholder="Password"
                autoComplete={
                  authMode ===
                  'login'
                    ? 'current-password'
                    : 'new-password'
                }
                value={
                  authForm.password
                }
                onChange={(e) =>
                  setAuthForm({
                    ...authForm,
                    password:
                      e.target.value,
                  })
                }
                required
              />

              <button
                className="primary-btn"
                type="submit"
              >
                {authMode === 'login'
                  ? 'Login'
                  : 'Create account'}
              </button>

            </form>
          )}

          {/* =========================
              OTP VERIFICATION
          ========================= */}

          {authStep === 'otp' && (
            <form
              className="auth-form"
              onSubmit={
                handleVerifyOtp
              }
            >

              <div
                className="otp-header"
                style={{
                  textAlign: 'center',
                  marginBottom: '16px',
                }}
              >
                <div
                  className="auth-brand"
                  style={{
                    fontSize: '20px',
                    marginBottom: '8px',
                  }}
                >
                  VERIFY EMAIL
                </div>

                <p className="auth-copy">
                  We sent a 6-digit
                  verification code to:
                </p>

                <strong>
                  {pendingEmail}
                </strong>
              </div>

              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={(e) => {
                  const value =
                    e.target.value
                      .replace(/\D/g, '')
                      .slice(0, 6)

                  setOtp(value)
                }}
                required
              />

              <button
                className="primary-btn"
                type="submit"
                disabled={
                  otp.length !== 6
                }
              >
                Verify Email
              </button>

              <button
                type
