import { AiConfigForm } from './AiConfigForm'
import './settings.css'

export function SettingsPage() {
  return (
    <div className="settings-page">
      <header className="settings-page__header">
        <h1>Settings</h1>
        <p className="settings-page__lead">
          Configure your AI provider. Keys stay in this browser (localStorage) and
          are sent directly to the provider you choose — nothing is proxied.
        </p>
      </header>

      <section className="settings-page__section">
        <h2 className="settings-page__section-title">AI Provider</h2>
        <AiConfigForm />
      </section>
    </div>
  )
}
