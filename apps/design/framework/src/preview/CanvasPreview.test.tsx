// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { StrictMode } from 'react'
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
import {
  clearCanvasRenameNotice,
  readCanvasRenameNotice,
  writeCanvasRenameNotice,
} from '@/lib/canvasRenameNotice'
import { subscribeCanvasApplied } from './canvasHotReload'
import { CanvasPreview } from './CanvasPreview'

const mocks = vi.hoisted(() => ({
  listCanvases: vi.fn(),
  loadCanvasModule: vi.fn(),
  checkContext: vi.fn(),
  createPreviewSession: vi.fn(),
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
  createCanvasPreviewSession: mocks.createPreviewSession,
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
  options: { strictMode?: boolean } = {},
) {
  let activeAdapter: ChatModelAdapter | null = null
  const setPageAdapter = vi.fn((adapter: ChatModelAdapter | null) => {
    activeAdapter = adapter
  })
  const preview = (
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
    </AssistantModelModeProvider>
  )
  const view = render(
    options.strictMode ? <StrictMode>{preview}</StrictMode> : preview,
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
    clearCanvasRenameNotice()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.listCanvases.mockResolvedValue([
      { id: 'home', name: 'Home', component: 'Home.tsx' },
    ])
    mocks.loadCanvasModule.mockResolvedValue(() => (
      <div data-testid="canvas">Canvas</div>
    ))
    mocks.checkContext.mockResolvedValue(undefined)
    mocks.createPreviewSession.mockImplementation(
      async ({ canvasId }: { canvasId: string }) => ({
        moduleBase:
          '/__design_canvas_preview/00000000-0000-4000-8000-000000000001/',
        componentFile:
          canvasId === 'about' ? 'About.tsx' : 'Home.tsx',
        expiresAt: '2099-07-25T12:30:00.000Z',
      }),
    )
    mocks.createAdapter.mockImplementation(({ appId, canvasId }) => ({
      id: `${appId}:${canvasId}`,
      async *run() {},
    }))
  })

  it('enables the assistant only after Canvas context readiness', async () => {
    const context = deferred<void>()
    mocks.checkContext.mockReturnValue(context.promise)
    const view = renderCanvasPreview()

    await screen.findByTitle('Canvas preview')
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
        ? { id: 'home', name: 'Home', component: 'Home.tsx' }
        : { id: 'about', name: 'About', component: 'About.tsx' },
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
        ? { id: 'home', name: 'Home', component: 'Home.tsx' }
        : { id: 'about', name: 'About', component: 'About.tsx' },
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

  it('passes reveal into the preview document only after apply remount', async () => {
    let notifyApplied: (() => void) | undefined
    const subscribe = vi.fn(
      (_appId: string, _canvasId: string, next: () => void) => {
        notifyApplied = next
        return () => undefined
      },
    )
    renderCanvasPreview(subscribe)
    const frame = (await screen.findByTitle(
      'Canvas preview',
    )) as HTMLIFrameElement
    expect(frame.srcdoc).not.toMatch(/"reveal"\s*:\s*true/)

    act(() => notifyApplied?.())

    await waitFor(() => {
      const nextFrame = screen.getByTitle(
        'Canvas preview',
      ) as HTMLIFrameElement
      expect(nextFrame.srcdoc).toMatch(/"reveal"\s*:\s*true/)
    })
  })

  it('keeps reveal in srcDoc under StrictMode double render after apply', async () => {
    let notifyApplied: (() => void) | undefined
    const subscribe = vi.fn(
      (_appId: string, _canvasId: string, next: () => void) => {
        notifyApplied = next
        return () => undefined
      },
    )
    renderCanvasPreview(subscribe, { strictMode: true })
    await screen.findByTitle('Canvas preview')

    act(() => notifyApplied?.())

    await waitFor(() => {
      const frame = screen.getByTitle('Canvas preview') as HTMLIFrameElement
      expect(frame.srcdoc).toMatch(/"reveal"\s*:\s*true/)
    })

    await act(async () => {
      await Promise.resolve()
    })

    const frame = screen.getByTitle('Canvas preview') as HTMLIFrameElement
    expect(frame.srcdoc).toMatch(/"reveal"\s*:\s*true/)
  })

  it('does not carry a pending apply reveal to another canvas', async () => {
    mocks.listCanvases.mockImplementation(async (appId: string) => [
      appId === 'design'
        ? { id: 'home', name: 'Home', component: 'Home.tsx' }
        : { id: 'about', name: 'About', component: 'About.tsx' },
    ])
    mocks.checkContext.mockImplementation(({ appId }: { appId: string }) =>
      appId === 'design' ? Promise.resolve() : Promise.resolve(),
    )
    let notifyApplied: (() => void) | undefined
    const subscribe = vi.fn(
      (_appId: string, _canvasId: string, next: () => void) => {
        notifyApplied = next
        return () => undefined
      },
    )
    renderCanvasPreview(subscribe)
    await screen.findByTitle('Canvas preview')

    act(() => notifyApplied?.())
    fireEvent.click(screen.getByRole('button', { name: 'Open other Canvas' }))

    await waitFor(() => {
      const frame = screen.getByTitle('Canvas preview') as HTMLIFrameElement
      expect(frame.srcdoc).not.toMatch(/"reveal"\s*:\s*true/)
    })
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

    let notifyApplied: (() => void) | undefined
    const unsubscribeCanvas = vi.fn()
    const subscribe = vi.fn(
      (_appId: string, _canvasId: string, next: () => void) => {
        notifyApplied = next
        return unsubscribeCanvas
      },
    )
    const view = renderCanvasPreview(subscribe)
    const firstFrame = await screen.findByTitle('Canvas preview')

    act(() => notifyApplied?.())

    await waitFor(() =>
      expect(screen.getByTitle('Canvas preview')).not.toBe(firstFrame),
    )
    expect(subscribe).toHaveBeenCalledWith('design', 'home', expect.any(Function))
    view.unmount()
    expect(unsubscribeCanvas).toHaveBeenCalledTimes(1)
  })

  it('keeps a blank Canvas assistant-capable', async () => {
    const view = renderCanvasPreview()

    await waitFor(() =>
      expect(view.getActiveAdapter()).toMatchObject({ id: 'design:home' }),
    )
    expect(screen.getByTestId('canvas-assistant-tools')).toBeTruthy()
    expect(mocks.pageAssistant).toHaveBeenLastCalledWith({
      instructions: '',
      available: true,
    })
    expect(await screen.findByTitle('Canvas preview')).toBeTruthy()
  })

  it('keeps the existing missing Canvas entry error before minting a session', async () => {
    mocks.listCanvases.mockResolvedValue([])

    renderCanvasPreview()

    expect(
      await screen.findByText('Canvas entry not found in canvases.json'),
    ).toBeTruthy()
    expect(mocks.createPreviewSession).not.toHaveBeenCalled()
  })

  it('renews the preview capability before it expires', async () => {
    mocks.createPreviewSession
      .mockResolvedValueOnce({
        moduleBase:
          '/__design_canvas_preview/00000000-0000-4000-8000-000000000001/',
        componentFile: 'Home.tsx',
        expiresAt: new Date(Date.now() + 100).toISOString(),
      })
      .mockResolvedValueOnce({
        moduleBase:
          '/__design_canvas_preview/00000000-0000-4000-8000-000000000002/',
        componentFile: 'Home.tsx',
        expiresAt: '2099-07-25T12:30:00.000Z',
      })

    renderCanvasPreview()

    await waitFor(() =>
      expect(mocks.createPreviewSession).toHaveBeenCalledTimes(2),
    )
    expect(
      (screen.getByTitle('Canvas preview') as HTMLIFrameElement)
        .srcdoc,
    ).toContain(
      '/__design_canvas_preview/00000000-0000-4000-8000-000000000002/',
    )
  })

  it('executes the Canvas only in an opaque-origin sandboxed iframe', async () => {
    renderCanvasPreview()

    const frame = (await screen.findByTitle(
      'Canvas preview',
    )) as HTMLIFrameElement
    expect(frame.tagName).toBe('IFRAME')
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(mocks.createPreviewSession).toHaveBeenCalledWith({
      appId: 'design',
      canvasId: 'home',
    })
    expect(frame.srcdoc).toContain('/__design_canvas_preview/')
    expect(screen.queryByTestId('canvas')).toBeNull()
    expect(mocks.loadCanvasModule).not.toHaveBeenCalled()
  })

  it('accepts preview errors only from the current frame with an exact message type', async () => {
    renderCanvasPreview()
    const frame = (await screen.findByTitle(
      'Canvas preview',
    )) as HTMLIFrameElement
    const generation = frame.getAttribute('data-preview-generation')
    expect(frame.getAttribute('data-preview-state')).toBe('loading')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'null',
          source: window,
          data: {
            type: 'canvas-preview:ready',
            generation,
          },
        }),
      )
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'null',
          source: window,
          data: {
            type: 'canvas-preview:error',
            generation,
            message: 'Forged outside error',
          },
        }),
      )
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'null',
          source: frame.contentWindow,
          data: {
            type: 'canvas-preview:mutate',
            generation,
            message: 'Unsupported capability',
          },
        }),
      )
    })
    expect(frame.getAttribute('data-preview-state')).toBe('loading')
    expect(screen.queryByText('Forged outside error')).toBeNull()
    expect(screen.queryByText('Unsupported capability')).toBeNull()

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'null',
          source: frame.contentWindow,
          data: {
            type: 'canvas-preview:ready',
            generation,
          },
        }),
      )
    })
    expect(frame.getAttribute('data-preview-state')).toBe('ready')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'null',
          source: frame.contentWindow,
          data: {
            type: 'canvas-preview:error',
            generation,
            message: 'Canvas render failed.',
          },
        }),
      )
    })

    expect(await screen.findByText('Canvas render failed.')).toBeTruthy()
  })

  it('announces an English context error when the preview is ready', async () => {
    mocks.checkContext.mockRejectedValue(
      new Error('Installed Style could not be loaded.'),
    )
    const view = renderCanvasPreview()

    await screen.findByTitle('Canvas preview')
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
    const view = renderCanvasPreview()

    const frame = (await screen.findByTitle(
      'Canvas preview',
    )) as HTMLIFrameElement
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'null',
          source: frame.contentWindow,
          data: {
            type: 'canvas-preview:error',
            generation: frame.getAttribute('data-preview-generation'),
            message: 'Canvas preview could not be loaded.',
          },
        }),
      )
    })
    await screen.findByText('Canvas preview could not be loaded.')
    context.reject(new Error('Installed Style could not be loaded.'))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(
      'Canvas Assistant unavailable: Installed Style could not be loaded.',
    )
    expect(alert.className).toContain('canvas-assistant-context-error')
    expect(view.getActiveAdapter()).toBeNull()
  })

  it('shows a rename banner with a link when the canvas entry is missing', async () => {
    writeCanvasRenameNotice({
      appId: 'design',
      fromId: 'home',
      toId: 'landing',
      name: 'Landing',
    })
    mocks.listCanvases.mockResolvedValue([])

    renderCanvasPreview()

    expect(await screen.findByText(/Canvas renamed/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Landing' }).getAttribute('href')).toBe(
      '/apps/design/canvases/landing',
    )
    expect(
      await screen.findByText('Canvas entry not found in canvases.json'),
    ).toBeTruthy()
    expect(mocks.createPreviewSession).not.toHaveBeenCalled()
  })

  it('shows the rename banner above the preview on a stale old route', async () => {
    writeCanvasRenameNotice({
      appId: 'design',
      fromId: 'home',
      toId: 'landing',
      name: 'Landing',
    })

    renderCanvasPreview()

    await screen.findByTitle('Canvas preview')
    expect(screen.getByText(/Canvas renamed/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Landing' }).getAttribute('href')).toBe(
      '/apps/design/canvases/landing',
    )
  })

  it('dismisses the rename banner and clears the stored notice', async () => {
    writeCanvasRenameNotice({
      appId: 'design',
      fromId: 'home',
      toId: 'landing',
      name: 'Landing',
    })
    mocks.listCanvases.mockResolvedValue([])

    renderCanvasPreview()
    await screen.findByRole('status')

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('status')).toBeNull()
    expect(readCanvasRenameNotice('design', 'home')).toBeNull()
  })

  it('uses a dedicated high-contrast Canvas Assistant context error style', () => {
    const appStyles = readFileSync(
      'framework/src/features/apps/apps.css',
      'utf8',
    )

    expect(appStyles).toMatch(
      /\.canvas-assistant-context-error \{[\s\S]*?border: 1px solid color-mix\(in srgb, var\(--color-danger\) 40%, transparent\);[\s\S]*?background: color-mix\(in srgb, var\(--color-danger\) 12%, transparent\);[\s\S]*?color: var\(--color-text\);[\s\S]*?font-size: var\(--text-sm\);/,
    )
    expect(appStyles).toMatch(
      /\.canvas-assistant-context-error::before \{[\s\S]*?background: var\(--color-danger\);/,
    )
  })
})
