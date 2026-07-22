import { useState, type FormEvent } from 'react'
import {
  readAiConfig,
  writeAiConfig,
  type AiConfig,
  type AiProvider,
} from '@/lib/ai/config'
import './settings.css'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

export function AiConfigForm() {
  const [provider, setProvider] = useState<AiProvider>(() => readAiConfig()?.provider ?? 'anthropic')
  const [baseURL, setBaseURL] = useState<string>(() => readAiConfig()?.baseURL ?? DEFAULT_BASE_URL)
  const [apiKey, setApiKey] = useState<string>(() => readAiConfig()?.apiKey ?? '')
  const [model, setModel] = useState<string>(() => readAiConfig()?.model ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<boolean>(false)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaved(false)
    if (apiKey.trim().length === 0 || model.trim().length === 0) {
      setError('API Key and Model are required')
      return
    }
    const config: AiConfig = {
      provider,
      apiKey: apiKey.trim(),
      model: model.trim(),
      ...(provider === 'openai' && baseURL.trim().length > 0
        ? { baseURL: baseURL.trim() }
        : {}),
    }
    writeAiConfig(config)
    setError(null)
    setSaved(true)
  }

  const modelHint =
    provider === 'anthropic'
      ? 'e.g. claude-sonnet-4-6'
      : 'e.g. gpt-4o-mini (or any id on your proxy)'

  return (
    <form className="settings-form" onSubmit={onSubmit}>
      <fieldset className="settings-form__section">
        <legend className="settings-form__legend">Provider</legend>
        <label className="settings-form__radio">
          <input
            type="radio"
            name="provider"
            value="anthropic"
            checked={provider === 'anthropic'}
            onChange={() => setProvider('anthropic')}
          />
          Anthropic (Claude)
        </label>
        <label className="settings-form__radio">
          <input
            type="radio"
            name="provider"
            value="openai"
            checked={provider === 'openai'}
            onChange={() => setProvider('openai')}
          />
          OpenAI (or OpenAI-compatible proxy)
        </label>
      </fieldset>

      <label className="settings-form__field">
        <span className="settings-form__label">Base URL</span>
        <input
          className="settings-form__input"
          type="url"
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
          disabled={provider !== 'openai'}
          placeholder={DEFAULT_BASE_URL}
        />
      </label>

      <label className="settings-form__field">
        <span className="settings-form__label">API Key</span>
        <input
          className="settings-form__input"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          placeholder="sk-..."
        />
      </label>

      <label className="settings-form__field">
        <span className="settings-form__label">Model</span>
        <input
          className="settings-form__input"
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={modelHint}
        />
        <span className="settings-form__hint">{modelHint}</span>
      </label>

      {error ? <p className="settings-form__error">{error}</p> : null}
      {saved ? <p className="settings-form__notice">Saved.</p> : null}

      <div className="settings-form__actions">
        <button type="submit" className="assets-btn">
          Save
        </button>
      </div>
    </form>
  )
}
