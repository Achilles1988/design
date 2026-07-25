import { describe, expect, it } from 'vitest'
import {
  CanvasApplyEventSchema,
  CanvasApplyRequestSchema,
  CanvasChatRequestSchema,
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
