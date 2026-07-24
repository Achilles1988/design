import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createStreamTextAdapter, toAiToolParameters, toCoreMessages } from './streamTextAdapter'
import { AiClientError } from '@/lib/ai/client'

describe('toAiToolParameters', () => {
  it('passes a zod/standard schema through unchanged', () => {
    const schema = z.object({ a: z.string() })
    expect(toAiToolParameters(schema)).toBe(schema)
  })
  it('wraps a plain JSON schema object (not the same reference)', () => {
    const jsonS = { type: 'object', properties: { a: { type: 'string' } } }
    const out = toAiToolParameters(jsonS)
    expect(out).not.toBe(jsonS)
    expect(out).toBeTypeOf('object')
  })
})

describe('toCoreMessages', () => {
  it('extracts and joins text parts per message', () => {
    const out = toCoreMessages([
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'hi' },
          { type: 'text', text: 'there' },
        ],
      },
    ])
    expect(out).toEqual([
      { role: 'user', content: 'hello' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'hi' },
          { type: 'text', text: 'there' },
        ],
      },
    ])
  })

  it('preserves completed tool calls, results, and following assistant text in protocol order', () => {
    const out = toCoreMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 't1',
            toolName: 'apply_filter',
            args: { add: [] },
            result: { changed: false, matchCount: 2 },
          },
          { type: 'text', text: 'No filter changes.' },
        ],
      },
    ])

    expect(out).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 't1',
            toolName: 'apply_filter',
            args: { add: [] },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 't1',
            toolName: 'apply_filter',
            result: { changed: false, matchCount: 2 },
            isError: false,
          },
        ],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'No filter changes.' }],
      },
    ])
  })
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeStream(parts: any[]) {
  return {
    fullStream: (async function* () {
      for (const p of parts) yield p
    })(),
  }
}

describe('createStreamTextAdapter.run', () => {
  const baseCtx = {
    context: { system: 's', tools: {} },
    abortSignal: new AbortController().signal,
  }

  it('yields cumulative text as deltas arrive', async () => {
    const adapter = createStreamTextAdapter({
      streamTextImpl: () =>
        fakeStream([
          { type: 'text-delta', textDelta: 'He' },
          { type: 'text-delta', textDelta: 'llo' },
        ]),
      createModelImpl: () => ({}) as never,
      readConfig: () => ({ provider: 'openai', apiKey: 'k', model: 'm' }),
    })
    const seen: string[] = []
    for await (const r of adapter.run({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      ...baseCtx,
    })) {
      const t = r.content.find((c) => c.type === 'text')
      if (t && t.type === 'text') seen.push(t.text)
    }
    expect(seen).toEqual(['He', 'Hello'])
  })

  it('forwards frontend tool execution to AI SDK', async () => {
    const execute = vi.fn(() => ({ changed: true, matchCount: 1 }))
    let sdkTools:
      | Record<
          string,
          {
            execute?: (
              args: unknown,
              options: {
                toolCallId: string
                messages: []
                abortSignal: AbortSignal
              },
            ) => Promise<unknown>
          }
        >
      | undefined
    const adapter = createStreamTextAdapter({
      streamTextImpl: (options) => {
        sdkTools = options.tools as typeof sdkTools
        return fakeStream([
          {
            type: 'tool-call',
            toolCallId: 't1',
            toolName: 'apply_filter',
            args: { add: [] },
          },
        ])
      },
      createModelImpl: () => ({}) as never,
      readConfig: () => ({ provider: 'openai', apiKey: 'k', model: 'm' }),
    })

    for await (const _ of adapter.run({
      messages: [],
      abortSignal: new AbortController().signal,
      context: {
        tools: {
          apply_filter: {
            description: 'Apply filters',
            parameters: { type: 'object', properties: {} },
            execute,
          },
        },
      },
    })) {
      void _
    }

    const result = sdkTools?.apply_filter.execute?.(
      { add: [] },
      {
        toolCallId: 't1',
        messages: [],
        abortSignal: new AbortController().signal,
      },
    )

    expect(result).toBeInstanceOf(Promise)
    await expect(result).resolves.toEqual({ changed: true, matchCount: 1 })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('marks tool-call results for LocalRuntime continuation', async () => {
    const adapter = createStreamTextAdapter({
      streamTextImpl: () =>
        fakeStream([
          {
            type: 'tool-call',
            toolCallId: 't1',
            toolName: 'apply_filter',
            args: { add: [] },
          },
        ]),
      createModelImpl: () => ({}) as never,
      readConfig: () => ({ provider: 'openai', apiKey: 'k', model: 'm' }),
    })
    let last:
      | {
          status?: { type: string; reason: string }
          metadata?: { steps: unknown[] }
        }
      | undefined

    for await (const result of adapter.run({ messages: [], ...baseCtx })) {
      last = result
    }

    expect(last?.status).toEqual({
      type: 'requires-action',
      reason: 'tool-calls',
    })
    expect(last?.metadata?.steps).toHaveLength(1)
  })

  it('includes the active assistant tool result in a continuation request', async () => {
    let providerMessages: unknown
    const adapter = createStreamTextAdapter({
      streamTextImpl: (options) => {
        providerMessages = options.messages
        return fakeStream([])
      },
      createModelImpl: () => ({}) as never,
      readConfig: () => ({ provider: 'openai', apiKey: 'k', model: 'm' }),
    })

    for await (const _ of adapter.run({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'dark' }] }],
      currentMessage: {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 't1',
            toolName: 'apply_filter',
            args: { add: [] },
            result: { success: true, changed: false, matchCount: 2 },
          },
        ],
      },
      ...baseCtx,
    })) {
      void _
    }

    expect(providerMessages).toEqual([
      { role: 'user', content: 'dark' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 't1',
            toolName: 'apply_filter',
            args: { add: [] },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 't1',
            toolName: 'apply_filter',
            result: { success: true, changed: false, matchCount: 2 },
            isError: false,
          },
        ],
      },
    ])
  })

  it('accumulates tool calls alongside text', async () => {
    const adapter = createStreamTextAdapter({
      streamTextImpl: () =>
        fakeStream([
          { type: 'text-delta', textDelta: 'ok' },
          { type: 'tool-call', toolCallId: 't1', toolName: 'apply_filter', args: { add: [] } },
          { type: 'text-delta', textDelta: '!' },
        ]),
      createModelImpl: () => ({}) as never,
      readConfig: () => ({ provider: 'openai', apiKey: 'k', model: 'm' }),
    })
    let last: { content: ReturnType<typeof Array.prototype.slice> } | undefined
    for await (const r of adapter.run({ messages: [], ...baseCtx })) last = r as never
    const content = last!.content as Array<{ type: string; toolName?: string; text?: string }>
    const toolCalls = content.filter((c) => c.type === 'tool-call')
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].toolName).toBe('apply_filter')
    expect(content.find((c) => c.type === 'text')!.text).toBe('ok!')
  })

  it('classifies an error part emitted by the stream', async () => {
    const adapter = createStreamTextAdapter({
      streamTextImpl: () => fakeStream([{ type: 'error', error: new Error('429 rate limit') }]),
      createModelImpl: () => ({}) as never,
      readConfig: () => ({ provider: 'openai', apiKey: 'k', model: 'm' }),
    })
    await expect(async () => {
      for await (const _ of adapter.run({ messages: [], ...baseCtx })) {
        void _
      }
    }).rejects.toMatchObject({ kind: 'rate-limit' })
  })

  it('throws classified AiClientError when config missing', async () => {
    const adapter = createStreamTextAdapter({
      streamTextImpl: () => fakeStream([]),
      readConfig: () => null,
    })
    await expect(async () => {
      for await (const _ of adapter.run({ messages: [], ...baseCtx })) {
        void _
      }
    }).rejects.toBeInstanceOf(AiClientError)
  })
})
