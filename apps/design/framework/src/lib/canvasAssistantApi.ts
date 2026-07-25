import type { z } from 'zod'
import { readAiConfig } from '@/lib/ai/config'
import {
  CanvasApplyEventSchema,
  CanvasCaptureResponseSchema,
  CanvasPreviewSessionResponseSchema,
  type CanvasApplyEvent,
  type CanvasPreviewSessionRequest,
  type CanvasPreviewSessionResponse,
} from '@/lib/canvasAssistantProtocol'

const AI_CONFIG_GUIDANCE =
  'Configure an AI provider in Settings before starting a conversation.'
export const CANVAS_ASSISTANT_DEV_ONLY_GUIDANCE =
  'Canvas Assistant is available only with npm run dev.'

type CanvasApplyStatusEvent = Extract<CanvasApplyEvent, { type: 'status' }>
export type CanvasApplyResult = Extract<
  CanvasApplyEvent,
  { type: 'complete' }
>['result']

async function responseError(response: Response): Promise<Error> {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body = (await response.json().catch(() => null)) as {
      error?: unknown
    } | null
    if (typeof body?.error === 'string') return new Error(body.error)
  }
  return new Error(
    response.statusText || `Canvas Assistant request failed (${response.status}).`,
  )
}

export async function* parseCanvasNdjson<T>(
  response: Response,
  schema: z.ZodType<T>,
): AsyncGenerator<T> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.ok && contentType.includes('application/json')) {
    throw await responseError(response)
  }
  if (!contentType.includes('application/x-ndjson')) {
    throw new Error(CANVAS_ASSISTANT_DEV_ONLY_GUIDANCE)
  }
  if (!response.ok) throw await responseError(response)
  if (!response.body) {
    throw new Error('Canvas Assistant response did not include a stream.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reachedEof = false

  const parseLine = (line: string): T | undefined => {
    const normalized = line.trim()
    if (!normalized) return undefined
    return schema.parse(JSON.parse(normalized))
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        reachedEof = true
        break
      }
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const event = parseLine(line)
        if (event !== undefined) yield event
      }
    }

    buffer += decoder.decode()
    const finalEvent = parseLine(buffer)
    if (finalEvent !== undefined) yield finalEvent
  } finally {
    if (!reachedEof) {
      await reader.cancel().catch(() => undefined)
    }
    reader.releaseLock()
  }
}

export async function checkCanvasAssistantContext({
  appId,
  canvasId,
}: {
  appId: string
  canvasId: string
}): Promise<void> {
  const response = await fetch('/__design_ai/canvas/context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, canvasId }),
  })
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.ok && contentType.includes('application/json')) {
    throw await responseError(response)
  }
  if (!contentType.includes('application/json')) {
    throw new Error(CANVAS_ASSISTANT_DEV_ONLY_GUIDANCE)
  }
  if (!response.ok) throw await responseError(response)
  const body = (await response.json().catch(() => null)) as {
    ready?: unknown
  } | null
  if (body?.ready !== true) {
    throw new Error(CANVAS_ASSISTANT_DEV_ONLY_GUIDANCE)
  }
}

export async function captureCanvasReferences(
  urls: readonly string[],
  signal: AbortSignal,
): Promise<z.infer<typeof CanvasCaptureResponseSchema>> {
  const response = await fetch('/__design_ai/references/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
    signal,
  })
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.ok && contentType.includes('application/json')) {
    throw await responseError(response)
  }
  if (!contentType.includes('application/json')) {
    throw new Error(CANVAS_ASSISTANT_DEV_ONLY_GUIDANCE)
  }
  if (!response.ok) throw await responseError(response)
  return CanvasCaptureResponseSchema.parse(await response.json())
}

export async function createCanvasPreviewSession(
  request: CanvasPreviewSessionRequest,
): Promise<CanvasPreviewSessionResponse> {
  const response = await fetch('/__design_ai/canvas/preview-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.ok && contentType.includes('application/json')) {
    throw await responseError(response)
  }
  if (!contentType.includes('application/json')) {
    throw new Error(CANVAS_ASSISTANT_DEV_ONLY_GUIDANCE)
  }
  if (!response.ok) throw await responseError(response)
  return CanvasPreviewSessionResponseSchema.parse(await response.json())
}

export async function applyCanvasProposal({
  proposalId,
  onEvent,
}: {
  proposalId: string
  onEvent: (event: CanvasApplyStatusEvent) => void
}): Promise<CanvasApplyResult> {
  const aiConfig = readAiConfig()
  if (!aiConfig) throw new Error(AI_CONFIG_GUIDANCE)

  const response = await fetch(
    `/__design_ai/canvas/proposals/${encodeURIComponent(proposalId)}/apply`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiConfig }),
    },
  )

  let completeResult: CanvasApplyResult | undefined
  for await (const event of parseCanvasNdjson(
    response,
    CanvasApplyEventSchema,
  )) {
    if (completeResult) {
      if (event.type === 'complete') {
        throw new Error(
          'Canvas Assistant apply stream included more than one complete event.',
        )
      }
      throw new Error(
        'Canvas Assistant apply stream received an event after complete.',
      )
    }
    if (event.type === 'status') {
      onEvent(event)
      continue
    }
    completeResult = event.result
  }

  if (!completeResult) {
    throw new Error(
      'Canvas Assistant apply stream ended before a complete event.',
    )
  }
  return completeResult
}
