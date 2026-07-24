// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyCanvasProposal,
  checkCanvasAssistantContext,
} from './canvasAssistantApi'

const AI_CONFIG = {
  provider: 'openai',
  baseURL: 'https://proxy.example/v1',
  apiKey: 'secret',
  model: 'canvas-model',
} as const

function ndjsonResponse(
  events: readonly unknown[],
  chunkEnds: readonly number[],
): Response {
  const bytes = new TextEncoder().encode(
    events.map((event) => JSON.stringify(event)).join('\n') + '\n',
  )
  let offset = 0
  const remainingChunkEnds = [...chunkEnds]
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close()
          return
        }
        const requestedEnd = remainingChunkEnds.shift()
        const end = Math.min(requestedEnd ?? bytes.length, bytes.length)
        controller.enqueue(bytes.slice(offset, end))
        offset = end
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    },
  )
}

describe('canvasAssistantApi', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('wn.ai.config', JSON.stringify(AI_CONFIG))
    vi.unstubAllGlobals()
  })

  it('parses NDJSON split across arbitrary byte chunks', async () => {
    const events = [
      { type: 'status', phase: 'checking' },
      { type: 'status', phase: 'repairing', attempt: 1, note: '修复中' },
      {
        type: 'complete',
        result: {
          ok: true,
          proposalId: 'proposal-1',
          repairAttempts: 1,
        },
      },
    ]
    const encoded = new TextEncoder().encode(
      events.map((event) => JSON.stringify(event)).join('\n') + '\n',
    )
    const firstNewline = encoded.indexOf(10)
    const secondNewline = encoded.indexOf(10, firstNewline + 1)
    const unicodeBytes = new TextEncoder().encode('修')
    const unicodeStart = encoded.findIndex(
      (byte, index) =>
        byte === unicodeBytes[0] &&
        unicodeBytes.every((part, offset) => encoded[index + offset] === part),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        ndjsonResponse(events, [
          7,
          firstNewline - 2,
          firstNewline,
          firstNewline + 1,
          unicodeStart + 1,
          unicodeStart + 2,
          secondNewline + 5,
          encoded.length,
        ]),
      ),
    )
    const statuses: string[] = []

    const result = await applyCanvasProposal({
      proposalId: 'proposal-1',
      onEvent: (event) => statuses.push(event.phase),
    })

    expect(statuses).toEqual(['checking', 'repairing'])
    expect(result).toEqual({
      ok: true,
      proposalId: 'proposal-1',
      repairAttempts: 1,
    })
  })

  it('passes current AI config to apply for repair', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ndjsonResponse(
        [
          {
            type: 'complete',
            result: {
              ok: true,
              proposalId: 'proposal-1',
              repairAttempts: 0,
            },
          },
        ],
        [],
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await applyCanvasProposal({
      proposalId: 'proposal-1',
      onEvent: vi.fn(),
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/__design_ai/canvas/proposals/proposal-1/apply',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({ aiConfig: AI_CONFIG })
  })

  it('throws when an apply stream ends without complete', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        ndjsonResponse([{ type: 'status', phase: 'checking' }], []),
      ),
    )

    await expect(
      applyCanvasProposal({
        proposalId: 'proposal-1',
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow('ended before a complete event')
  })

  it('checks Canvas context without invoking a model request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ready: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await checkCanvasAssistantContext({
      appId: 'design',
      canvasId: 'home',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/__design_ai/canvas/context',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ appId: 'design', canvasId: 'home' }),
      }),
    )
  })

  it('rejects a context fallback that is not ready JSON', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response('<!doctype html><title>Vite preview</title>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('Not found', {
          status: 404,
          headers: { 'Content-Type': 'text/html' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      checkCanvasAssistantContext({
        appId: 'design',
        canvasId: 'home',
      }),
    ).rejects.toThrow(
      'Canvas Assistant is available only with npm run dev.',
    )
    await expect(
      checkCanvasAssistantContext({
        appId: 'design',
        canvasId: 'home',
      }),
    ).rejects.toThrow(
      'Canvas Assistant is available only with npm run dev.',
    )
  })

  it('rejects apply responses that are not NDJSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!doctype html><title>Vite preview</title>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )

    await expect(
      applyCanvasProposal({
        proposalId: 'proposal-1',
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow(
      'Canvas Assistant is available only with npm run dev.',
    )
  })

  it('rejects duplicate or non-terminal complete events', async () => {
    const complete = {
      type: 'complete',
      result: {
        ok: true,
        proposalId: 'proposal-1',
        repairAttempts: 0,
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ndjsonResponse([complete, complete], []))
      .mockResolvedValueOnce(
        ndjsonResponse(
          [complete, { type: 'status', phase: 'validating' }],
          [],
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      applyCanvasProposal({
        proposalId: 'proposal-1',
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow('more than one complete event')
    await expect(
      applyCanvasProposal({
        proposalId: 'proposal-1',
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow('received an event after complete')
  })

  it('rejects malformed data after complete', async () => {
    const body = `${JSON.stringify({
      type: 'complete',
      result: {
        ok: true,
        proposalId: 'proposal-1',
        repairAttempts: 0,
      },
    })}\nnot-json\n`
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body))
      },
      cancel,
    })
    const response = new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response),
    )

    await expect(
      applyCanvasProposal({
        proposalId: 'proposal-1',
        onEvent: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(SyntaxError)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(response.body?.locked).toBe(false)
  })
})
