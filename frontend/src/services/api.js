const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function getToken() {
  return sessionStorage.getItem('ultron_token') || ''
}

function saveToken(token) {
  if (token) {
    sessionStorage.setItem('ultron_token', token)
  }
}

function clearToken() {
  sessionStorage.removeItem('ultron_token')
}

async function request(path, { method = 'GET', body, csrfToken } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  }

  const token = getToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  if (csrfToken && !token) {
    headers['X-CSRF-Token'] = csrfToken
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const error = new Error(data.error || 'Request failed')
    error.status = res.status
    throw error
  }

  if (data.token) {
    saveToken(data.token)
  }

  return data
}

export const api = {
  me: () => request('/api/auth/me'),
  register: (email, password) =>
    request('/api/auth/register', {
      method: 'POST',
      body: { email, password },
    }),
  login: (email, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  logout: (csrfToken) =>
    request('/api/auth/logout', {
      method: 'POST',
      csrfToken,
    }).finally(() => {
      clearToken()
    }),

  apiKeyStatus: () => request('/api/api-key/status'),
  saveApiKey: (api_key, csrfToken) =>
    request('/api/api-key', {
      method: 'POST',
      body: { api_key },
      csrfToken,
    }),
  deleteApiKey: (csrfToken) =>
    request('/api/api-key', {
      method: 'DELETE',
      csrfToken,
    }),

  listChats: () => request('/api/chats'),
  createChat: (payload, csrfToken) =>
    request('/api/chats', {
      method: 'POST',
      body: payload,
      csrfToken,
    }),
  updateChat: (id, payload, csrfToken) =>
    request(`/api/chats/${id}`, {
      method: 'PATCH',
      body: payload,
      csrfToken,
    }),
  deleteChat: (id, csrfToken) =>
    request(`/api/chats/${id}`, {
      method: 'DELETE',
      csrfToken,
    }),
  getChat: (id) => request(`/api/chats/${id}`),
  sendChat: (payload, csrfToken) =>
    request('/api/chat', {
      method: 'POST',
      body: payload,
      csrfToken,
    }),
}
