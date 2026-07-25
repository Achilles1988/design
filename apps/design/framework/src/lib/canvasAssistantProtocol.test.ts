import { describe, expect, it } from 'vitest'
import {
  CanvasApplyEventSchema,
  CanvasApplyRequestSchema,
  CanvasChatRequestSchema,
  CanvasPreviewSessionRequestSchema,
  CanvasPreviewSessionResponseSchema,
  CanvasProposalCardArgsSchema,
} from './canvasAssistantProtocol'

describe('Canvas Assistant protocol', () => {
  it('accepts a bounded text chat request', () => {
    expect(
      CanvasChatRequestSchema.parse({
        appId: 'design',
        canvasId: 'home',
        aiConfig: {
          provider: 'openai',
          apiKey: 'secret',
          model: 'gpt-test',
        },
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Create it' }] },
        ],
      }).messages,
    ).toHaveLength(1)
  })

  it('accepts only persisted visual attachment references', () => {
    const input = {
      appId: 'design',
      canvasId: 'home',
      aiConfig: {
        provider: 'openai',
        apiKey: 'secret',
        model: 'gpt-test',
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: 'wn-attachment:image-1' },
          ],
        },
      ],
    }

    expect(CanvasChatRequestSchema.parse(input).messages[0]?.content)
      .toEqual([
        { type: 'image', image: 'wn-attachment:image-1' },
      ])
    expect(() =>
      CanvasChatRequestSchema.parse({
        ...input,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', image: 'data:image/png;base64,AAAA' },
            ],
          },
        ],
      }),
    ).toThrow()
  })

  it('rejects more than forty stable messages', () => {
    expect(() =>
      CanvasChatRequestSchema.parse({
        appId: 'design',
        canvasId: 'home',
        aiConfig: {
          provider: 'openai',
          apiKey: 'secret',
          model: 'gpt-test',
        },
        messages: Array.from({ length: 41 }, () => ({
          role: 'user',
          content: [{ type: 'text', text: 'x' }],
        })),
      }),
    ).toThrow()
  })

  it('includes read-only candidate source in proposal card args', () => {
    const parsed = CanvasProposalCardArgsSchema.parse({
      proposalId: 'proposal-1',
      mode: 'update',
      summary: ['Add account menu'],
      styleId: 'dashboard',
      layout: { kind: 'installed', id: 'sidebar-shell', reason: 'Fits' },
      changedFiles: ['canvases/Home.tsx'],
      reusedComponents: [],
      newSharedComponents: [],
      preserved: ['Existing navigation'],
      validationChecks: ['Vite transform'],
      candidateFiles: [
        {
          path: 'canvases/Home.tsx',
          source: 'export default function Home() { return null }',
        },
      ],
      expiresAt: '2026-07-24T12:30:00.000Z',
    })
    expect(parsed.candidateFiles).toEqual([
      {
        path: 'canvases/Home.tsx',
        source: 'export default function Home() { return null }',
      },
    ])
    expect(parsed).not.toHaveProperty('files')
  })

  it('requires AI config for repair during apply', () => {
    expect(() => CanvasApplyRequestSchema.parse({})).toThrow()
  })

  it('accepts only direct TSX preview-session targets and capability paths', () => {
    expect(
      CanvasPreviewSessionRequestSchema.parse({
        appId: 'design',
        canvasId: 'home',
      }),
    ).toEqual({
      appId: 'design',
      canvasId: 'home',
    })
    expect(() =>
      CanvasPreviewSessionRequestSchema.parse({
        appId: 'design',
        canvasId: 'home',
        componentFile: 'Other.tsx',
      }),
    ).toThrow()
    expect(
      CanvasPreviewSessionResponseSchema.parse({
        moduleBase:
          '/__design_canvas_preview/00000000-0000-4000-8000-000000000001/',
        componentFile: 'Home.tsx',
        expiresAt: '2026-07-25T12:30:00.000Z',
      }),
    ).toEqual({
      moduleBase:
        '/__design_canvas_preview/00000000-0000-4000-8000-000000000001/',
      componentFile: 'Home.tsx',
      expiresAt: '2026-07-25T12:30:00.000Z',
    })
  })

  it('represents an incomplete rollback truthfully', () => {
    expect(
      CanvasApplyEventSchema.parse({
        type: 'complete',
        result: {
          ok: false,
          proposalId: 'proposal-1',
          error:
            'Canvas proposal rollback was incomplete. Some files may need manual inspection.',
          rolledBack: false,
        },
      }),
    ).toEqual({
      type: 'complete',
      result: {
        ok: false,
        proposalId: 'proposal-1',
        error:
          'Canvas proposal rollback was incomplete. Some files may need manual inspection.',
        rolledBack: false,
      },
    })
  })
})
