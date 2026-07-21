import { useEffect, useId, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { designApi } from '@/lib/api'
import {
  applyThemeToFrame,
  getTheme,
  subscribeTheme,
  type ThemeMode,
} from '@/lib/theme'
import type { AppConfig, AssetEntry, AssetKind } from '@/lib/types'
import './assets.css'

type AssetBrowserPageProps = {
  kind: AssetKind
  title: string
  lead: string
  /** Primary apply action label (Install layout / Replace style). */
  applyLabel: string
}

const PREVIEW_WIDTH = 1280
const SCALE = 0.28

const STYLE_REPLACE_WARNING =
  'Replacing an App style overwrites its design-rule id and replaces the on-disk package under styles/<id>/. Once a style is chosen for an App, changing it later is usually a bad idea and can break existing canvases. Continue?'

const LAYOUT_INSTALL_NOTICE =
  'Installing a layout copies the package into layouts/<id>/ (overwriting that folder if it already exists) and adds the id to the App’s layouts list.'

function hashHeight(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  const tiers = [168, 200, 232, 264, 296]
  return tiers[h % tiers.length]!
}

function LazyPreview({
  src,
  title,
  height,
  theme,
  onOpen,
}: {
  src: string
  title: string
  height: number
  theme: ThemeMode
  onOpen: () => void
}) {
  const hostRef = useRef<HTMLButtonElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [mounted, setMounted] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = hostRef.current
    if (!el || mounted) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMounted(true)
          io.disconnect()
        }
      },
      { rootMargin: '320px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [mounted])

  useEffect(() => {
    if (!ready || !frameRef.current) return
    applyThemeToFrame(frameRef.current, theme)
  }, [ready, theme])

  const frameHeight = Math.round(height / SCALE)

  return (
    <button
      ref={hostRef}
      type="button"
      className="assets-card__preview"
      style={{ height }}
      onClick={onOpen}
      aria-label={`Open preview for ${title}`}
    >
      {!ready ? (
        <span className="assets-card__skeleton" aria-hidden="true" />
      ) : null}
      {mounted ? (
        <iframe
          ref={frameRef}
          className={
            ready
              ? 'assets-card__iframe assets-card__iframe--in'
              : 'assets-card__iframe'
          }
          title={`${title} preview`}
          src={src}
          loading="lazy"
          tabIndex={-1}
          sandbox="allow-scripts allow-same-origin"
          onLoad={(e) => {
            applyThemeToFrame(e.currentTarget, theme)
            setReady(true)
          }}
          style={{
            width: PREVIEW_WIDTH,
            height: frameHeight,
            transform: `scale(${SCALE})`,
          }}
        />
      ) : null}
    </button>
  )
}

export function AssetBrowserPage({
  kind,
  title,
  lead,
  applyLabel,
}: AssetBrowserPageProps) {
  const titleId = useId()
  const [searchParams] = useSearchParams()
  const contextAppId = searchParams.get('appId')?.trim() || null

  const [items, setItems] = useState<AssetEntry[] | null>(null)
  const [apps, setApps] = useState<AppConfig[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyKind, setBusyKind] = useState<'apply' | 'download' | null>(null)
  const [lightbox, setLightbox] = useState<AssetEntry | null>(null)
  const [theme, setThemeState] = useState<ThemeMode>(() => getTheme())
  const [pickerFor, setPickerFor] = useState<AssetEntry | null>(null)
  const [pickerAppId, setPickerAppId] = useState('')
  const busyLock = useRef(false)
  const lightboxFrameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => subscribeTheme(setThemeState), [])

  useEffect(() => {
    if (!lightbox || !lightboxFrameRef.current) return
    applyThemeToFrame(lightboxFrameRef.current, theme)
  }, [lightbox, theme])

  useEffect(() => {
    let cancelled = false
    setError(null)
    setItems(null)
    designApi
      .listAssets(kind)
      .then((data) => {
        if (!cancelled) setItems(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setItems([])
          setError(err instanceof Error ? err.message : 'Failed to load assets')
        }
      })
    return () => {
      cancelled = true
    }
  }, [kind])

  useEffect(() => {
    let cancelled = false
    designApi
      .listApps()
      .then((data) => {
        if (!cancelled) setApps(data)
      })
      .catch(() => {
        if (!cancelled) setApps([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!lightbox && !pickerFor) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setLightbox(null)
        setPickerFor(null)
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [lightbox, pickerFor])

  async function onCopy(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(id)
      window.setTimeout(() => {
        setCopiedId((cur) => (cur === id ? null : cur))
      }, 1600)
    } catch {
      setError(`Could not copy id “${id}”`)
    }
  }

  async function onDownload(entry: AssetEntry) {
    if (busyLock.current) return
    busyLock.current = true
    setBusyId(entry.id)
    setBusyKind('download')
    setError(null)
    try {
      const res = await fetch(designApi.downloadAssetUrl(kind, entry.id))
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(data?.error ?? res.statusText)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${entry.id}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      busyLock.current = false
      setBusyId(null)
      setBusyKind(null)
    }
  }

  function resolveTargetAppId(): string | null {
    if (contextAppId) {
      if (!apps) return contextAppId
      if (apps.some((app) => app.id === contextAppId)) return contextAppId
      return null
    }
    if (apps && apps.length === 1) return apps[0]!.id
    return null
  }

  async function runApply(entry: AssetEntry, appId: string) {
    if (kind === 'designmd') {
      if (!window.confirm(STYLE_REPLACE_WARNING)) return
    } else if (!window.confirm(LAYOUT_INSTALL_NOTICE)) {
      return
    }
    if (busyLock.current) return
    busyLock.current = true
    setBusyId(entry.id)
    setBusyKind('apply')
    setError(null)
    setNotice(null)
    try {
      const app = await designApi.applyAsset(kind, entry.id, appId)
      const verb = kind === 'designmd' ? 'Replaced style on' : 'Installed layout on'
      setNotice(`${verb} “${app.name}” (${app.id}).`)
      setPickerFor(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Apply failed')
    } finally {
      busyLock.current = false
      setBusyId(null)
      setBusyKind(null)
    }
  }

  async function onApply(entry: AssetEntry) {
    if (contextAppId && apps && !apps.some((app) => app.id === contextAppId)) {
      setError(`Unknown App id in URL: “${contextAppId}”. Pick a valid App.`)
      if (apps.length > 0) {
        setPickerAppId(apps[0]!.id)
        setPickerFor(entry)
      }
      return
    }
    const fixed = resolveTargetAppId()
    if (fixed) {
      await runApply(entry, fixed)
      return
    }
    if (!apps || apps.length === 0) {
      setError('Create an App first, then install or replace into it.')
      return
    }
    setPickerAppId(apps[0]!.id)
    setPickerFor(entry)
  }

  function actionButtons(entry: AssetEntry) {
    const isBusy = busyId === entry.id
    const applyBusy = isBusy && busyKind === 'apply'
    const downloadBusy = isBusy && busyKind === 'download'
    return (
      <div className="assets-card__actions">
        <button
          type="button"
          className="assets-btn assets-btn--ghost"
          onClick={() => onCopy(entry.id)}
        >
          {copiedId === entry.id ? 'Copied' : 'Copy id'}
        </button>
        <button
          type="button"
          className="assets-btn assets-btn--ghost"
          disabled={isBusy}
          onClick={() => onApply(entry)}
        >
          {applyBusy ? 'Working…' : applyLabel}
        </button>
        <button
          type="button"
          className="assets-btn assets-btn--ghost"
          disabled={isBusy}
          onClick={() => onDownload(entry)}
        >
          {downloadBusy ? 'Zipping…' : 'Download'}
        </button>
      </div>
    )
  }

  return (
    <div className="assets-page">
      <div className="assets-page__header">
        <div>
          <h1 id={titleId}>{title}</h1>
          <p className="assets-page__lead">{lead}</p>
          {contextAppId ? (
            <p className="assets-page__context">
              Target App: <code>{contextAppId}</code>
            </p>
          ) : null}
        </div>
        <p className="assets-page__count">
          {items === null ? '…' : `${items.length} packages`}
        </p>
      </div>

      <div className="assets-ai-slot">
        <div className="assets-ai-slot__field">
          <span className="assets-ai-slot__prompt">Ask about assets…</span>
          <span className="assets-ai-slot__hint">AI search coming later</span>
        </div>
        <button type="button" className="assets-ai-slot__btn" disabled>
          Ask
        </button>
      </div>

      {error ? <p className="assets-error">{error}</p> : null}
      {notice ? <p className="assets-notice">{notice}</p> : null}

      {items === null && !error ? (
        <p className="assets-muted">Loading packages…</p>
      ) : null}

      {items !== null && items.length === 0 && !error ? (
        <p className="assets-empty">No packages found under this library.</p>
      ) : null}

      {items !== null && items.length > 0 ? (
        <div className="assets-masonry" role="list" aria-labelledby={titleId}>
          {items.map((entry) => {
            const height = hashHeight(entry.id)
            return (
              <article className="assets-card" role="listitem" key={entry.id}>
                <LazyPreview
                  src={entry.previewUrl}
                  title={entry.name}
                  height={height}
                  theme={theme}
                  onOpen={() => setLightbox(entry)}
                />
                <div className="assets-card__meta">
                  <div className="assets-card__id" title={entry.id}>
                    {entry.id}
                  </div>
                  {actionButtons(entry)}
                </div>
              </article>
            )
          })}
        </div>
      ) : null}

      {lightbox ? (
        <div
          className="assets-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${lightbox.id} preview`}
          onClick={() => setLightbox(null)}
        >
          <div
            className="assets-lightbox__panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="assets-lightbox__toolbar">
              <div className="assets-lightbox__title">{lightbox.id}</div>
              <div className="assets-lightbox__actions">
                <button
                  type="button"
                  className="assets-btn assets-btn--ghost"
                  onClick={() => onCopy(lightbox.id)}
                >
                  {copiedId === lightbox.id ? 'Copied' : 'Copy id'}
                </button>
                <button
                  type="button"
                  className="assets-btn assets-btn--ghost"
                  disabled={busyId === lightbox.id}
                  onClick={() => onApply(lightbox)}
                >
                  {busyId === lightbox.id && busyKind === 'apply'
                    ? 'Working…'
                    : applyLabel}
                </button>
                <button
                  type="button"
                  className="assets-btn assets-btn--ghost"
                  disabled={busyId === lightbox.id}
                  onClick={() => onDownload(lightbox)}
                >
                  {busyId === lightbox.id && busyKind === 'download'
                    ? 'Zipping…'
                    : 'Download'}
                </button>
                <button
                  type="button"
                  className="assets-btn"
                  onClick={() => setLightbox(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="assets-lightbox__frame">
              <iframe
                ref={lightboxFrameRef}
                title={`${lightbox.id} enlarged preview`}
                src={lightbox.previewUrl}
                sandbox="allow-scripts allow-same-origin"
                onLoad={(e) => applyThemeToFrame(e.currentTarget, theme)}
              />
            </div>
          </div>
        </div>
      ) : null}

      {pickerFor && apps ? (
        <div
          className="assets-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Choose target App"
          onClick={() => setPickerFor(null)}
        >
          <div
            className="assets-picker"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="assets-picker__title">Choose target App</h2>
            <p className="assets-picker__lead">
              Select which App should receive{' '}
              <code>{pickerFor.id}</code>.
            </p>
            <label className="assets-picker__label" htmlFor="assets-picker-app">
              App
            </label>
            <select
              id="assets-picker-app"
              className="assets-picker__select"
              value={pickerAppId}
              onChange={(e) => setPickerAppId(e.target.value)}
            >
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name} ({app.id})
                </option>
              ))}
            </select>
            <div className="assets-picker__actions">
              <button
                type="button"
                className="assets-btn assets-btn--ghost"
                onClick={() => setPickerFor(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="assets-btn"
                disabled={!pickerAppId || busyId === pickerFor.id}
                onClick={() => runApply(pickerFor, pickerAppId)}
              >
                {applyLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function AssetsRulePage() {
  return (
    <AssetBrowserPage
      kind="designmd"
      title="Rule"
      lead="Pick a design-rule package, copy its id, or replace the style on a target App. Shell theme sync applies only when a package’s preview honors data-theme."
      applyLabel="Replace style"
    />
  )
}

export function AssetsLayoutPage() {
  return (
    <AssetBrowserPage
      kind="layoutmd"
      title="Layout"
      lead="Pick a layout package, copy its id, or install it onto a target App. Previews follow the shell light/dark theme."
      applyLabel="Install layout"
    />
  )
}
