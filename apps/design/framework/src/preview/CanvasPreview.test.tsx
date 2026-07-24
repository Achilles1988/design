// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { useEffect, useState } from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatModelAdapter } from '@assistant-ui/react'
import {
  AssistantModelModeProvider,
  createDelegatingChatModelAdapter,
} from '@/shell/assistant/modelAdapterMode'
import { subscribeCanvasApplied } from './canvasHotReload'
import { CanvasPreview } from './CanvasPreview'

const mocks = vi.hoisted(() => ({
  listCanvases: vi.fn(),
  loadCanvasModule: vi.fn(),
  checkContext: vi.fn(),
  createAdapter: vi.fn(),
  pageAssistant: vi.fn(),
  toolsMount: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  designApi: {
    listCanvases: mocks.listCanvases,
  },
}))

vi.mock('./loadCanvasModule', () => ({
  loadCanvasModule: mocks.loadCanvasModule,
}))

vi.mock('@/lib/canvasAssistantApi', () => ({
  checkCanvasAssistantContext: mocks.checkContext,
}))

vi.mock('@/shell/assistant/canvasServerAdapter', () => ({
  createCanvasServerAdapter: mocks.createAdapter,
}))

vi.mock('@/shell/assistant/usePageAssistant', () => ({
  usePageAssistant: mocks.pageAssistant,
}))

vi.mock('./CanvasAssistantTools', () => ({
  CanvasAssistantTools: (props: unknown) => {
    mocks.toolsMount(props)
    return <div data-testid="canvas-assistant-tools" />
  },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function CanvasRouteSwitcher() {
  const navigate = useNavigate()
  return (
    <>
      <button
        type="button"
        onClick={() => navigate('/apps/other/canvases/about')}
      >
        Open other Canvas
      </button>
      <button type="button" onClick={() => navigate('/settings')}>
        Open Settings
      </button>
    </>
  )
}

function renderCanvasPreview(
  subscribeApplied: (
    appId: string,
    canvasId: string,
    callback: () => void,
  ) => () => void = () => () => undefined,
) {
  let activeAdapter: ChatModelAdapter | null = null
  const setPageAdapter = vi.fn((adapter: ChatModelAdapter | null) => {
    activeAdapter = adapter
  })
  const view = render(
    <AssistantModelModeProvider
      api={{
        getPageAdapter: () => activeAdapter,
        setPageAdapter,
      }}
    >
      <MemoryRouter initialEntries={['/apps/design/canvases/home']}>
        <CanvasRouteSwitcher />
        <Routes>
          <Route
            path="/apps/:id/canvases/:canvasId"
            element={<CanvasPreview subscribeApplied={subscribeApplied} />}
          />
          <Route path="/settings" element={<div>Settings page</div>} />
        </Routes>
      </MemoryRouter>
    </AssistantModelModeProvider>,
  )
  return {
    ...view,
    getActiveAdapter: () => activeAdapter,
    setPageAdapter,
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
      createdAt: new Date(),
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

describe('CanvasPreview Canvas Assistant integration', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.listCanvases.mockResolvedValue([
      { id: 'home', name: 'Home', component: 'src/canvases/home.tsx' },
    ])
    mocks.loadCanvasModule.mockResolvedValue(() => (
      <div data-testid="canvas">Canvas</div>
    ))
    mocks.checkContext.mockResolvedValue(undefined)
    mocks.createAdapter.mockImplementation(({ appId, canvasId }) => ({
      id: `${appId}:${canvasId}`,
      async *run() {},
    }))
  })

  it('enables the assistant only after Canvas context readiness', async () => {
    const context = deferred<void>()
    mocks.checkContext.mockReturnValue(context.promise)
    const view = renderCanvasPreview()

    await screen.findByTestId('canvas')
    expect(view.getActiveAdapter()).toBeNull()
    expect(mocks.pageAssistant).toHaveBeenLastCalledWith({
      instructions: '',
      available: false,
    })

    context.resolve()

    await waitFor(() =>
      expect(view.getActiveAdapter()).toMatchObject({ id: 'design:home' }),
    )
    expect(mocks.pageAssistant).toHaveBeenLastCalledWith({
      instructions: '',
      available: true,
    })
    expect(screen.getByTestId('canvas-assistant-tools')).toBeTruthy()
  })

  it('binds the adapter to the current appId and canvasId', async () => {
    renderCanvasPreview()

    await waitFor(() =>
      expect(mocks.createAdapter).toHaveBeenCalledWith({
        appId: 'design',
        canvasId: 'home',
      }),
    )
    await waitFor(() =>
      expect(mocks.toolsMount).toHaveBeenCalledWith({
        appId: 'design',
        canvasId: 'home',
      }),
    )
  })

  it('does not register new Canvas ids before their context is ready', async () => {
    const nextContext = deferred<void>()
    mocks.listCanvases.mockImplementation(async (appId: string) => [
      appId === 'design'
        ? { id: 'home', name: 'Home', component: 'src/canvases/home.tsx' }
        : { id: 'about', name: 'About', component: 'src/canvases/about.tsx' },
    ])
    mocks.checkContext.mockImplementation(
      ({ appId }: { appId: string }) =>
        appId === 'design' ? Promise.resolve() : nextContext.promise,
    )
    const view = renderCanvasPreview()
    await waitFor(() =>
      expect(view.getActiveAdapter()).toMatchObject({ id: 'design:home' }),
    )
    const callCount = view.setPageAdapter.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Open other Canvas' }))

    await waitFor(() => expect(view.getActiveAdapter()).toBeNull())
    expect(
      view.setPageAdapter.mock.calls
        .slice(callCount)
        .some(
          ([adapter]) =>
            (adapter as (ChatModelAdapter & { id?: string }) | null)?.id ===
            'other:about',
        ),
    ).toBe(false)

    nextContext.resolve()
    await waitFor(() =>
      expect(view.getActiveAdapter()).toMatchObject({ id: 'other:about' }),
    )
  })

  it('cleans the page adapter when CanvasPreview unmounts', async () => {
    const view = renderCanvasPreview()
    await waitFor(() => expect(view.getActiveAdapter()).not.toBeNull())

    view.unmount()

    expect(view.getActiveAdapter()).toBeNull()
    expect(view.setPageAdapter).toHaveBeenLastCalledWith(null)
  })

  it('routes through the default adapter after leaving Canvas', async () => {
    const view = renderCanvasPreview()
    await waitFor(() => expect(view.getActiveAdapter()).not.toBeNull())
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const defaultAdapter: ChatModelAdapter = {
      async *run() {
        yield { content: [{ type: 'text', text: 'browser adapter' }] }
      },
    }
    const delegating = createDelegatingChatModelAdapter(
      defaultAdapter,
      view.getActiveAdapter,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))

    await screen.findByText('Settings page')
    await waitFor(() => expect(view.getActiveAdapter()).toBeNull())
    const output = delegating.run(runOptions())
    const chunks = []
    if (Symbol.asyncIterator in output) {
      for await (const chunk of output) chunks.push(chunk)
    } else {
      chunks.push(await output)
    }
    expect(chunks).toEqual([
      { content: [{ type: 'text', text: 'browser adapter' }] },
    ])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cleans HMR subscriptions on target change and unmount', async () => {
    mocks.listCanvases.mockImplementation(async (appId: string) => [
      appId === 'design'
        ? { id: 'home', name: 'Home', component: 'src/canvases/home.tsx' }
        : { id: 'about', name: 'About', component: 'src/canvases/about.tsx' },
    ])
    const cleanups: ReturnType<typeof vi.fn>[] = []
    const subscribe = vi.fn(() => {
      const cleanupSubscription = vi.fn()
      cleanups.push(cleanupSubscription)
      return cleanupSubscription
    })
    const view = renderCanvasPreview(subscribe)
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Open other Canvas' }))

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2))
    expect(cleanups[0]).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(cleanups[1]).toHaveBeenCalledTimes(1)
  })

  it('remounts the Canvas only for a matching canvas-assistant:applied event', async () => {
    const listeners = new Map<
      string,
      (payload: { appId: string; canvasId: string }) => void
    >()
    const callback = vi.fn()
    const unsubscribe = subscribeCanvasApplied(
      'design',
      'home',
      callback,
      {
        on: (event, listener) => listeners.set(event, listener),
        off: (event, listener) => {
          if (listeners.get(event) === listener) listeners.delete(event)
        },
      },
    )
    listeners.get('canvas-assistant:applied')?.({
      appId: 'other',
      canvasId: 'home',
    })
    listeners.get('canvas-assistant:applied')?.({
      appId: 'design',
      canvasId: 'other',
    })
    expect(callback).not.toHaveBeenCalled()
    listeners.get('canvas-assistant:applied')?.({
      appId: 'design',
      canvasId: 'home',
    })
    expect(callback).toHaveBeenCalledTimes(1)
    unsubscribe()
    expect(listeners.size).toBe(0)

    let mounts = 0
    let unmounts = 0
    function StatefulCanvas() {
      const [value, setValue] = useState('Initial')
      useEffect(() => {
        mounts += 1
        return () => {
          unmounts += 1
        }
      }, [])
      return (
        <button type="button" onClick={() => setValue('Edited')}>
          Canvas {value}
        </button>
      )
    }
    mocks.loadCanvasModule.mockResolvedValue(StatefulCanvas)
    let notifyApplied: (() => void) | undefined
    const unsubscribeCanvas = vi.fn()
    const subscribe = vi.fn(
      (_appId: string, _canvasId: string, next: () => void) => {
        notifyApplied = next
        return unsubscribeCanvas
      },
    )
    const view = renderCanvasPreview(subscribe)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Canvas Initial' }),
    )
    await screen.findByRole('button', { name: 'Canvas Edited' })

    act(() => notifyApplied?.())

    await screen.findByRole('button', { name: 'Canvas Initial' })
    expect(mounts).toBe(2)
    expect(unmounts).toBe(1)
    expect(subscribe).toHaveBeenCalledWith('design', 'home', expect.any(Function))
    view.unmount()
    expect(unsubscribeCanvas).toHaveBeenCalledTimes(1)
  })

  it('keeps a blank Canvas assistant-capable', async () => {
    mocks.loadCanvasModule.mockResolvedValue(() => null)
    const view = renderCanvasPreview()

    await waitFor(() =>
      expect(view.getActiveAdapter()).toMatchObject({ id: 'design:home' }),
    )
    expect(screen.getByTestId('canvas-assistant-tools')).toBeTruthy()
    expect(mocks.pageAssistant).toHaveBeenLastCalledWith({
      instructions: '',
      available: true,
    })
  })

  it('announces an English context error when the preview is ready', async () => {
    mocks.checkContext.mockRejectedValue(
      new Error('Installed Style could not be loaded.'),
    )
    const view = renderCanvasPreview()

    await screen.findByTestId('canvas')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(
      'Canvas Assistant unavailable: Installed Style could not be loaded.',
    )
    expect(alert.className).toContain('canvas-assistant-context-error')
    expect(view.getActiveAdapter()).toBeNull()
    expect(mocks.pageAssistant).toHaveBeenLastCalledWith({
      instructions: '',
      available: false,
    })
  })

  it('announces an asynchronously inserted context error when the preview also fails', async () => {
    const context = deferred<void>()
    mocks.checkContext.mockReturnValue(context.promise)
    mocks.loadCanvasModule.mockRejectedValue(
      new Error('Canvas preview could not be loaded.'),
    )
    const view = renderCanvasPreview()

    await screen.findByText('Canvas preview could not be loaded.')
    context.reject(new Error('Installed Style could not be loaded.'))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(
      'Canvas Assistant unavailable: Installed Style could not be loaded.',
    )
    expect(alert.className).toContain('canvas-assistant-context-error')
    expect(view.getActiveAdapter()).toBeNull()
  })

  it('uses a dedicated high-contrast Canvas Assistant context error style', () => {
    const appStyles = readFileSync(
      'framework/src/features/apps/apps.css',
      'utf8',
    )

    expect(appStyles).toMatch(
      /\.canvas-assistant-context-error \{[\s\S]*?border: 1px solid color-mix\(in srgb, var\(--color-danger\) 40%, transparent\);[\s\S]*?background: color-mix\(in srgb, var\(--color-danger\) 12%, transparent\);[\s\S]*?color: var\(--color-text\);[\s\S]*?font-size: 14px;/,
    )
    expect(appStyles).toMatch(
      /\.canvas-assistant-context-error::before \{[\s\S]*?background: var\(--color-danger\);/,
    )
  })
})
