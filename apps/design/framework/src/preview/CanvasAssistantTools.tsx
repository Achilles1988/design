import { useRef, useState } from 'react'
import {
  useAssistantToolUI,
  type ToolCallMessagePartProps,
} from '@assistant-ui/react'
import { designApi } from '@/lib/api'
import {
  type CanvasApplyEvent,
  type CanvasProposalCardArgs,
  type CanvasToolResult,
  type LayoutRecommendationArgs,
} from '@/lib/canvasAssistantProtocol'
import { applyCanvasProposal } from '@/lib/canvasAssistantApi'

type ApplyStatus = Extract<CanvasApplyEvent, { type: 'status' }>

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function resultError(result: CanvasToolResult | undefined): string | null {
  return result?.status === 'failed' ? result.error : null
}

function LayoutRecommendationCard({
  args,
  result,
  addResult,
  appId,
}: ToolCallMessagePartProps<
  LayoutRecommendationArgs,
  CanvasToolResult
> & {
  appId: string
}) {
  const [pending, setPending] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const settledRef = useRef(result !== undefined)
  const pendingRef = useRef(false)
  const settled = settledRef.current || result !== undefined

  async function install() {
    if (pendingRef.current || settledRef.current) return
    pendingRef.current = true
    setPending(true)
    setLocalError(null)
    try {
      await designApi.applyAsset('layoutmd', args.layoutId, appId)
      settledRef.current = true
      addResult({ status: 'installed', layoutId: args.layoutId })
    } catch (error) {
      const message = errorMessage(error, 'Layout installation failed.')
      settledRef.current = true
      setLocalError(message)
      addResult({ status: 'failed', error: message })
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  function decline() {
    if (pendingRef.current || settledRef.current) return
    settledRef.current = true
    addResult({
      status: 'rejected',
      reason: 'User declined the Layout.',
    })
  }

  const failure = localError ?? resultError(result)
  const installed = result?.status === 'installed'
  const rejected = result?.status === 'rejected'
  const state = installed
    ? 'success'
    : failure
      ? 'error'
      : pending
        ? 'pending'
        : 'neutral'

  return (
    <article
      className="canvas-assistant-card"
      aria-label={`Recommended Layout: ${args.title}`}
    >
      <div className="canvas-assistant-card__meta">
        <div>
          <p className="canvas-assistant-card__eyebrow">
            Recommended Layout
          </p>
          <h3>{args.title}</h3>
        </div>
        <span
          className="canvas-assistant-card__status"
          data-state={state}
          role="status"
        >
          {installed
            ? 'Installed'
            : rejected
              ? 'Declined'
              : failure
                ? 'Install failed'
                : pending
                  ? 'Installing'
                  : 'Not installed'}
        </span>
      </div>
      {args.summary ? <p>{args.summary}</p> : null}
      <p className="canvas-assistant-card__reason">{args.reason}</p>
      <img src={args.previewUrl} alt={`${args.title} Layout preview`} />
      {failure ? (
        <p className="canvas-assistant-card__error" role="alert">
          {failure}
        </p>
      ) : null}
      {!settled ? (
        <div className="canvas-assistant-card__actions">
          <button
            type="button"
            className="canvas-assistant-card__primary"
            onClick={install}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? 'Installing…' : 'Install Layout'}
          </button>
          <button type="button" onClick={decline} disabled={pending}>
            Decline
          </button>
        </div>
      ) : null}
    </article>
  )
}

function DetailList({
  title,
  items,
  files = false,
}: {
  title: string
  items: readonly string[]
  files?: boolean
}) {
  return (
    <div>
      <h4>{title}</h4>
      {items.length > 0 ? (
        <ul className={files ? 'canvas-assistant-card__files' : undefined}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="canvas-assistant-card__empty">None</p>
      )}
    </div>
  )
}

function statusLabel(status: ApplyStatus): string {
  switch (status.phase) {
    case 'checking':
      return 'Checking files'
    case 'writing':
      return 'Writing files'
    case 'validating':
      return 'Validating changes'
    case 'repairing':
      return `Repairing${status.attempt ? ` · attempt ${status.attempt}` : ''}`
  }
}

function CanvasProposalCard({
  args,
  result,
  addResult,
}: ToolCallMessagePartProps<
  CanvasProposalCardArgs,
  CanvasToolResult
>) {
  const [pending, setPending] = useState(false)
  const [statuses, setStatuses] = useState<ApplyStatus[]>([])
  const [outcome, setOutcome] = useState<'applied' | 'failed' | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const settledRef = useRef(result !== undefined)
  const pendingRef = useRef(false)
  const settled = settledRef.current || result !== undefined
  const layoutLabel =
    args.layout.kind === 'installed' ? args.layout.id : 'AI temporary Layout'

  async function apply() {
    if (pendingRef.current || settledRef.current) return
    pendingRef.current = true
    setPending(true)
    setLocalError(null)
    setStatuses([])
    try {
      const applyResult = await applyCanvasProposal({
        proposalId: args.proposalId,
        onEvent: (event) => {
          setStatuses((current) => [...current, event])
        },
      })
      settledRef.current = true
      if (applyResult.ok) {
        setOutcome('applied')
        addResult({
          status: 'applied',
          proposalId: args.proposalId,
        })
        return
      }
      const message = applyResult.rolledBack
        ? applyResult.error
        : `${applyResult.error} Manual file inspection is required because rollback was incomplete.`
      setOutcome('failed')
      setLocalError(message)
      addResult({
        status: 'failed',
        proposalId: args.proposalId,
        error: message,
      })
    } catch (error) {
      const message = errorMessage(error, 'Canvas proposal apply failed.')
      settledRef.current = true
      setOutcome('failed')
      setLocalError(message)
      addResult({
        status: 'failed',
        proposalId: args.proposalId,
        error: message,
      })
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  function reject() {
    if (pendingRef.current || settledRef.current) return
    settledRef.current = true
    addResult({
      status: 'rejected',
      reason: 'User declined the Canvas proposal.',
    })
  }

  const failure = localError ?? resultError(result)
  const applied = outcome === 'applied' || result?.status === 'applied'
  const rejected = result?.status === 'rejected'
  const state = applied
    ? 'success'
    : failure
      ? 'error'
      : pending
        ? 'pending'
        : 'neutral'

  return (
    <article
      className="canvas-assistant-card"
      aria-label="Canvas change proposal"
    >
      <div className="canvas-assistant-card__meta">
        <div>
          <p className="canvas-assistant-card__eyebrow">
            Canvas change proposal
          </p>
          <h3>{args.mode === 'create' ? 'Create Canvas' : 'Update Canvas'}</h3>
        </div>
        <span className="canvas-assistant-card__status" data-state={state}>
          {applied
            ? 'Applied'
            : rejected
              ? 'Rejected'
              : failure
                ? 'Apply failed'
                : pending
                  ? 'Applying'
                  : 'Ready for review'}
        </span>
      </div>

      <ul>
        {args.summary.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <dl className="canvas-assistant-card__facts">
        <div>
          <dt>Style</dt>
          <dd>{args.styleId}</dd>
        </div>
        <div>
          <dt>Layout</dt>
          <dd>{layoutLabel}</dd>
        </div>
      </dl>

      <DetailList title="Changed files" items={args.changedFiles} files />
      <DetailList title="Reused components" items={args.reusedComponents} />
      <DetailList
        title="New shared components"
        items={args.newSharedComponents}
      />

      {statuses.length > 0 || outcome ? (
        <div className="canvas-assistant-card__progress">
          {statuses.map((status, index) => (
            <p
              className="canvas-assistant-card__status"
              data-state="pending"
              role="status"
              key={`${status.phase}-${status.attempt ?? 0}-${index}`}
            >
              {statusLabel(status)}
            </p>
          ))}
          {outcome ? (
            <p
              className="canvas-assistant-card__status"
              data-state={outcome === 'applied' ? 'success' : 'error'}
              role="status"
            >
              {outcome === 'applied' ? 'Applied' : 'Apply failed'}
            </p>
          ) : null}
        </div>
      ) : null}

      {failure ? (
        <p className="canvas-assistant-card__error" role="alert">
          {failure}
        </p>
      ) : null}

      {!settled ? (
        <div className="canvas-assistant-card__actions">
          <button
            type="button"
            className="canvas-assistant-card__primary"
            onClick={apply}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? 'Applying…' : 'Apply changes'}
          </button>
          <button type="button" onClick={reject} disabled={pending}>
            Reject
          </button>
        </div>
      ) : null}
    </article>
  )
}

export function CanvasAssistantTools({
  appId,
  canvasId: _canvasId,
}: {
  appId: string
  canvasId: string
}) {
  useAssistantToolUI({
    toolName: 'recommend_canvas_layout',
    display: 'standalone',
    render: (props) => (
      <LayoutRecommendationCard {...props} appId={appId} />
    ),
  })
  useAssistantToolUI({
    toolName: 'propose_canvas_change',
    display: 'standalone',
    render: CanvasProposalCard,
  })
  return null
}
