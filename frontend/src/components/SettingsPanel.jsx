import { useState } from 'react'
import Modal from './Modal'

export default function SettingsPanel({
  open,
  onClose,
  apiKey,
  setApiKey,
  onSaveApiKey,
  apiKeyConfigured,
  csrfToken,
  model,
  setModel,
  temperature,
  setTemperature,
  maxTokens,
  setMaxTokens,
  systemPrompt,
  setSystemPrompt,
}) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')

  async function handleSave() {
    setSaveError('')
    setSaveSuccess('')

    const key = apiKey.trim()

    if (!key) {
      setSaveError('Please enter your Groq API key.')
      return
    }

    setSaving(true)

    try {
      await onSaveApiKey(csrfToken)

      setSaveSuccess('API key saved securely.')
    } catch (error) {
      setSaveError(
        error?.message || 'Unable to save the API key.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Settings → AI Configuration"
      onClose={onClose}
    >
      <div className="settings-grid">

        {/* API KEY */}
        <div className="field">
          <label>Groq API Key</label>

          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value)
              setSaveError('')
              setSaveSuccess('')
            }}
            placeholder="gsk_••••••••••••"
            autoComplete="off"
          />

          <button
            type="button"
            className="primary-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Securely'}
          </button>

          <div className="status-pill">
            {apiKeyConfigured
              ? '● API Key Configured'
              : '● No API Key'}
          </div>

          {saveSuccess && (
            <div className="success-box">
              {saveSuccess}
            </div>
          )}

          {saveError && (
            <div className="error-box">
              {saveError}
            </div>
          )}
        </div>

        {/* MODEL */}
        <div className="field">
          <label>Model</label>

          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="llama-3.3-70b-versatile">
              llama-3.3-70b-versatile
            </option>

            <option value="llama-3.1-8b-instant">
              llama-3.1-8b-instant
            </option>

            <option value="mixtral-8x7b-32768">
              mixtral-8x7b-32768
            </option>
          </select>
        </div>

        {/* TEMPERATURE */}
        <div className="field two">
          <label>Temperature</label>

          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) =>
              setTemperature(Number(e.target.value))
            }
          />

          <span>
            {temperature.toFixed(1)}
          </span>
        </div>

        {/* MAX TOKENS */}
        <div className="field two">
          <label>Max tokens</label>

          <input
            type="number"
            min="64"
            max="4096"
            value={maxTokens}
            onChange={(e) =>
              setMaxTokens(Number(e.target.value))
            }
          />
        </div>

        {/* SYSTEM PROMPT */}
        <div className="field full">
          <label>System prompt</label>

          <textarea
            rows="6"
            value={systemPrompt}
            onChange={(e) =>
              setSystemPrompt(e.target.value)
            }
          />
        </div>

      </div>
    </Modal>
  )
            }
