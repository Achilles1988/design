import { useState, type FormEvent } from 'react'
import {
  readAiConfig,
  writeAiConfig,
  type AiConfig,
  type AiProvider,
} from '@/lib/ai/config'
import { FormRow } from '@/ui/FormRow'
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
      <div className="settings-form__fields">
        <FormRow label={<span id="provider-label">Provider</span>}>
          <div
            className="settings-form__provider"
            role="radiogroup"
            aria-labelledby="provider-label"
          >
            <label
              className={`settings-form__provider-option${provider === 'anthropic' ? ' settings-form__provider-option--selected' : ''}`}
            >
              <input
                type="radio"
                name="provider"
                value="anthropic"
                checked={provider === 'anthropic'}
                onChange={() => setProvider('anthropic')}
              />
              Anthropic
            </label>
            <label
              className={`settings-form__provider-option${provider === 'openai' ? ' settings-form__provider-option--selected' : ''}`}
            >
              <input
                type="radio"
                name="provider"
                value="openai"
                checked={provider === 'openai'}
                onChange={() => setProvider('openai')}
              />
              OpenAI
            </label>
          </div>
        </FormRow>

        <FormRow
          label={<label htmlFor="ai-base-url">Base URL</label>}
          hint="Available for OpenAI-compatible providers."
          hintId="ai-base-url-hint"
        >
          <input
            id="ai-base-url"
            className="settings-form__input"
            aria-describedby="ai-base-url-hint"
            type="url"
            value={baseURL}
            onChange={(event) => setBaseURL(event.target.value)}
            disabled={provider !== 'openai'}
            placeholder={DEFAULT_BASE_URL}
          />
        </FormRow>

        <FormRow label={<label htmlFor="ai-api-key">API Key</label>}>
          <input
            id="ai-api-key"
            className="settings-form__input"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off"
            placeholder="sk-..."
          />
        </FormRow>

        <FormRow
          label={<label htmlFor="ai-model">Model</label>}
          hint={modelHint}
          hintId="ai-model-hint"
        >
          <input
            id="ai-model"
            className="settings-form__input"
            aria-describedby="ai-model-hint"
            type="text"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder={modelHint}
          />
        </FormRow>
      </div>

      <div className="settings-form__feedback" aria-live="polite">
        {error ? <p className="settings-form__error">{error}</p> : null}
        {saved ? <p className="settings-form__notice">Saved.</p> : null}
      </div>

      <div className="settings-form__actions">
        <button type="submit" className="assets-btn">
          Save settings
        </button>
      </div>
    </form>
  )
}
