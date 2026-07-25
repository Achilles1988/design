// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  text: '',
  attachments: [] as Array<{
    id: string
    type: 'image'
    name: string
    contentType: string
    file: File
  }>,
  listeners: new Set<() => void>(),
  send: vi.fn(),
  addAttachment: vi.fn(),
  removeAttachment: vi.fn(),
  capture: vi.fn(),
  registerOrigin: vi.fn(),
  owner: { pageKey: '/apps/design/canvases/home', generation: 1 },
}))

vi.mock('@assistant-ui/react', () => ({
  useComposerRuntime: () => ({
    getState: () => ({
      text: harness.text,
      attachments: harness.attachments,
    }),
    subscribe: (listener: () => void) => {
      harness.listeners.add(listener)
      return () => harness.listeners.delete(listener)
    },
    send: harness.send,
    addAttachment: harness.addAttachment,
    getAttachmentByIndex: (index: number) => ({
      remove: async () => {
        const [removed] = harness.attachments.splice(index, 1)
        if (removed) harness.removeAttachment(removed.id)
      },
    }),
  }),
}))

vi.mock('@/lib/canvasAssistantApi', () => ({
  captureCanvasReferences: harness.capture,
}))

vi.mock('./pageSession', () => ({
  useAssistantPageSession: () => ({
    owner: harness.owner,
  }),
}))

vi.mock('./visualAttachmentAdapter', () => ({
  registerVisualFileOrigin: harness.registerOrigin,
}))

import {
  MAX_URL_REFERENCE_ERROR,
  extractHttpUrls,
  useCanvasReferences,
} from './useCanvasReferences'

const PNG_BASE64 = 'iVBORw0KGgo='

function updateText(text: string): void {
  harness.text = text
  for (const listener of harness.listeners) listener()
}

function successfulCapture(urls: readonly string[]) {
  return {
    results: urls.map((url) => ({
      url,
      finalUrl: url,
      ok: true,
      mimeType: 'image/png' as const,
      base64: PNG_BASE64,
    })),
  }
}

beforeEach(() => {
  harness.text = ''
  harness.attachments = []
  harness.listeners.clear()
  harness.owner = {
    pageKey: '/apps/design/canvases/home',
    generation: 1,
  }
  harness.send.mockReset()
  harness.capture.mockReset()
  harness.registerOrigin.mockReset()
  harness.addAttachment.mockReset()
  harness.removeAttachment.mockReset()
  harness.addAttachment.mockImplementation(async (file: File) => {
    harness.attachments.push({
      id: `attachment-${harness.attachments.length + 1}`,
      type: 'image',
      name: file.name,
      contentType: file.type,
      file,
    })
  })
})

describe('extractHttpUrls', () => {
  it('extracts distinct HTTP and HTTPS URLs in text order', () => {
    expect(extractHttpUrls(
      'See https://one.example/a then http://two.example and https://one.example/a',
    )).toEqual([
      'https://one.example/a',
      'http://two.example',
    ])
  })

  it('ignores punctuation after a URL', () => {
    expect(extractHttpUrls(
      'Compare https://one.example/path, (http://two.example/view).',
    )).toEqual([
      'https://one.example/path',
      'http://two.example/view',
    ])
  })
})

describe('useCanvasReferences', () => {
  it('caps references at four and reports an English error', async () => {
    updateText(Array.from(
      { length: 5 },
      (_, index) => `https://example.com/${index}`,
    ).join(' '))
    const { result } = renderHook(useCanvasReferences)

    await expect(result.current.prepareAndMaybeSend()).resolves.toBe('blocked')

    expect(result.current.references).toHaveLength(4)
    expect(result.current.referenceError).toBe(MAX_URL_REFERENCE_ERROR)
    expect(MAX_URL_REFERENCE_ERROR).toBe(
      'You can include up to 4 URL references per message.',
    )
    expect(harness.capture).not.toHaveBeenCalled()
    expect(harness.send).not.toHaveBeenCalled()
  })

  it('first Send captures URLs and stops for visual review', async () => {
    updateText('Use https://example.com/design')
    harness.capture.mockResolvedValue(
      successfulCapture(['https://example.com/design']),
    )
    const { result } = renderHook(useCanvasReferences)

    await act(async () => {
      await expect(result.current.prepareAndMaybeSend()).resolves.toBe('review')
    })

    expect(harness.capture).toHaveBeenCalledWith(
      ['https://example.com/design'],
      expect.any(AbortSignal),
    )
    expect(harness.send).not.toHaveBeenCalled()
    expect(harness.registerOrigin).toHaveBeenCalledWith(
      expect.any(File),
      {
        origin: 'url-capture',
        sourceUrl: 'https://example.com/design',
      },
    )
    expect(result.current.references).toEqual([
      expect.objectContaining({
        url: 'https://example.com/design',
        state: 'ready',
        attachmentId: 'attachment-1',
      }),
    ])
  })

  it('second Send submits when every URL is ready or dismissed', async () => {
    updateText('Use https://example.com/design')
    harness.capture.mockResolvedValue(
      successfulCapture(['https://example.com/design']),
    )
    const { result } = renderHook(useCanvasReferences)

    await act(() => result.current.prepareAndMaybeSend())
    await act(async () => {
      await expect(result.current.prepareAndMaybeSend()).resolves.toBe('sent')
    })

    expect(harness.capture).toHaveBeenCalledTimes(1)
    expect(harness.send).toHaveBeenCalledTimes(1)
  })

  it('a failed capture blocks generation', async () => {
    updateText('Use https://example.com/private')
    harness.capture.mockResolvedValue({
      results: [{
        url: 'https://example.com/private',
        ok: false,
        error: 'server detail',
      }],
    })
    const { result } = renderHook(useCanvasReferences)

    await act(() => result.current.prepareAndMaybeSend())
    await act(async () => {
      await expect(result.current.prepareAndMaybeSend()).resolves.toBe('blocked')
    })

    expect(result.current.references[0]).toEqual({
      url: 'https://example.com/private',
      state: 'failed',
      error: 'This page could not be captured. Paste a screenshot or remove this reference.',
    })
    expect(harness.send).not.toHaveBeenCalled()
  })

  it('dismissed failed capture allows a manually pasted screenshot to send', async () => {
    const url = 'https://example.com/private'
    updateText(`Use ${url}`)
    harness.capture.mockResolvedValue({
      results: [{ url, ok: false, error: 'server detail' }],
    })
    const { result } = renderHook(useCanvasReferences)

    await act(() => result.current.prepareAndMaybeSend())
    const pasted = new File(['manual'], 'manual.png', { type: 'image/png' })
    harness.attachments.push({
      id: 'manual',
      type: 'image',
      name: pasted.name,
      contentType: pasted.type,
      file: pasted,
    })
    act(() => result.current.dismiss(url))
    await act(async () => {
      await expect(result.current.prepareAndMaybeSend()).resolves.toBe('sent')
    })

    expect(result.current.references[0]?.state).toBe('dismissed')
    expect(harness.text).toContain(url)
    expect(harness.send).toHaveBeenCalledTimes(1)
  })

  it('dismiss keeps URL text and removes its captured attachment before send', async () => {
    const url = 'https://example.com/design'
    updateText(`Use ${url}`)
    harness.capture.mockResolvedValue(successfulCapture([url]))
    const { result } = renderHook(useCanvasReferences)
    await act(() => result.current.prepareAndMaybeSend())

    act(() => result.current.dismiss(url))
    await act(() => result.current.prepareAndMaybeSend())

    expect(harness.text).toContain(url)
    expect(harness.removeAttachment).toHaveBeenCalledWith('attachment-1')
    expect(harness.attachments).toEqual([])
    expect(harness.send).toHaveBeenCalledTimes(1)
  })

  it('dismisses one pending capture without cancelling its sibling', async () => {
    const dismissedUrl = 'https://dismiss.example'
    const siblingUrl = 'https://keep.example'
    updateText(`Compare ${dismissedUrl} with ${siblingUrl}`)
    let resolveCapture!: (
      value: ReturnType<typeof successfulCapture>,
    ) => void
    harness.capture.mockImplementation(() => new Promise((resolve) => {
      resolveCapture = resolve
    }))
    const { result } = renderHook(useCanvasReferences)
    let pending!: Promise<'sent' | 'review' | 'blocked'>
    act(() => {
      pending = result.current.prepareAndMaybeSend()
    })
    await waitFor(() => {
      expect(result.current.references.every(
        (reference) => reference.state === 'capturing',
      )).toBe(true)
    })

    act(() => result.current.dismiss(dismissedUrl))
    await act(async () => {
      resolveCapture(successfulCapture([dismissedUrl, siblingUrl]))
      await expect(pending).resolves.toBe('review')
    })

    expect(result.current.references).toEqual([
      { url: dismissedUrl, state: 'dismissed' },
      {
        url: siblingUrl,
        state: 'ready',
        attachmentId: 'attachment-1',
      },
    ])
    expect(harness.addAttachment).toHaveBeenCalledTimes(1)
    expect(harness.registerOrigin).toHaveBeenCalledWith(
      expect.any(File),
      { origin: 'url-capture', sourceUrl: siblingUrl },
    )
    expect(harness.attachments.map((attachment) => attachment.id)).toEqual([
      'attachment-1',
    ])
  })

  it('removes a capture attachment that finishes after dismissal', async () => {
    const url = 'https://dismiss.example'
    updateText(`Use ${url}`)
    harness.capture.mockResolvedValue(successfulCapture([url]))
    let finishAttachment!: () => void
    harness.addAttachment.mockImplementation((file: File) =>
      new Promise<void>((resolve) => {
        finishAttachment = () => {
          harness.attachments.push({
            id: 'dismissed-late',
            type: 'image',
            name: file.name,
            contentType: file.type,
            file,
          })
          resolve()
        }
      }))
    const { result } = renderHook(useCanvasReferences)
    let pending!: Promise<'sent' | 'review' | 'blocked'>
    act(() => {
      pending = result.current.prepareAndMaybeSend()
    })
    await waitFor(() => {
      expect(harness.addAttachment).toHaveBeenCalledTimes(1)
    })

    act(() => result.current.dismiss(url))
    await act(async () => {
      finishAttachment()
      await expect(pending).resolves.toBe('review')
    })

    expect(result.current.references).toEqual([
      { url, state: 'dismissed' },
    ])
    expect(harness.removeAttachment).toHaveBeenCalledWith('dismissed-late')
    expect(harness.attachments).toEqual([])
  })

  it('changing the URL text removes stale capture draft state', async () => {
    updateText('Use https://old.example')
    harness.capture.mockResolvedValue(
      successfulCapture(['https://old.example']),
    )
    const { result } = renderHook(useCanvasReferences)
    await act(() => result.current.prepareAndMaybeSend())

    act(() => updateText('Use https://new.example'))

    await waitFor(() => {
      expect(result.current.references).toEqual([{
        url: 'https://new.example',
        state: 'uncaptured',
      }])
    })
  })

  it('page navigation aborts capture and clears draft state', async () => {
    updateText('Use https://slow.example')
    let resolveCapture!: (
      value: ReturnType<typeof successfulCapture>,
    ) => void
    harness.capture.mockImplementation((
      _urls: string[],
      signal: AbortSignal,
    ) => new Promise((resolve) => {
      expect(signal.aborted).toBe(false)
      resolveCapture = resolve
    }))
    const { result, rerender } = renderHook(useCanvasReferences)
    let pending!: Promise<'sent' | 'review' | 'blocked'>

    act(() => {
      pending = result.current.prepareAndMaybeSend()
    })
    await waitFor(() => {
      expect(result.current.references[0]?.state).toBe('capturing')
    })
    const signal = harness.capture.mock.calls[0]![1] as AbortSignal

    harness.owner = {
      pageKey: '/apps/design/canvases/other',
      generation: 2,
    }
    rerender()

    expect(signal.aborted).toBe(true)
    expect(result.current.references).toEqual([])
    resolveCapture(successfulCapture(['https://slow.example']))
    await expect(pending).resolves.toBe('blocked')
    expect(harness.addAttachment).not.toHaveBeenCalled()
    expect(result.current.references).toEqual([])
  })

  it('removes an attachment that finishes after page navigation', async () => {
    const url = 'https://slow.example'
    updateText(`Use ${url}`)
    harness.capture.mockResolvedValue(successfulCapture([url]))
    let finishAttachment!: () => void
    harness.addAttachment.mockImplementation((file: File) =>
      new Promise<void>((resolve) => {
        finishAttachment = () => {
          harness.attachments.push({
            id: 'late-attachment',
            type: 'image',
            name: file.name,
            contentType: file.type,
            file,
          })
          resolve()
        }
      }))
    const { result, rerender } = renderHook(useCanvasReferences)
    let pending!: Promise<'sent' | 'review' | 'blocked'>
    act(() => {
      pending = result.current.prepareAndMaybeSend()
    })
    await waitFor(() => {
      expect(harness.addAttachment).toHaveBeenCalledTimes(1)
    })

    harness.owner = {
      pageKey: '/apps/design/canvases/other',
      generation: 2,
    }
    rerender()
    finishAttachment()

    await expect(pending).resolves.toBe('blocked')
    await waitFor(() => {
      expect(harness.removeAttachment).toHaveBeenCalledWith('late-attachment')
    })
    expect(harness.attachments).toEqual([])
    expect(result.current.references).toEqual([])
  })
})
