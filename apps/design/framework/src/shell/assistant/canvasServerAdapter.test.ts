// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { createDelegatingChatModelAdapter } from './modelAdapterMode'
import { createCanvasServerAdapter } from './canvasServerAdapter'

const AI_CONFIG = {
  provider: 'anthropic',
  apiKey: 'secret',
  model: 'canvas-model',
} as const

function runOptions(
  messages: Array<Record<string, unknown>> = [],
  abortSignal = new AbortController().signal,
): Parameters<ChatModelAdapter['run']>[0] {
  return {
    messages: messages as never,
    runConfig: {},
    abortSignal,
    context: {},
    unstable_getMessage: () => ({
      id: 'assistant-current',
      role: 'assistant',
      content: [],
      createdAt: new Date(),
      status: { type: 'running' },
      metadata: {
        unstable_state: null,
        unstable_annotations: [],
        unstable_data: [],
        steps: [],
        custom: {},
      },
    }),
  }
}

function streamResponse(lines: readonly string[]): Response {
  return new Response(lines.join('\n') + '\n', {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  })
}

async function collect(
  adapter: ChatModelAdapter,
  options: Parameters<ChatModelAdapter['run']>[0],
) {
  const output = adapter.run(options)
  if (!(Symbol.asyncIterator in output)) return [await output]
  const chunks = []
  for await (const chunk of output) chunks.push(chunk)
  return chunks
}

describe('createCanvasServerAdapter', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('wn.ai.config', JSON.stringify(AI_CONFIG))
    vi.unstubAllGlobals()
  })

  it('posts the latest forty stable messages and current AI config', async () => {
    const messages = Array.from({ length: 43 }, (_, index) => ({
      id: `message-${index}`,
      role: index === 0 ? 'assistant' : 'user',
      content: [{ type: 'text', text: `message ${index}` }],
      createdAt: new Date(),
      status:
        index === 0
          ? { type: 'running' }
          : { type: 'complete', reason: 'stop' },
    }))
    const currentMessage = {
      id: 'assistant-current',
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'tool-1',
          toolName: 'propose_canvas_change',
          args: { proposalId: 'proposal-1' },
          result: { status: 'applied', proposalId: 'proposal-1' },
        },
      ],
      createdAt: new Date(),
      status: { type: 'running' },
    }
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        JSON.stringify({ type: 'run-result', value: { content: [] } }),
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const adapter = createCanvasServerAdapter({
      appId: 'design',
      canvasId: 'home',
    })

    await collect(
      adapter,
      {
        ...runOptions(messages),
        currentMessage,
      } as Parameters<ChatModelAdapter['run']>[0],
    )

    const init = fetchMock.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      appId: 'design',
      canvasId: 'home',
      aiConfig: AI_CONFIG,
    })
    expect(body.messages).toHaveLength(40)
    expect(body.messages[0].content[0].text).toBe('message 4')
    expect(body.messages.at(-1)).toEqual({
      role: 'assistant',
      content: currentMessage.content,
    })
  })

  it('throws the existing Settings guidance when config is absent', async () => {
    localStorage.clear()
    const adapter = createCanvasServerAdapter({
      appId: 'design',
      canvasId: 'home',
    })

    await expect(collect(adapter, runOptions())).rejects.toThrow(
      'Configure an AI provider in Settings before starting a conversation.',
    )
  })

  it('yields each run-result and throws an error event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        streamResponse([
          JSON.stringify({
            type: 'run-result',
            value: { content: [{ type: 'text', text: 'One' }] },
          }),
          JSON.stringify({
            type: 'run-result',
            value: { content: [{ type: 'text', text: 'Two' }] },
          }),
        ]),
      ).mockResolvedValueOnce(
        streamResponse([
          JSON.stringify({ type: 'error', error: 'Model failed safely.' }),
        ]),
      ),
    )
    const adapter = createCanvasServerAdapter({
      appId: 'design',
      canvasId: 'home',
    })

    await expect(collect(adapter, runOptions())).resolves.toEqual([
      { content: [{ type: 'text', text: 'One' }] },
      { content: [{ type: 'text', text: 'Two' }] },
    ])
    await expect(collect(adapter, runOptions())).rejects.toThrow(
      'Model failed safely.',
    )
  })

  it('aborts fetch when the LocalRuntime signal aborts', async () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const adapter = createCanvasServerAdapter({
      appId: 'design',
      canvasId: 'home',
    })
    const output = adapter.run(runOptions([], controller.signal))
    if (!(Symbol.asyncIterator in output)) {
      throw new Error('Expected an async iterator.')
    }
    const pending = output.next()

    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      signal: controller.signal,
    })
  })

  it('rejects a chat fallback that is not NDJSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!doctype html><title>Vite preview</title>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )
    const adapter = createCanvasServerAdapter({
      appId: 'design',
      canvasId: 'home',
    })

    await expect(collect(adapter, runOptions())).rejects.toThrow(
      'Canvas Assistant is available only with npm run dev.',
    )
  })

  it('does not route non-Canvas pages through the server adapter', async () => {
    const defaultAdapter: ChatModelAdapter = {
      async *run() {
        yield { content: [{ type: 'text', text: 'browser adapter' }] }
      },
    }
    const canvasAdapter = createCanvasServerAdapter({
      appId: 'design',
      canvasId: 'home',
    })
    const delegating = createDelegatingChatModelAdapter(
      defaultAdapter,
      () => null,
    )
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(collect(delegating, runOptions())).resolves.toEqual([
      { content: [{ type: 'text', text: 'browser adapter' }] },
    ])
    expect(canvasAdapter).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
