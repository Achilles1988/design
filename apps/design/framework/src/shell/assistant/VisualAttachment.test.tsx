// @vitest-environment jsdom
import type { Attachment } from '@assistant-ui/react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VisualAttachmentRecord } from './visualAttachmentStore'

const storeGet = vi.hoisted(() => vi.fn())

vi.mock('@assistant-ui/react', () => ({
  AttachmentPrimitive: {
    Root: (props: { children: unknown }) => <div>{props.children as never}</div>,
    Name: () => <>clipboard.png</>,
    Remove: (props: Record<string, unknown>) => <button {...props} />,
  },
}))

vi.mock('./visualAttachmentStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./visualAttachmentStore')>()
  return {
    ...actual,
    getVisualAttachmentStore: async () => ({ get: storeGet }),
  }
})

import {
  RestoredVisualAttachment,
  VisualAttachment,
} from './VisualAttachment'

function record(id: string): VisualAttachmentRecord {
  return {
    id,
    pageKey: '/apps/design/canvases/home',
    blob: new Blob(['image'], { type: 'image/png' }),
    mimeType: 'image/png',
    width: 64,
    height: 64,
    origin: 'clipboard',
    createdAt: '2026-07-25T00:00:00.000Z',
  }
}

function attachment(id: string): Attachment {
  return {
    id,
    type: 'image',
    name: 'clipboard.png',
    contentType: 'image/png',
    file: new File(['image'], 'clipboard.png', { type: 'image/png' }),
    status: { type: 'requires-action', reason: 'composer-send' },
  }
}

beforeEach(() => {
  storeGet.mockReset()
  storeGet.mockImplementation(async (id: string) => record(id))
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((blob: Blob) => `blob:${blob.size}`),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('VisualAttachment', () => {
  it('renders an English thumbnail label and Remove button', async () => {
    render(<VisualAttachment attachment={attachment('image-1')} />)

    expect(await screen.findByRole('img', {
      name: 'Preview of clipboard.png',
    })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove image' })).toBeTruthy()
  })

  it('revokes object URLs when an attachment is removed and on unmount', async () => {
    const { rerender, unmount } = render(
      <VisualAttachment attachment={attachment('image-1')} />,
    )
    await screen.findByRole('img')

    rerender(<VisualAttachment attachment={attachment('image-2')} />)
    await waitFor(() => {
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:5')
      expect(storeGet).toHaveBeenCalledWith('image-2')
    })

    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it('renders restored wn-attachment message images', async () => {
    render(<RestoredVisualAttachment image="wn-attachment:image-1" />)

    const restoredImage = await screen.findByRole('img', {
      name: 'Attached image',
    })
    expect(restoredImage.getAttribute('src')).toBe('blob:5')
  })
})
