// @vitest-environment jsdom
import { useEffect } from 'react'
import {
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
  useParams,
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
import { writeAiConfig } from '@/lib/ai/config'
import type {
  CanvasChatRequest,
  CanvasProposalCardArgs,
} from '@/lib/canvasAssistantProtocol'
import { AssistantProvider } from '@/shell/assistant/AssistantProvider'
import { AssistantThread } from '@/shell/assistant/AssistantThread'
import { CanvasAssistantTools } from './CanvasAssistantTools'
import { useCanvasAssistant } from './useCanvasAssistant'

type ChatResponder = (
  request: CanvasChatRequest,
) => Array<Record<string, unknown>>

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

function runResult(
  content: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    type: 'run-result',
    value: {
      content,
      ...(content.some((part) => part.type === 'tool-call')
        ? {
            status: {
              type: 'requires-action',
              reason: 'tool-calls',
            },
            metadata: { steps: [{}] },
          }
        : {}),
    },
  }
}

function layoutEvent(): Record<string, unknown> {
  const args = {
    layoutId: 'centered',
    title: 'Centered',
    summary: 'A focused single-column Layout.',
    reason: 'The Canvas needs one clear reading column.',
    previewUrl: '/assets/layoutmd/centered/preview.html',
  }
  return runResult([{
    type: 'tool-call',
    toolCallId: 'layout-call',
    toolName: 'recommend_canvas_layout',
    args,
    argsText: JSON.stringify(args),
  }])
}

function proposalArgs(
  proposalId = 'proposal-1',
): CanvasProposalCardArgs {
  return {
    proposalId,
    mode: 'update',
    summary: ['Build the text-only Canvas proposal.'],
    styleId: 'dashboard',
    layout: {
      kind: 'installed',
      id: 'centered',
      reason: 'The installed Layout fits.',
    },
    changedFiles: ['canvases/Home.tsx'],
    reusedComponents: [],
    newSharedComponents: [],
    preserved: ['App navigation'],
    validationChecks: ['Vite transform'],
    candidateFiles: [
      {
        path: 'canvases/Home.tsx',
        source: 'export default function Home() { return null }',
      },
    ],
    expiresAt: '2026-07-25T12:30:00.000Z',
  }
}

function proposalEvent(
  proposalId = 'proposal-1',
): Record<string, unknown> {
  const args = proposalArgs(proposalId)
  return runResult([{
    type: 'tool-call',
    toolCallId: `proposal-call-${proposalId}`,
    toolName: 'propose_canvas_change',
    args,
    argsText: JSON.stringify(args),
  }])
}

function ndjsonResponse(events: Array<Record<string, unknown>>): Response {
  return new Response(
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    },
  )
}

class FakeCanvasApi {
  readonly chatRequests: CanvasChatRequest[] = []
  readonly applyRequests: string[] = []
  readonly chatResponders: ChatResponder[] = []
  readonly disk = {
    layouts: ['sidebar-shell'],
    canvasSource: 'export default function Home() { return null }\n',
  }
  proposedSource =
    'export default function Home() { return <main>Applied</main> }\n'
  applyEvents: Array<Record<string, unknown>> = [
    { type: 'status', phase: 'checking' },
    { type: 'status', phase: 'writing' },
    { type: 'status', phase: 'validating' },
    { type: 'status', phase: 'repairing', attempt: 1 },
    {
      type: 'complete',
      result: {
        ok: true,
        proposalId: 'proposal-1',
        repairAttempts: 1,
      },
    },
  ]

  enqueue(...responders: ChatResponder[]) {
    this.chatResponders.push(...responders)
  }

  fetch = vi.fn(async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url

    if (url === '/__design_ai/canvas/chat') {
      const request = JSON.parse(String(init?.body)) as CanvasChatRequest
      this.chatRequests.push(request)
      const responder = this.chatResponders.shift()
      if (!responder) {
        throw new Error('No fake Canvas chat response was queued.')
      }
      return ndjsonResponse(responder(request))
    }

    if (
      url === '/__design_fs/assets/layoutmd/centered/apply'
    ) {
      if (!this.disk.layouts.includes('centered')) {
        this.disk.layouts.push('centered')
      }
      return new Response(
        JSON.stringify({
          id: 'design',
          name: 'Design',
          style: 'dashboard',
          layouts: [...this.disk.layouts],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    if (url.startsWith('/__design_ai/canvas/proposals/')) {
      this.applyRequests.push(url)
      this.disk.canvasSource = this.proposedSource
      return ndjsonResponse(this.applyEvents)
    }

    throw new Error(`Unexpected fake API request: ${url}`)
  })
}

function CanvasSurface() {
  const { canvasId = '' } = useParams<{ canvasId: string }>()
  const navigate = useNavigate()
  useCanvasAssistant({
    appId: 'design',
    canvasId,
    ready: true,
  })

  useEffect(() => {
    document.title = `Canvas ${canvasId}`
  }, [canvasId])

  return (
    <>
      <output aria-label="current Canvas">{canvasId}</output>
      <button
        type="button"
        onClick={() => navigate('/apps/design/canvases/about')}
      >
        Switch Canvas
      </button>
      <CanvasAssistantTools appId="design" canvasId={canvasId} />
      <AssistantThread />
    </>
  )
}

function renderCanvas() {
  return render(
    <MemoryRouter initialEntries={['/apps/design/canvases/home']}>
      <AssistantProvider>
        <Routes>
          <Route
            path="/apps/:id/canvases/:canvasId"
            element={<CanvasSurface />}
          />
        </Routes>
      </AssistantProvider>
    </MemoryRouter>,
  )
}

async function sendPrompt(prompt = 'Build this Canvas') {
  const composer = await screen.findByPlaceholderText(
    'Describe what you need…',
  )
  fireEvent.change(composer, { target: { value: prompt } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

function hasInstalledResult(request: CanvasChatRequest): boolean {
  return request.messages.some((message) =>
    message.content.some(
      (part) =>
        part.type === 'tool-call' &&
        part.toolName === 'recommend_canvas_layout' &&
        typeof part.result === 'object' &&
        part.result !== null &&
        'status' in part.result &&
        part.result.status === 'installed',
    ),
  )
}

describe('Canvas Assistant browser integration', () => {
  let api: FakeCanvasApi

  beforeEach(() => {
    localStorage.clear()
    writeAiConfig({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'test-model',
    })
    api = new FakeCanvasApi()
    vi.stubGlobal('fetch', api.fetch)
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps disk unchanged until Apply changes is clicked', async () => {
    api.enqueue(
      () => [proposalEvent()],
      () => [runResult([{ type: 'text', text: 'Canvas applied.' }])],
    )
    const before = api.disk.canvasSource
    renderCanvas()

    await sendPrompt()
    await screen.findByRole('button', { name: 'Apply changes' })

    expect(api.disk.canvasSource).toBe(before)
    expect(api.applyRequests).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }))

    expect(
      await screen.findAllByText('Applied', { selector: '[role="status"]' }),
    ).not.toHaveLength(0)
    expect(api.disk.canvasSource).toBe(api.proposedSource)
    expect(api.applyRequests).toEqual([
      '/__design_ai/canvas/proposals/proposal-1/apply',
    ])
  })

  it('shows a Layout card before a proposal for an uninstalled Layout', async () => {
    api.enqueue(() => [layoutEvent()])
    renderCanvas()

    await sendPrompt()

    expect(
      await screen.findByRole('article', {
        name: 'Recommended Layout: Centered',
      }),
    ).toBeTruthy()
    expect(screen.getByText('Not installed')).toBeTruthy()
    expect(
      screen.queryByRole('article', {
        name: 'Canvas change proposal',
      }),
    ).toBeNull()
    expect(api.disk.layouts).toEqual(['sidebar-shell'])
  })

  it('resumes the run after installation and renders a proposal card', async () => {
    api.enqueue(
      () => [layoutEvent()],
      (request) => {
        expect(hasInstalledResult(request)).toBe(true)
        return [proposalEvent()]
      },
    )
    renderCanvas()
    await sendPrompt()
    await screen.findByRole('button', { name: 'Install Layout' })

    fireEvent.click(screen.getByRole('button', { name: 'Install Layout' }))

    expect(
      await screen.findByRole('article', {
        name: 'Canvas change proposal',
      }),
    ).toBeTruthy()
    expect(api.disk.layouts).toEqual(['sidebar-shell', 'centered'])
    expect(api.chatRequests).toHaveLength(2)
    expect(hasInstalledResult(api.chatRequests[1]!)).toBe(true)
  })

  it('shows applying, validating, repaired, and applied states in English', async () => {
    api.enqueue(
      () => [proposalEvent()],
      () => [runResult([{ type: 'text', text: 'Canvas applied.' }])],
    )
    renderCanvas()
    await sendPrompt()
    await screen.findByRole('button', { name: 'Apply changes' })

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }))

    expect(screen.getByText('Applying')).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByText('Validating changes')).toBeTruthy()
      expect(screen.getByText('Repairing · attempt 1')).toBeTruthy()
      expect(screen.getByText('Repaired · attempt 1')).toBeTruthy()
      expect(
        screen.getAllByText('Applied', { selector: '[role="status"]' }),
      ).not.toHaveLength(0)
    })
  })

  it('switching Canvas invalidates the old adapter and tool cards', async () => {
    api.enqueue(
      () => [proposalEvent('home-proposal')],
      () => [runResult([{ type: 'text', text: 'About Canvas response' }])],
    )
    renderCanvas()
    await sendPrompt()
    await screen.findByRole('article', {
      name: 'Canvas change proposal',
    })
    expect(api.chatRequests[0]?.canvasId).toBe('home')

    fireEvent.click(screen.getByRole('button', { name: 'Switch Canvas' }))

    await waitFor(() => {
      expect(screen.getByLabelText('current Canvas').textContent).toBe('about')
      expect(
        screen.queryByRole('article', {
          name: 'Canvas change proposal',
        }),
      ).toBeNull()
    })
    await sendPrompt('Build the About Canvas')

    expect(await screen.findByText('About Canvas response')).toBeTruthy()
    expect(api.chatRequests.at(-1)?.canvasId).toBe('about')
    expect(api.chatRequests.at(-1)?.messages.some((message) =>
      message.content.some(
        (part) =>
          part.type === 'tool-call' &&
          part.toolName === 'propose_canvas_change',
      ),
    )).toBe(false)
  })
})
