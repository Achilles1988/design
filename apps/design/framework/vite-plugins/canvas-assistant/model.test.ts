import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { CanvasChatRequest } from '../../src/lib/canvasAssistantProtocol'
import type { CanvasAuthoringContext } from './context'
import { createCanvasModelRunner } from './model'

const CANDIDATE_SOURCE =
  'export default function Home() { return <main>Candidate</main> }'

function context(): CanvasAuthoringContext {
  return {
    app: {
      id: 'design',
      name: 'Design',
      style: 'dashboard',
      layouts: ['sidebar-shell'],
    },
    appConfigHash: 'app-config-hash',
    canvas: {
      id: 'home',
      name: 'Home',
      component: 'Home.tsx',
    },
    style: {
      id: 'dashboard',
      relativePath: 'dashboard/DESIGN.md',
      source: '# Dashboard',
      hash: 'style-contract-hash',
    },
    installedLayouts: [
      {
        id: 'sidebar-shell',
        relativePath: 'sidebar-shell/LAYOUT.md',
        source: '# Sidebar',
        hash: 'layout-contract-hash',
      },
    ],
    layoutIndex: [
      {
        id: 'sidebar-shell',
        title: 'Sidebar shell',
        summary: 'Persistent sidebar',
        tags: ['shell'],
        origin: 'core',
        hasPreview: true,
      },
      {
        id: 'split-workspace',
        title: 'Split workspace',
        summary: 'Two working panes',
        tags: ['workspace'],
        origin: 'core',
        hasPreview: true,
      },
    ],
    files: [
      {
        relativePath: 'canvases/Home.tsx',
        absolutePath: '/project/design/canvases/Home.tsx',
        source:
          'export default function Home() { return <main>Original</main> }',
        hash: 'home-hash',
        permission: 'write-existing',
      },
    ],
    componentsDir: path.resolve('/project/design/components'),
  }
}

function chatRequest(
  messages: CanvasChatRequest['messages'] = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Build the page' }],
    },
  ],
): CanvasChatRequest {
  return {
    appId: 'design',
    canvasId: 'home',
    aiConfig: {
      provider: 'openai',
      apiKey: 'secret-key',
      model: 'test-model',
    },
    messages,
  }
}

function fakeStream(
  parts: Array<Record<string, unknown>>,
  onYield?: (part: Record<string, unknown>) => void,
) {
  return {
    fullStream: (async function* () {
      for (const part of parts) {
        onYield?.(part)
        yield part
      }
    })(),
  }
}

function proposalArgs() {
  return {
    mode: 'update' as const,
    summary: ['Update the current Canvas'],
    layout: {
      kind: 'installed' as const,
      id: 'sidebar-shell',
      reason: 'It fits',
    },
    files: [
      {
        path: 'canvases/Home.tsx',
        source: CANDIDATE_SOURCE,
      },
    ],
    reusedComponents: [],
    newSharedComponents: [],
    preserved: ['Navigation'],
    validationChecks: ['Vite transform'],
  }
}

function proposalCard() {
  return {
    proposalId: 'proposal-1',
    mode: 'update' as const,
    summary: ['Update the current Canvas'],
    styleId: 'dashboard',
    layout: {
      kind: 'installed' as const,
      id: 'sidebar-shell',
      reason: 'It fits',
    },
    changedFiles: ['canvases/Home.tsx'],
    reusedComponents: [],
    newSharedComponents: [],
    preserved: ['Navigation'],
    validationChecks: ['Vite transform'],
    candidateFiles: [
      {
        path: 'canvases/Home.tsx',
        source: CANDIDATE_SOURCE,
      },
    ],
    expiresAt: '2026-07-24T12:30:00.000Z',
  }
}

async function collect(
  runner: ReturnType<typeof createCanvasModelRunner>,
  request = chatRequest(),
) {
  const events = []
  for await (const event of runner.run({
    request,
    context: context(),
    abortSignal: new AbortController().signal,
  })) {
    events.push(event)
  }
  return events
}

describe('createCanvasModelRunner', () => {
  it('streams normal assistant text', async () => {
    const runner = createCanvasModelRunner({
      streamTextImpl: () =>
        fakeStream([
          { type: 'text-delta', textDelta: 'Hel' },
          { type: 'text-delta', textDelta: 'lo' },
        ]),
      createModelImpl: () => 'model',
      stageProposal: vi.fn(),
    })

    const events = await collect(runner)

    expect(events).toEqual([
      {
        type: 'run-result',
        value: { content: [{ type: 'text', text: 'Hel' }] },
      },
      {
        type: 'run-result',
        value: { content: [{ type: 'text', text: 'Hello' }] },
      },
    ])
  })

  it('validates and sanitizes recommend_canvas_layout args', async () => {
    let sdkTools: Record<
      string,
      { execute?: unknown; parameters?: unknown }
    > = {}
    const runner = createCanvasModelRunner({
      streamTextImpl: (options) => {
        sdkTools = options.tools as typeof sdkTools
        return fakeStream([
          {
            type: 'tool-call',
            toolCallId: 'layout-1',
            toolName: 'recommend_canvas_layout',
            args: {
              layoutId: 'split-workspace',
              reason: 'It matches the requested comparison.',
              title: 'Forged title',
              previewUrl: 'https://attacker.invalid',
            },
          },
        ])
      },
      createModelImpl: () => 'model',
      stageProposal: vi.fn(),
    })

    const events = await collect(runner)
    const result = events.at(-1)

    expect(sdkTools.recommend_canvas_layout.execute).toBeUndefined()
    expect(sdkTools.propose_canvas_change.execute).toBeUndefined()
    expect(result).toEqual({
      type: 'run-result',
      value: {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'layout-1',
            toolName: 'recommend_canvas_layout',
            args: {
              layoutId: 'split-workspace',
              title: 'Split workspace',
              summary: 'Two working panes',
              reason: 'It matches the requested comparison.',
              previewUrl:
                '/assets/layoutmd/split-workspace/preview.html',
            },
            argsText: JSON.stringify({
              layoutId: 'split-workspace',
              title: 'Split workspace',
              summary: 'Two working panes',
              reason: 'It matches the requested comparison.',
              previewUrl:
                '/assets/layoutmd/split-workspace/preview.html',
            }),
          },
        ],
        status: {
          type: 'requires-action',
          reason: 'tool-calls',
        },
        metadata: { steps: [{}] },
      },
    })
  })

  it.each(['missing-layout', 'sidebar-shell'])(
    'rejects unavailable or installed Layout %s',
    async (layoutId) => {
      const runner = createCanvasModelRunner({
        streamTextImpl: () =>
          fakeStream([
            {
              type: 'tool-call',
              toolCallId: 'layout-1',
              toolName: 'recommend_canvas_layout',
              args: { layoutId, reason: 'Try it' },
            },
          ]),
        createModelImpl: () => 'model',
        stageProposal: vi.fn(),
      })

      await expect(collect(runner)).rejects.toThrow(
        'Layout recommendation is not available.',
      )
    },
  )

  it('stages propose_canvas_change files and streams only card args', async () => {
    const stageProposal = vi.fn(() => proposalCard())
    const raw = proposalArgs()
    const runner = createCanvasModelRunner({
      streamTextImpl: () =>
        fakeStream([
          {
            type: 'tool-call',
            toolCallId: 'proposal-call-1',
            toolName: 'propose_canvas_change',
            args: raw,
          },
        ]),
      createModelImpl: () => 'model',
      stageProposal,
    })

    const events = await collect(runner)

    expect(stageProposal).toHaveBeenCalledWith(
      context(),
      raw,
      'Build the page',
    )
    expect(events.at(-1)).toMatchObject({
      type: 'run-result',
      value: {
        content: [
          {
            type: 'tool-call',
            toolName: 'propose_canvas_change',
            args: proposalCard(),
          },
        ],
      },
    })
  })

  it('stages only the latest sanitized user intent', async () => {
    const stageProposal = vi.fn(() => proposalCard())
    const runner = createCanvasModelRunner({
      streamTextImpl: () =>
        fakeStream([
          {
            type: 'tool-call',
            toolCallId: 'proposal-call-1',
            toolName: 'propose_canvas_change',
            args: proposalArgs(),
          },
        ]),
      createModelImpl: () => 'model',
      stageProposal,
    })
    const request = chatRequest([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Unrelated earlier request' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Earlier response' }],
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'Build the analytics Canvas. OPENAI_API_KEY=sk-super-secret',
          },
        ],
      },
    ])

    await collect(runner, request)

    const intent = stageProposal.mock.calls[0]?.[2]
    expect(intent).toContain('Build the analytics Canvas.')
    expect(intent).not.toContain('Unrelated earlier request')
    expect(intent).not.toContain('sk-super-secret')
    expect(JSON.stringify(stageProposal.mock.calls)).not.toContain(
      request.aiConfig.apiKey,
    )
  })

  it.each([
    [
      'recommend_canvas_layout',
      {
        layoutId: 'split-workspace',
        reason: 'It fits',
      },
    ],
    ['propose_canvas_change', proposalArgs()],
  ])('marks either human tool call as requires-action', async (toolName, args) => {
    const yielded: string[] = []
    const runner = createCanvasModelRunner({
      streamTextImpl: () =>
        fakeStream(
          [
            {
              type: 'tool-call',
              toolCallId: 'human-1',
              toolName,
              args,
            },
            { type: 'text-delta', textDelta: 'must not continue' },
          ],
          (part) => yielded.push(String(part.type)),
        ),
      createModelImpl: () => 'model',
      stageProposal: vi.fn(() => proposalCard()),
    })

    const events = await collect(runner)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'run-result',
      value: {
        status: {
          type: 'requires-action',
          reason: 'tool-calls',
        },
      },
    })
    expect(yielded).toEqual(['tool-call'])
  })

  it('places the staged read-only candidate review in the NDJSON event', async () => {
    const runner = createCanvasModelRunner({
      streamTextImpl: () =>
        fakeStream([
          {
            type: 'tool-call',
            toolCallId: 'proposal-call-1',
            toolName: 'propose_canvas_change',
            args: proposalArgs(),
          },
        ]),
      createModelImpl: () => 'model',
      stageProposal: vi.fn(() => proposalCard()),
    })

    const events = await collect(runner)
    const serialized = events.map(JSON.stringify).join('\n')

    expect(serialized).toContain('proposal-')
    expect(serialized).toContain(CANDIDATE_SOURCE)
  })

  it('converts a prior human-tool result back into AI SDK tool messages', async () => {
    let providerMessages: unknown
    const runner = createCanvasModelRunner({
      streamTextImpl: (options) => {
        providerMessages = options.messages
        return fakeStream([])
      },
      createModelImpl: () => 'model',
      stageProposal: vi.fn(),
    })
    const messages: CanvasChatRequest['messages'] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Use the split layout' }],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'layout-1',
            toolName: 'recommend_canvas_layout',
            args: {
              layoutId: 'split-workspace',
              title: 'Split workspace',
              summary: 'Two working panes',
              reason: 'It fits',
              previewUrl:
                '/assets/layoutmd/split-workspace/preview.html',
            },
            result: {
              status: 'installed',
              layoutId: 'split-workspace',
            },
          },
        ],
      },
    ]

    await collect(runner, chatRequest(messages))

    expect(providerMessages).toEqual([
      { role: 'user', content: 'Use the split layout' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'layout-1',
            toolName: 'recommend_canvas_layout',
            args: {
              layoutId: 'split-workspace',
              title: 'Split workspace',
              summary: 'Two working panes',
              reason: 'It fits',
              previewUrl:
                '/assets/layoutmd/split-workspace/preview.html',
            },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'layout-1',
            toolName: 'recommend_canvas_layout',
            result: {
              status: 'installed',
              layoutId: 'split-workspace',
            },
            isError: false,
          },
        ],
      },
    ])
  })
})
