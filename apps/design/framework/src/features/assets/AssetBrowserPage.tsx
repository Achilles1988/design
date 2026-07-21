import { useEffect, useId, useRef, useState } from 'react'
import { designApi } from '@/lib/api'
import type { AssetEntry, AssetKind } from '@/lib/types'
import './assets.css'

type AssetBrowserPageProps = {
  kind: AssetKind
  title: string
  lead: string
}

const PREVIEW_WIDTH = 1280
const SCALE = 0.28

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
  onOpen,
}: {
  src: string
  title: string
  height: number
  onOpen: () => void
}) {
  const hostRef = useRef<HTMLButtonElement>(null)
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
          className={
            ready
              ? 'assets-card__iframe assets-card__iframe--in'
              : 'assets-card__iframe'
          }
          title={`${title} preview`}
          src={src}
          loading="lazy"
          tabIndex={-1}
          sandbox="allow-scripts"
          onLoad={() => setReady(true)}
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

export function AssetBrowserPage({ kind, title, lead }: AssetBrowserPageProps) {
  const titleId = useId()
  const [items, setItems] = useState<AssetEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<AssetEntry | null>(null)

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
    if (!lightbox) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [lightbox])

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
    if (busyId) return
    setBusyId(entry.id)
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
      setBusyId(null)
    }
  }

  return (
    <div className="assets-page">
      <div className="assets-page__header">
        <div>
          <h1 id={titleId}>{title}</h1>
          <p className="assets-page__lead">{lead}</p>
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
                  onOpen={() => setLightbox(entry)}
                />
                <div className="assets-card__meta">
                  <div className="assets-card__id" title={entry.id}>
                    {entry.id}
                  </div>
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
                      disabled={busyId === entry.id}
                      onClick={() => onDownload(entry)}
                    >
                      {busyId === entry.id ? 'Zipping…' : 'Download'}
                    </button>
                  </div>
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
                  onClick={() => onDownload(lightbox)}
                >
                  {busyId === lightbox.id ? 'Zipping…' : 'Download'}
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
                title={`${lightbox.id} enlarged preview`}
                src={lightbox.previewUrl}
                sandbox="allow-scripts"
              />
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
      lead="Browse installed design-rule packages. Open a preview, copy its id, or download the full package."
    />
  )
}

export function AssetsLayoutPage() {
  return (
    <AssetBrowserPage
      kind="layoutmd"
      title="Layout"
      lead="Browse installed layout packages. Open a preview, copy its id, or download the full package."
    />
  )
}
