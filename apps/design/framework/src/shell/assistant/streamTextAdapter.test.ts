import { describe, expect, it } from 'vitest'
import { createStreamTextAdapter, toCoreMessages } from './streamTextAdapter'
import { AiClientError } from '@/lib/ai/client'

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
      { role: 'assistant', content: 'hi\nthere' },
    ])
  })

  it('drops non-text parts and empty messages', () => {
    const out = toCoreMessages([
      { role: 'assistant', content: [{ type: 'tool-call', toolName: 'x' }] },
      { role: 'user', content: [{ type: 'text', text: 'q' }] },
    ])
    expect(out).toEqual([{ role: 'user', content: 'q' }])
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
