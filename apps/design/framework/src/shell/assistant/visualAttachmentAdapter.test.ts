// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_VISUAL_BYTES,
  VISUAL_MIME_TYPES,
  createVisualAttachmentAdapter,
  registerVisualFileOrigin,
} from './visualAttachmentAdapter'
import type { VisualAttachmentRecord, VisualAttachmentStore } from './visualAttachmentStore'

function createStore() {
  const records = new Map<string, VisualAttachmentRecord>()
  const store: VisualAttachmentStore = {
    put: vi.fn(async (record) => {
      records.set(record.id, record)
    }),
    get: vi.fn(async (id) => records.get(id) ?? null),
    delete: vi.fn(async (id) => {
      records.delete(id)
    }),
    deletePage: vi.fn(async () => {}),
    reconcilePage: vi.fn(async () => {}),
  }
  return { records, store }
}

function imageFile(type = 'image/png', size = 3): File {
  return new File([new Uint8Array(size)], 'clipboard.png', { type })
}

describe('createVisualAttachmentAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts only image/png,image/jpeg,image/webp', () => {
    expect(VISUAL_MIME_TYPES).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
    ])
    expect(createVisualAttachmentAdapter({
      getPageKey: () => '/canvas',
      store: createStore().store,
      originForFile: () => ({ origin: 'clipboard' }),
    }).accept).toBe('image/png,image/jpeg,image/webp')
  })

  it('rejects one file larger than 10 MiB', async () => {
    const adapter = createVisualAttachmentAdapter({
      getPageKey: () => '/canvas',
      store: createStore().store,
      originForFile: () => ({ origin: 'clipboard' }),
    })

    await expect(adapter.add({
      file: imageFile('image/png', MAX_VISUAL_BYTES + 1),
    })).rejects.toThrow('10 MiB')
  })

  it('reads image dimensions before storing', async () => {
    const { store } = createStore()
    const close = vi.fn()
    const createImageBitmap = vi.fn(async () => ({ width: 640, height: 480, close }))
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    vi.stubGlobal('crypto', { randomUUID: () => 'image-1' })
    const file = imageFile()
    const adapter = createVisualAttachmentAdapter({
      getPageKey: () => '/canvas',
      store,
      originForFile: () => ({ origin: 'clipboard' }),
    })

    await adapter.add({ file })

    expect(createImageBitmap).toHaveBeenCalledWith(file)
    expect(close).toHaveBeenCalledOnce()
    expect(store.put).toHaveBeenCalledWith(expect.objectContaining({
      id: 'image-1',
      width: 640,
      height: 480,
    }))
  })

  it('stores the Blob under the current pageKey', async () => {
    const { store } = createStore()
    vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }))
    vi.stubGlobal('crypto', { randomUUID: () => 'image-1' })
    const file = imageFile()
    registerVisualFileOrigin(file, {
      origin: 'url-capture',
      sourceUrl: 'https://example.com',
    })
    const adapter = createVisualAttachmentAdapter({
      getPageKey: () => '/apps/demo/canvases/home',
      store,
      originForFile: () => ({ origin: 'clipboard' }),
    })

    await adapter.add({ file })

    expect(store.put).toHaveBeenCalledWith(expect.objectContaining({
      pageKey: '/apps/demo/canvases/home',
      blob: file,
      origin: 'url-capture',
      sourceUrl: 'https://example.com',
    }))
  })

  it('rejects paste when the Canvas page key changes during image decoding', async () => {
    const { store } = createStore()
    let pageKey = '/apps/demo/canvases/home'
    let releaseBitmap: (() => void) | undefined
    vi.stubGlobal(
      'createImageBitmap',
      () =>
        new Promise<{ width: number; height: number; close(): void }>((resolve) => {
          releaseBitmap = () => {
            resolve({ width: 1, height: 1, close() {} })
          }
        }),
    )
    vi.stubGlobal('crypto', { randomUUID: () => 'image-1' })
    const adapter = createVisualAttachmentAdapter({
      getPageKey: () => pageKey,
      store,
      originForFile: () => ({ origin: 'clipboard' }),
    })

    const pending = adapter.add({ file: imageFile() })
    pageKey = '/apps/demo/canvases/other'
    releaseBitmap?.()

    await expect(pending).rejects.toThrow(
      'The Canvas changed before this image could be attached.',
    )
    expect(store.put).not.toHaveBeenCalled()
  })

  it('rejects unsupported MIME types from add()', async () => {
    const adapter = createVisualAttachmentAdapter({
      getPageKey: () => '/canvas',
      store: createStore().store,
      originForFile: () => ({ origin: 'clipboard' }),
    })

    await expect(adapter.add({
      file: new File([new Uint8Array(3)], 'x.gif', { type: 'image/gif' }),
    })).rejects.toThrow('Only PNG, JPEG, and WebP images are supported.')
  })

  it('consumes a registered file origin only once', async () => {
    const { store } = createStore()
    vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }))
    vi.stubGlobal('crypto', { randomUUID: vi.fn()
      .mockReturnValueOnce('image-1')
      .mockReturnValueOnce('image-2') })
    const file = imageFile()
    registerVisualFileOrigin(file, {
      origin: 'url-capture',
      sourceUrl: 'https://example.com',
    })
    const adapter = createVisualAttachmentAdapter({
      getPageKey: () => '/canvas',
      store,
      originForFile: () => ({ origin: 'clipboard' }),
    })

    await adapter.add({ file })
    await adapter.add({ file })

    expect(store.put).toHaveBeenNthCalledWith(1, expect.objectContaining({
      origin: 'url-capture',
      sourceUrl: 'https://example.com',
    }))
    expect(store.put).toHaveBeenNthCalledWith(2, expect.objectContaining({
      origin: 'clipboard',
    }))
    expect(vi.mocked(store.put).mock.calls[1]?.[0]).not.toHaveProperty(
      'sourceUrl',
    )
  })

  it('returns image content with a wn-attachment URI', async () => {
    vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }))
    vi.stubGlobal('crypto', { randomUUID: () => 'image-1' })
    const adapter = createVisualAttachmentAdapter({
      getPageKey: () => '/canvas',
      store: createStore().store,
      originForFile: () => ({ origin: 'clipboard' }),
    })

    const pending = (
      await adapter.add({ file: imageFile() })
    ) as unknown as Parameters<typeof adapter.send>[0]

    await expect(adapter.send(pending)).resolves.toMatchObject({
      id: 'image-1',
      type: 'image',
      name: 'clipboard.png',
      contentType: 'image/png',
      status: { type: 'complete' },
      content: [{ type: 'image', image: 'wn-attachment:image-1' }],
    })
  })

  it('removes a pending attachment Blob when the composer removes it', async () => {
    const { store } = createStore()
    vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }))
    vi.stubGlobal('crypto', { randomUUID: () => 'image-1' })
    const adapter = createVisualAttachmentAdapter({
      getPageKey: () => '/canvas',
      store,
      originForFile: () => ({ origin: 'clipboard' }),
    })
    const pending = (
      await adapter.add({ file: imageFile() })
    ) as unknown as Parameters<typeof adapter.send>[0]

    await adapter.remove(pending)

    expect(store.delete).toHaveBeenCalledWith('image-1')
  })
})
