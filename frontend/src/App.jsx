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

const defaultSystemPrompt = `
You are ULTRON, an advanced AI assistant.

You are intelligent, precise, calm, helpful and technically capable.

Give clear answers.
Think carefully before answering.
Use structured explanations when useful.
Never pretend to have capabilities you do not have.
Prioritize accuracy and user safety.
`.trim()

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
  /* =========================
     AUTH
  ========================= */

  const [authMode, setAuthMode] = useState('login')

  const [authStep, setAuthStep] = useState('credentials')

  const [authForm, setAuthForm] = useState(initialForm)

  const [pendingEmail, setPendingEmail] = useState('')

  const [otp, setOtp] = useState('')

  const [user, setUser] = useState(null)

  const [loadingAuth, setLoadingAuth] = useState(true)

  const [authLoading, setAuthLoading] = useState(false)

  const [error, setError] = useState('')

  /* =========================
     SETTINGS
  ========================= */

  const [showSettings, setShowSettings] = useState(false)

  const [apiKey, setApiKey] = useState('')

  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)

  /* =========================
     CHAT
  ========================= */

  const [chats, setChats] = useState([])

  const [activeChatId, setActiveChatId] = useState(null)

  const [activeChat, setActiveChat] = useState(null)

  const [messages, setMessages] = useState([])

  const [input, setInput] = useState('')

  const [search, setSearch] = useState('')

  const [collapsed, setCollapsed] = useState(false)

  const [sending, setSending] = useState(false)

  /* =========================
     AI SETTINGS
  ========================= */

  const [model, setModel] = useState(
    'llama-3.3-70b-versatile'
  )

  const [temperature, setTemperature] = useState(0.6)

  const [maxTokens, setMaxTokens] = useState(1024)

  const [systemPrompt, setSystemPrompt] =
    useState(defaultSystemPrompt)

  /* =========================
     REFS
  ========================= */

  const inputRef = useRef(null)

  const endRef = useRef(null)

  const csrfToken = getCsrfToken()

  /* =========================
     VOICE
  ========================= */

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

  /* =========================
     CHAT FILTER
  ========================= */

  const visibleChats = useMemo(() => {
    const query = search.toLowerCase()

    return chats.filter((chat) =>
      chat.title.toLowerCase().includes(query)
    )
  }, [chats, search])

  /* =========================
     INITIAL SESSION
  ========================= */

  useEffect(() => {
    loadSession()
  }, [])

  /* =========================
     AUTO SCROLL
  ========================= */

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: 'smooth',
    })
  }, [messages])

  /* =========================
     LOAD SESSION
  ========================= */

  async function loadSession() {
    try {
      const data = await api.me()

      setUser(data.user)

      await loadChats()
      await loadApiKeyStatus()
    } catch {
      setUser(null)
    } finally {
      setLoadingAuth(false)
    }
  }

  /* =========================
     LOAD CHATS
  ========================= */

  async function loadChats() {
    const data = await api.listChats()

    const list = data.chats || []

    setChats(list)

    if (!list.length) {
      setActiveChatId(null)
      setActiveChat(null)
      setMessages([])
      return
    }

    const selected =
      list.find(
        (chat) => chat.id === activeChatId
      ) || list[0]

    await openChat(selected.id)
  }

  /* =========================
     LOAD API KEY STATUS
  ========================= */

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

  /* =========================
     OPEN CHAT
  ========================= */

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

  /* =========================
     REGISTER / LOGIN
  ========================= */

  async function handleAuthSubmit(event) {
    event.preventDefault()

    setError('')

    const email = authForm.email.trim()

    const password = authForm.password

    if (!email || !password) {
      setError(
        'Please enter your email and password.'
      )
      return
    }

    setAuthLoading(true)

    try {
      if (authMode === 'register') {
        /*
         * Registration does NOT immediately
         * create/login the user.
         *
         * Backend sends an OTP.
         */

        const result = await api.register(
          email,
          password
        )

        setPendingEmail(
          result.email || email
        )

        setOtp('')

        setAuthStep('otp')
      } else {
        await api.login(
          email,
          password
        )

        await loadSession()
      }
    } catch (err) {
      setError(
        err.message ||
          'Authentication failed.'
      )
    } finally {
      setAuthLoading(false)
    }
  }

  /* =========================
     VERIFY OTP
  ========================= */

  async function handleVerifyOtp(event) {
    event.preventDefault()

    setError('')

    if (!otp || otp.length !== 6) {
      setError(
        'Enter the 6-digit OTP sent to your email.'
      )
      return
    }

    setAuthLoading(true)

    try {
      await api.verifyOtp(
        pendingEmail,
        otp
      )

      /*
       * OTP verification completed.
       *
       * Try to establish the session automatically.
       */

      try {
        await api.login(
          pendingEmail,
          authForm.password
        )

        await loadSession()
      } catch {
        /*
         * If backend doesn't automatically
         * support login after verification,
         * return user to login.
         */

        setAuthMode('login')
        setAuthStep('credentials')
        setAuthForm({
          email: pendingEmail,
          password: '',
        })
        setOtp('')

        setError(
          'Email verified successfully. Please login.'
        )
      }
    } catch (err) {
      setError(
        err.message ||
          'Invalid or expired OTP.'
      )
    } finally {
      setAuthLoading(false)
    }
  }

  /* =========================
     RESEND OTP
  ========================= */

  async function handleResendOtp() {
    setError('')

    if (!pendingEmail) {
      setError('Email address is missing.')
      return
    }

    setAuthLoading(true)

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
          'Unable to resend OTP.'
      )
    } finally {
      setAuthLoading(false)
    }
  }

  /* =========================
     LOGOUT
  ========================= */

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

  /* =========================
     SAVE GROQ API KEY
  ========================= */

  async function handleSaveApiKey(token) {
    setError('')

    if (!apiKey.trim()) {
      setError(
        'Please enter your Groq API key.'
      )
      return
    }

    try {
      await api.saveApiKey(
        apiKey.trim(),
        token
      )

      setApiKey('')

      setApiKeyConfigured(true)

      setShowSettings(false)
    } catch (err) {
      setError(err.message)
    }
  }

  /* =========================
     NEW CHAT
  ========================= */

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

  /* =========================
     SAVE CHAT SETTINGS
  ========================= */

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

  /* =========================
     COMMAND SYSTEM
  ========================= */

  function handleCommand(text) {
    const command =
      text.trim().toLowerCase()

    if (!command.startsWith('/')) {
      return false
    }

    switch (command) {
      case '/clear':
        setMessages([])
        return true

      case '/new':
        newChat()
        return true

      case '/settings':
        setShowSettings(true)
        return true

      case '/voice':
        listening ? stop() : start()
        return true

      case '/history':
        setCollapsed(false)
        return true

      case '/help':
        setError(
          'Commands: /help /clear /new /history /settings /voice'
        )
        return true

      default:
        setError(
          `Unknown command: ${command}`
        )
        return true
    }
  }

  /* =========================
     SEND MESSAGE
  ========================= */

  async function sendMessage(
    textOverride
  ) {
    const text = (
      textOverride ?? input
    ).trim()

    if (!text || sending) return

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

      /*
       * Create a chat first if necessary.
       */

      if (!chatId) {
        const created =
          await api.createChat(
            {
              title:
                text.slice(0, 40) ||
                'New Chat',
              model,
              temperature,
              max_tokens: maxTokens,
              system_prompt:
                systemPrompt,
            },
            csrfToken
          )

        chatId = created.chat.id

        setActiveChatId(chatId)

        setActiveChat(created.chat)
      }

      const response =
        await api.sendChat(
          {
            message: text,
            chat_id: chatId,
            model,
            temperature,
            max_tokens: maxTokens,
            system_prompt: systemPrompt,
          },
          csrfToken
        )

      setActiveChatId(
        response.chat.id
      )

      setActiveChat(
        response.chat
      )

      setMessages(
        response.messages || []
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

  /* =========================
     TEXT TO SPEECH
  ========================= */

  function speak(text) {
    if (
      !window.speechSynthesis
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
    window.speechSynthesis.cancel()
  }

  /* =========================
     COPY
  ========================= */

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(
        text
      )

      setError('Copied.')
    } catch {
      setError(
        'Unable to copy text.'
      )
    }
  }

  /* =========================
     REGENERATE
  ========================= */

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

  /* =========================
     DELETE MESSAGE
  ========================= */

  function deleteMessageLocal(id) {
    setMessages((prev) =>
      prev.filter(
        (message) =>
          message.id !== id
      )
    )
  }

  /* =========================
     DELETE CHAT
  ========================= */

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

  /* =========================
     AUTH LOADING
  ========================= */

  if (loadingAuth) {
    return (
      <div className="boot-screen">
        INITIALIZING ULTRON CORE...
      </div>
    )
  }

  /* =========================
     AUTH SCREEN
  ========================= */

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
            encrypted Groq keys,
            email verification and
            private chat history.
          </p>

          {/* AUTH SWITCH */}

          <div className="auth-switch">

            <button
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
                setOtp('')
              }}
            >
              Login
            </button>

            <button
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
                setOtp('')
              }}
            >
              Register
            </button>

          </div>

          {/* CREDENTIALS */}

          {authStep ===
          'credentials' ? (
            <form
              className="auth-form"
              onSubmit={
                handleAuthSubmit
              }
            >

              <input
                type="email"
                required
                autoComplete="email"
                placeholder="Email"
                value={
                  authForm.email
                }
                onChange={(event) =>
                  setAuthForm({
                    ...authForm,
                    email:
                      event.target.value,
                  })
                }
              />

              <input
                type="password"
                required
                minLength={8}
                autoComplete={
                  authMode ===
                  'login'
                    ? 'current-password'
                    : 'new-password'
                }
                placeholder="Password"
                value={
                  authForm.password
                }
                onChange={(event) =>
                  setAuthForm({
                    ...authForm,
                    password:
                      event.target.value,
                  })
                }
              />

              <button
                className="primary-btn"
                type="submit"
                disabled={
                  authLoading
                }
              >
                {authLoading
                  ? 'PLEASE WAIT...'
                  : authMode ===
                    'login'
                  ? 'LOGIN'
                  : 'CREATE ACCOUNT'}
              </button>

            </form>
          ) : (
            /* OTP */

            <form
              className="auth-form"
              onSubmit={
                handleVerifyOtp
              }
            >

              <div
                className="otp-info"
              >
                <strong>
                  VERIFY EMAIL
                </strong>

                <p>
                  A 6-digit OTP was
                  sent to:
                </p>

                <span>
                  {pendingEmail}
                </span>
              </div>

              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={(event) => {
                  const value =
                    event.target.value
                      .replace(
                        /\D/g,
                        ''
                      )
                      .slice(0, 6)

                  setOtp(value)
                }}
              />

              <button
                className="primary-btn"
                type="submit"
                disabled={
                  authLoading ||
                  otp.length !== 6
                }
              >
                {authLoading
                  ? 'VERIFYING...'
                  : 'VERIFY EMAIL'}
              </button>

              <button
                type="button"
                className="secondary-btn"
                disabled={
                  authLoading
                }
                onClick={
                  handleResendOtp
                }
              >
                RESEND OTP
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setAuthStep(
                    'credentials'
                  )
                  setOtp('')
                  setError('')
                }}
              >
                CHANGE EMAIL
              </button>

            </form>
          )}

          {error && (
            <div className="error-box">
              {error}
            </div>
          )}

        </div>
      </div>
    )
  }

  /* =========================
     MAIN APPLICATION
  ========================= */

  return (
    <div className="app-shell">

      <Sidebar
        chats={visibleChats}
        activeChatId={
          activeChatId
        }
        onNewChat={newChat}
        onSelectChat={
          openChat
        }
        onDeleteChat={
          deleteChat
        }
        search={search}
        setSearch={setSearch}
        collapsed={collapsed}
        onToggle={() =>
          setCollapsed(
            (value) => !value
          )
        }
      />

      <main className="main-panel">

        {/* TOPBAR */}

        <header className="topbar">

          <div>

            <div className="status-line">
              ● ONLINE · VOICE CHANNEL
              READY · AI LINK ESTABLISHED
            </div>

            <h1>
              How may I assist you?
            </h1>

          </div>

          <div className="topbar-actions">

            <button
              className="icon-btn"
              onClick={() =>
                setShowSettings(true)
              }
              title="Settings"
            >
              <Settings
                size={18}
              />
            </button>

            <button
              className="icon-btn"
              onClick={
                handleLogout
              }
              title="Logout"
            >
              <LogOut
                size={18}
              />
            </button>

          </div>

        </header>

        {/* CHAT */}

        <section className="chat-stage">

          <AnimatePresence mode="wait">

            {messages.length === 0 ? (
              <motion.div
                className="hero-card"
                initial={{
                  opacity: 0,
                  y: 12,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
              >

                <Bot size={34} />

                <h2>
                  ULTRON CORE ONLINE
                </h2>

                <p>
                  Type a prompt, use
                  your microphone, or
                  issue a command like
                  <code>
                    /help
                  </code>
                  .
                </p>

              </motion.div>
            ) : (
              <div className="message-stack">

                {messages.map(
                  (message) => (
                    <MessageBubble
                      key={
                        message.id
                      }
                      message={
                        message
                      }
                      onSpeak={
                        speak
                      }
                      onCopy={
                        copyText
                      }
                      onRegenerate={
                        regenerateLast
                      }
                      onDelete={() =>
                        deleteMessageLocal(
                          message.id
                        )
                      }
                    />
                  )
                )}

                {sending && (
                  <div className="typing-indicator">
                    ULTRON IS THINKING...
                  </div>
                )}

              </div>
            )}

          </AnimatePresence>

          <div ref={endRef} />

        </section>

        {/* COMPOSER */}

        <section className="composer">

          <button
            className={`mic-btn ${
              listening
                ? 'listening'
                : ''
            }`}
            onClick={
              listening
                ? stop
                : start
            }
            disabled={
              !voiceSupported
            }
            title={
              voiceSupported
                ? 'Voice typing'
                : 'Voice typing not supported'
            }
          >
            <Mic size={20} />
          </button>

          <button
            className="mic-btn"
            onClick={
              stopSpeaking
            }
            title="Stop speaking"
          >
            <PauseCircle
              size={20}
            />
          </button>

          <input
            ref={inputRef}
            value={input}
            disabled={sending}
            onChange={(event) =>
              setInput(
                event.target.value
              )
            }
            placeholder={
              listening
                ? 'Listening...'
                : 'Ask Ultron...'
            }
            onKeyDown={(event) => {
              if (
                event.key ===
                'Enter' &&
                !event.shiftKey
              ) {
                event.preventDefault()
                sendMessage()
              }
            }}
          />

          <button
            className="send-btn"
            disabled={
              sending ||
              !input.trim()
            }
            onClick={() =>
              sendMessage()
            }
          >
            <SendHorizonal
              size={18}
            />
          </button>

        </section>

        {/* COMMAND STRIP */}

        <div className="command-strip">

          {[
            '/help',
            '/clear',
            '/new',
            '/history',
            '/settings',
            '/voice',
          ].map(
            (command) => (
              <button
                key={command}
                onClick={() =>
                  sendMessage(
                    command
                  )
                }
              >
                {command}
              </button>
            )
          )}

        </div>

        {error && (
          <div className="error-box">
            {error}
          </div>
        )}

        {voiceError && (
          <div className="error-box">
            {voiceError}
          </div>
        )}

      </main>

      {/* SETTINGS */}

      <SettingsPanel
        open={
          showSettings
        }
        onClose={() =>
          setShowSettings(false)
        }
        apiKey={apiKey}
        setApiKey={setApiKey}
        onSaveApiKey={
          handleSaveApiKey
        }
        apiKeyConfigured={
          apiKeyConfigured
        }
        csrfToken={
          csrfToken
        }
        model={model}
        setModel={setModel}
        temperature={
          temperature
        }
        setTemperature={
          setTemperature
        }
        maxTokens={
          maxTokens
        }
        setMaxTokens={
          setMaxTokens
        }
        systemPrompt={
          systemPrompt
        }
        setSystemPrompt={
          setSystemPrompt
        }
      />

    </div>
  )
                }
