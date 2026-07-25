// @vitest-environment jsdom
import { useEffect, type ReactNode } from 'react'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AssistantRuntime,
  ChatModelAdapter,
} from '@assistant-ui/react'
import { AssistantProvider } from './AssistantProvider'
import { usePageModelAdapter } from './modelAdapterMode'

const captured = vi.hoisted(() => ({
  adapter: null as ChatModelAdapter | null,
  options: null as Record<string, unknown> | null,
}))

vi.mock('@assistant-ui/react', async () => {
  const actual = await vi.importActual<typeof import('@assistant-ui/react')>(
    '@assistant-ui/react',
  )
  return {
    ...actual,
    AssistantRuntimeProvider: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
    useLocalRuntime: vi.fn(
      (
        adapter: ChatModelAdapter,
        options: Record<string, unknown>,
      ): AssistantRuntime => {
        captured.adapter = adapter
        captured.options = options
        return {} as AssistantRuntime
      },
    ),
  }
})

vi.mock('./availability', () => ({
  AssistantAvailabilityProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock('./pageSession', () => ({
  AssistantPageSessionProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))

function PageAdapterRegistration({
  calls,
  receivedOptions,
}: {
  calls: string[]
  receivedOptions: unknown[]
}) {
  const pageAdapter: ChatModelAdapter = {
    async *run(options) {
      calls.push('page')
      receivedOptions.push(options)
    },
  }
  usePageModelAdapter(pageAdapter)
  useEffect(() => {
    calls.push('mounted')
  }, [calls])
  return null
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

describe('AssistantProvider', () => {
  beforeEach(() => {
    captured.adapter = null
    captured.options = null
  })

  it('routes through a page adapter with Canvas human tools enabled', async () => {
    const calls: string[] = []
    const receivedOptions: unknown[] = []
    render(
      <AssistantProvider>
        <PageAdapterRegistration
          calls={calls}
          receivedOptions={receivedOptions}
        />
      </AssistantProvider>,
    )
    await waitFor(() => expect(calls).toContain('mounted'))

    const result = captured.adapter!.run(runOptions())
    if (!(Symbol.asyncIterator in result)) {
      await result
    } else for await (const _ of result) {
      void _
    }

    expect(calls).toContain('page')
    expect(receivedOptions).toHaveLength(1)
    expect(receivedOptions[0]).toMatchObject({ runConfig: {} })
    expect(receivedOptions[0]).toHaveProperty(
      'unstable_getMessage',
      expect.any(Function),
    )
    expect(captured.options).toMatchObject({
      maxSteps: 2,
      unstable_humanToolNames: [
        'recommend_canvas_layout',
        'propose_canvas_change',
      ],
      adapters: {
        attachments: expect.objectContaining({
          accept: 'image/png,image/jpeg,image/webp',
        }),
      },
    })
  })
})
