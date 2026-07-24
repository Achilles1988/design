// @vitest-environment jsdom
import { useRef, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applyFilter, emptyFilter, type Filter } from '@/lib/ai/filterState'
import type { AssetMeta } from '@/lib/ai/assetIndex'
import { createPageScopedModelAdapter } from '@/shell/assistant/AssistantProvider'
import { AssistantThread } from '@/shell/assistant/AssistantThread'
import { createStreamTextAdapter } from '@/shell/assistant/streamTextAdapter'
import { AssetFilterTool } from './assistantFilterTool'

const originalScrollTo = HTMLElement.prototype.scrollTo

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  })
})

afterAll(async () => {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
  vi.unstubAllGlobals()
  if (originalScrollTo) {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: originalScrollTo,
    })
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
  }
})

const index: AssetMeta[] = [
  {
    id: 'dark',
    title: 'Dark dashboard',
    summary: '',
    tags: ['dark'],
    origin: 'manual',
    hasPreview: true,
  },
  {
    id: 'light',
    title: 'Light dashboard',
    summary: '',
    tags: ['light'],
    origin: 'manual',
    hasPreview: true,
  },
]

type IntegrationProbe = {
  initialRuns: number
  continuationRuns: number
  executeCalls: number
  continuationReceivedToolResult: boolean
}

function Harness({ probe }: { probe: IntegrationProbe }) {
  const [filter, setFilter] = useState<Filter>(emptyFilter())
  const filterRef = useRef(filter)
  filterRef.current = filter
  const adapter = createStreamTextAdapter({
    streamTextImpl: (options) => {
      const tools = options.tools as Record<
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
      const messages = options.messages as Array<{
        role?: string
        content?: unknown
      }>
      const toolMessage = messages.find((message) => message.role === 'tool')
      const isContinuation = toolMessage !== undefined
      if (isContinuation) {
        probe.continuationRuns += 1
        probe.continuationReceivedToolResult =
          Array.isArray(toolMessage.content) &&
          toolMessage.content.some(
            (part) =>
              typeof part === 'object' &&
              part !== null &&
              'type' in part &&
              part.type === 'tool-result' &&
              'toolName' in part &&
              part.toolName === 'apply_filter' &&
              'result' in part &&
              typeof part.result === 'object' &&
              part.result !== null &&
              'success' in part.result &&
              part.result.success === true,
          )
      } else {
        probe.initialRuns += 1
      }
      return {
        fullStream: (async function* () {
          if (isContinuation) {
            yield { type: 'text-delta', textDelta: 'Applied dark.' }
            yield { type: 'finish', finishReason: 'stop' }
            return
          }
          const args = {
            add: [{ kind: 'tag' as const, label: 'dark', value: 'dark' }],
            remove: [],
          }
          yield {
            type: 'tool-call',
            toolCallId: 't1',
            toolName: 'apply_filter',
            args,
          }
          probe.executeCalls += 1
          const result = await tools.apply_filter.execute!(args, {
            toolCallId: 't1',
            messages: [],
            abortSignal: new AbortController().signal,
          })
          yield {
            type: 'tool-result',
            toolCallId: 't1',
            toolName: 'apply_filter',
            result,
          }
          yield { type: 'finish', finishReason: 'stop' }
        })(),
      }
    },
    createModelImpl: () => ({}) as never,
    readConfig: () => ({
      provider: 'openai',
      apiKey: 'test',
      model: 'test',
      baseURL: 'https://example.test/v1',
    }),
  })
  const modelAdapter: ChatModelAdapter = createPageScopedModelAdapter(
    adapter,
    () => 0,
  )
  const runtime = useLocalRuntime(modelAdapter, { maxSteps: 2 })
  const visible = applyFilter(index, filter)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssetFilterTool
        index={index}
        filterRef={filterRef}
        onFilterChange={setFilter}
      />
      <output aria-label="active filters">
        {filter.chips.map((chip) => chip.label).join(',')}
      </output>
      <output aria-label="match count">{visible.length}</output>
      <ul aria-label="visible assets">
        {visible.map((item) => (
          <li key={item.id}>{item.title}</li>
        ))}
      </ul>
      <AssistantThread />
    </AssistantRuntimeProvider>
  )
}

describe('assistant filtering integration', () => {
  it('updates chips, count, and visible assets after a clear prompt', async () => {
    const probe: IntegrationProbe = {
      initialRuns: 0,
      continuationRuns: 0,
      executeCalls: 0,
      continuationReceivedToolResult: false,
    }
    render(<Harness probe={probe} />)
    fireEvent.change(screen.getByPlaceholderText('Describe what you need…'), {
      target: { value: 'Show dark designs' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByLabelText('active filters').textContent).toBe('dark')
      expect(screen.getByLabelText('match count').textContent).toBe('1')
      expect(screen.getByLabelText('visible assets').textContent).toContain(
        'Dark dashboard',
      )
      expect(screen.getByLabelText('visible assets').textContent).not.toContain(
        'Light dashboard',
      )
      expect(probe.initialRuns).toBe(1)
      expect(probe.continuationRuns).toBe(1)
      expect(probe.executeCalls).toBe(1)
      expect(probe.continuationReceivedToolResult).toBe(true)
      expect(screen.getByText('Applied dark.')).toBeTruthy()
    })
  })
})
