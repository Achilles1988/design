import { describe, expect, it } from 'vitest'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { createDelegatingChatModelAdapter } from './modelAdapterMode'

function adapterThatRecords(
  name: string,
  calls: string[],
): ChatModelAdapter {
  return {
    async *run() {
      calls.push(name)
    },
  }
}

async function collectRun(
  adapter: ChatModelAdapter,
  options: Parameters<ChatModelAdapter['run']>[0],
): Promise<void> {
  const result = adapter.run(options)
  if (!(Symbol.asyncIterator in result)) {
    await result
  } else for await (const _ of result) {
    void _
  }
}

function runOptions(): Parameters<ChatModelAdapter['run']>[0] {
  return {
    messages: [],
    runConfig: {},
    abortSignal: new AbortController().signal,
    context: {},
    unstable_getMessage: () => ({
      id: 'assistant-1',
      role: 'assistant',
      content: [],
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
      status: { type: 'complete', reason: 'stop' },
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

describe('createDelegatingChatModelAdapter', () => {
  it('uses the page adapter when one is registered', async () => {
    const calls: string[] = []
    const defaultAdapter = adapterThatRecords('default', calls)
    const pageAdapter = adapterThatRecords('page', calls)
    const delegating = createDelegatingChatModelAdapter(
      defaultAdapter,
      () => pageAdapter,
    )

    await collectRun(delegating, runOptions())

    expect(calls).toEqual(['page'])
  })

  it('falls back to the default adapter after page cleanup', async () => {
    const calls: string[] = []
    let current: ChatModelAdapter | null = null
    const delegating = createDelegatingChatModelAdapter(
      adapterThatRecords('default', calls),
      () => current,
    )

    current = adapterThatRecords('page', calls)
    await collectRun(delegating, runOptions())
    current = null
    await collectRun(delegating, runOptions())

    expect(calls).toEqual(['page', 'default'])
  })
})
