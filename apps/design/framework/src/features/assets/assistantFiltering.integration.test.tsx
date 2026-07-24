// @vitest-environment jsdom
import { useMemo, useRef, useState } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  AssistantRuntimeProvider,
  useAssistantTool,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react'
import {
  MemoryRouter,
  useNavigate,
} from 'react-router-dom'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { applyFilter, emptyFilter, type Filter } from '@/lib/ai/filterState'
import type { AssetMeta } from '@/lib/ai/assetIndex'
import { createPageScopedModelAdapter } from '@/shell/assistant/AssistantProvider'
import { AssistantThread } from '@/shell/assistant/AssistantThread'
import {
  AssistantPageSessionProvider,
  useAssistantPageSession,
} from '@/shell/assistant/pageSession'
import {
  patchAssistantPageState,
  readAssistantPageState,
} from '@/shell/assistant/pageState'
import { createStreamTextAdapter } from '@/shell/assistant/streamTextAdapter'
import { AssetFilterTool } from './assistantFilterTool'
import { usePersistentAssetFilter } from './usePersistentAssetFilter'

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

beforeEach(() => localStorage.clear())
afterEach(cleanup)

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
        owner={{ pageKey: '/integration', generation: 1 }}
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

type LateToolControl = {
  waitUntilReleased: Promise<void>
  markStarted: () => void
  markCompleted: (accepted: boolean) => void
}

function DelayedOwnedFilterTool({
  owner,
  setFilter,
  control,
}: {
  owner: { pageKey: string; generation: number }
  setFilter: (
    filter: Filter,
    owner?: { pageKey: string; generation: number },
  ) => boolean | undefined
  control: LateToolControl
}) {
  useAssistantTool({
    toolName: 'apply_filter',
    description: 'Apply a delayed test filter.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    execute: async () => {
      control.markStarted()
      await control.waitUntilReleased
      const accepted = setFilter({
        chips: [{
          id: 'tag:dark',
          kind: 'tag',
          label: 'dark',
          value: 'dark',
          addedBy: 'ai',
        }],
      }, owner) === true
      control.markCompleted(accepted)
      return { success: accepted }
    },
  } as unknown as Parameters<typeof useAssistantTool>[0])
  return null
}

function LateToolPage({ control }: { control: LateToolControl }) {
  const session = useAssistantPageSession()
  const {
    filter,
    owner,
    setFilter,
  } = usePersistentAssetFilter(index)
  const navigate = useNavigate()
  const visible = applyFilter(index, filter)

  return (
    <>
      <DelayedOwnedFilterTool
        owner={owner}
        setFilter={setFilter}
        control={control}
      />
      <output aria-label="late active filters">
        {filter.chips.map((chip) => chip.label).join(',')}
      </output>
      <output aria-label="late match count">{visible.length}</output>
      <ul aria-label="late visible assets">
        {visible.map((item) => <li key={item.id}>{item.title}</li>)}
      </ul>
      <button type="button" onClick={() => navigate('/late-target')}>
        Navigate target
      </button>
      <button type="button" onClick={() => navigate('/late-source')}>
        Navigate source
      </button>
      <button
        type="button"
        onClick={() => session.startNewChat(session.owner)}
      >
        Start new chat
      </button>
      <output aria-label="late session ready">{String(session.ready)}</output>
      {session.ready ? <AssistantThread /> : null}
    </>
  )
}

function LateToolHarness({ control }: { control: LateToolControl }) {
  const epochRef = useRef(0)
  const streamAdapter = useMemo(() => createStreamTextAdapter({
    streamTextImpl: (options) => {
      const tools = options.tools as Record<string, {
        execute?: (
          args: unknown,
          options: {
            toolCallId: string
            messages: []
            abortSignal: AbortSignal
          },
        ) => Promise<unknown>
      }>
      const abortSignal = options.abortSignal as AbortSignal
      return {
        fullStream: (async function* () {
          const args = {}
          yield {
            type: 'tool-call',
            toolCallId: 'late-tool',
            toolName: 'apply_filter',
            args,
          }
          const result = await tools.apply_filter.execute!(args, {
            toolCallId: 'late-tool',
            messages: [],
            abortSignal,
          })
          yield {
            type: 'tool-result',
            toolCallId: 'late-tool',
            toolName: 'apply_filter',
            result,
          }
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
  }), [])
  const modelAdapter = useMemo(
    () => createPageScopedModelAdapter(
      streamAdapter,
      () => epochRef.current,
    ),
    [streamAdapter],
  )
  const runtime = useLocalRuntime(modelAdapter, { maxSteps: 1 })

  return (
    <AssistantPageSessionProvider runtime={runtime} epochRef={epochRef}>
      <AssistantRuntimeProvider runtime={runtime}>
        <LateToolPage control={control} />
      </AssistantRuntimeProvider>
    </AssistantPageSessionProvider>
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

  it('keeps the destination filter, chips, and Store unchanged after a late source tool completes', async () => {
    patchAssistantPageState('/late-target', {
      filter: {
        chips: [{
          id: 'tag:light',
          kind: 'tag',
          label: 'light',
          value: 'light',
          addedBy: 'user',
        }],
      },
    })
    let releaseTool = () => {}
    const waitUntilReleased = new Promise<void>((resolve) => {
      releaseTool = resolve
    })
    let markStarted = () => {}
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    let markCompleted = (_accepted: boolean) => {}
    const completed = new Promise<boolean>((resolve) => {
      markCompleted = resolve
    })
    const control = {
      waitUntilReleased,
      markStarted,
      markCompleted,
    }

    render(
      <MemoryRouter initialEntries={['/late-source']}>
        <LateToolHarness control={control} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Describe what you need…')).toBeTruthy()
    })
    fireEvent.change(screen.getByPlaceholderText('Describe what you need…'), {
      target: { value: 'Show dark designs' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await started

    fireEvent.click(screen.getByRole('button', { name: 'Navigate target' }))
    await waitFor(() => {
      expect(screen.getByLabelText('late active filters').textContent).toBe(
        'light',
      )
    })

    releaseTool()
    await expect(completed).resolves.toBe(false)

    expect(screen.getByLabelText('late active filters').textContent).toBe(
      'light',
    )
    expect(screen.getByLabelText('late match count').textContent).toBe('1')
    expect(screen.getByLabelText('late visible assets').textContent).toContain(
      'Light dashboard',
    )
    expect(screen.getByLabelText('late visible assets').textContent).not.toContain(
      'Dark dashboard',
    )
    expect(readAssistantPageState('/late-target').filter).toEqual({
      chips: [expect.objectContaining({ id: 'tag:light' })],
    })
    expect(readAssistantPageState('/late-source').filter?.chips ?? []).toEqual([])
  })

  it('does not revive a same-page filter when an abort-ignoring tool completes after New chat', async () => {
    let releaseTool = () => {}
    const waitUntilReleased = new Promise<void>((resolve) => {
      releaseTool = resolve
    })
    let markStarted = () => {}
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    let markCompleted = (_accepted: boolean) => {}
    const completed = new Promise<boolean>((resolve) => {
      markCompleted = resolve
    })

    render(
      <MemoryRouter initialEntries={['/late-source']}>
        <LateToolHarness control={{
          waitUntilReleased,
          markStarted,
          markCompleted,
        }} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Describe what you need…')).toBeTruthy()
    })
    fireEvent.change(screen.getByPlaceholderText('Describe what you need…'), {
      target: { value: 'Show dark designs' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await started

    fireEvent.click(screen.getByRole('button', { name: 'Start new chat' }))
    await waitFor(() => {
      expect(screen.getByLabelText('late session ready').textContent).toBe(
        'true',
      )
    })

    releaseTool()
    await expect(completed).resolves.toBe(false)

    expect(screen.getByLabelText('late active filters').textContent).toBe('')
    expect(screen.getByLabelText('late match count').textContent).toBe('2')
    expect(readAssistantPageState('/late-source').filter).toBeUndefined()
  })

  it('does not revive an A filter when an old A tool completes after A to B to A navigation', async () => {
    patchAssistantPageState('/late-target', {
      filter: {
        chips: [{
          id: 'tag:light',
          kind: 'tag',
          label: 'light',
          value: 'light',
          addedBy: 'user',
        }],
      },
    })
    let releaseTool = () => {}
    const waitUntilReleased = new Promise<void>((resolve) => {
      releaseTool = resolve
    })
    let markStarted = () => {}
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    let markCompleted = (_accepted: boolean) => {}
    const completed = new Promise<boolean>((resolve) => {
      markCompleted = resolve
    })

    render(
      <MemoryRouter initialEntries={['/late-source']}>
        <LateToolHarness control={{
          waitUntilReleased,
          markStarted,
          markCompleted,
        }} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Describe what you need…')).toBeTruthy()
    })
    fireEvent.change(screen.getByPlaceholderText('Describe what you need…'), {
      target: { value: 'Show dark designs' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await started

    fireEvent.click(screen.getByRole('button', { name: 'Navigate target' }))
    await waitFor(() => {
      expect(screen.getByLabelText('late active filters').textContent).toBe(
        'light',
      )
    })
    fireEvent.click(screen.getByRole('button', { name: 'Navigate source' }))
    await waitFor(() => {
      expect(screen.getByLabelText('late session ready').textContent).toBe(
        'true',
      )
      expect(screen.getByLabelText('late active filters').textContent).toBe('')
    })

    releaseTool()
    await expect(completed).resolves.toBe(false)

    expect(screen.getByLabelText('late active filters').textContent).toBe('')
    expect(screen.getByLabelText('late match count').textContent).toBe('2')
    expect(readAssistantPageState('/late-source').filter).toBeUndefined()
    expect(readAssistantPageState('/late-target').filter).toEqual({
      chips: [expect.objectContaining({ id: 'tag:light' })],
    })
  })
})
