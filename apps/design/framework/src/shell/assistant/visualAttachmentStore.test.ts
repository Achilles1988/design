// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  attachmentUri,
  getVisualAttachmentStore,
  openVisualAttachmentStore,
  parseAttachmentUri,
  type VisualAttachmentRecord,
} from './visualAttachmentStore'

type FailureMode = 'request-error' | 'transaction-error' | 'transaction-abort'

type FakeRequest<T> = {
  error: DOMException | null
  onerror: ((event: Event) => void) | null
  onsuccess: ((event: Event) => void) | null
  onupgradeneeded: ((event: Event) => void) | null
  result: T
}

type FakeTransaction = {
  error: DOMException | null
  onabort: ((event: Event) => void) | null
  oncomplete: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
}

class MemoryIdbFactory {
  readonly databases = new Map<string, MemoryDatabase>()
  readonly opened: Array<{ name: string; version: number | undefined }> = []
  failureMode: FailureMode | null = null

  open(name: string, version?: number) {
    this.opened.push({ name, version })
    const request = createRequest<MemoryDatabase>()
    queueMicrotask(() => {
      let database = this.databases.get(name)
      const oldVersion = database?.version ?? 0
      if (!database) {
        database = new MemoryDatabase(version ?? 1, this)
        this.databases.set(name, database)
      }
      request.result = database
      if (oldVersion < (version ?? 1)) {
        request.onupgradeneeded?.(new Event('upgradeneeded'))
      }
      request.onsuccess?.(new Event('success'))
    })
    return request as unknown as IDBOpenDBRequest
  }
}

class MemoryDatabase {
  readonly stores = new Map<string, MemoryObjectStore>()

  constructor(
    readonly version: number,
    private readonly factory: MemoryIdbFactory,
  ) {}

  get objectStoreNames() {
    return {
      contains: (name: string) => this.stores.has(name),
    } as DOMStringList
  }

  createObjectStore(name: string, options?: IDBObjectStoreParameters) {
    if (options?.keyPath !== 'id') throw new Error('Unexpected object-store key.')
    const store = new MemoryObjectStore()
    this.stores.set(name, store)
    return store as unknown as IDBObjectStore
  }

  transaction(name: string, _mode?: IDBTransactionMode) {
    const transaction: FakeTransaction = {
      error: null,
      onabort: null,
      oncomplete: null,
      onerror: null,
    }
    const store = this.stores.get(name)
    if (!store) throw new DOMException('Missing object store', 'NotFoundError')
    setTimeout(() => {
      const failure = this.factory.failureMode
      this.factory.failureMode = null
      if (failure === 'transaction-error') {
        transaction.error = new DOMException('Transaction failed', 'UnknownError')
        transaction.onerror?.(new Event('error'))
        return
      }
      if (failure === 'transaction-abort') {
        transaction.error = new DOMException('Transaction aborted', 'AbortError')
        transaction.onabort?.(new Event('abort'))
        return
      }
      transaction.oncomplete?.(new Event('complete'))
    })
    return Object.assign(transaction, {
      objectStore: () => store.forTransaction(this.factory),
    }) as unknown as IDBTransaction
  }
}

class MemoryObjectStore {
  readonly records = new Map<string, VisualAttachmentRecord>()
  readonly indexes = new Map<string, string>()

  createIndex(name: string, keyPath: string | string[], options?: IDBIndexParameters) {
    if (options?.unique) throw new Error('The memory fake supports non-unique indexes only.')
    this.indexes.set(name, String(keyPath))
    return {} as IDBIndex
  }

  forTransaction(factory: MemoryIdbFactory) {
    return {
      put: (record: VisualAttachmentRecord) => this.mutate(factory, () => {
        this.records.set(record.id, record)
      }),
      get: (id: string) => this.read(factory, this.records.get(id)),
      delete: (id: string) => this.mutate(factory, () => {
        this.records.delete(id)
      }),
      index: (name: string) => {
        const keyPath = this.indexes.get(name)
        if (!keyPath) throw new DOMException('Missing index', 'NotFoundError')
        return {
          openCursor: (pageKey: string) => this.cursor(factory, pageKey, keyPath),
        } as unknown as IDBIndex
      },
    } as unknown as IDBObjectStore
  }

  private mutate(factory: MemoryIdbFactory, apply: () => void) {
    const request = createRequest<IDBValidKey>()
    queueMicrotask(() => {
      if (factory.failureMode === 'request-error') {
        factory.failureMode = null
        request.error = new DOMException('Request failed', 'UnknownError')
        request.onerror?.(new Event('error'))
        return
      }
      apply()
      request.onsuccess?.(new Event('success'))
    })
    return request as unknown as IDBRequest<IDBValidKey>
  }

  private read(factory: MemoryIdbFactory, value: VisualAttachmentRecord | undefined) {
    const request = createRequest<VisualAttachmentRecord | undefined>()
    queueMicrotask(() => {
      if (factory.failureMode === 'request-error') {
        factory.failureMode = null
        request.error = new DOMException('Request failed', 'UnknownError')
        request.onerror?.(new Event('error'))
        return
      }
      request.result = value
      request.onsuccess?.(new Event('success'))
    })
    return request as unknown as IDBRequest<VisualAttachmentRecord | undefined>
  }

  private cursor(factory: MemoryIdbFactory, pageKey: string, keyPath: string) {
    const records = [...this.records.values()].filter(
      (record) => record[keyPath as keyof VisualAttachmentRecord] === pageKey,
    )
    let position = 0
    const request = createRequest<IDBCursorWithValue | null>()
    const advance = () => {
      queueMicrotask(() => {
        if (factory.failureMode === 'request-error') {
          factory.failureMode = null
          request.error = new DOMException('Request failed', 'UnknownError')
          request.onerror?.(new Event('error'))
          return
        }
        const record = records[position]
        if (!record) {
          request.result = null
          request.onsuccess?.(new Event('success'))
          return
        }
        request.result = {
          value: record,
          delete: () => this.mutate(factory, () => this.records.delete(record.id)),
          continue: () => {
            position += 1
            advance()
          },
        } as unknown as IDBCursorWithValue
        request.onsuccess?.(new Event('success'))
      })
    }
    advance()
    return request as unknown as IDBRequest<IDBCursorWithValue | null>
  }
}

function createRequest<T>(): FakeRequest<T> {
  return {
    error: null,
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null,
    result: undefined as T,
  }
}

function attachment(
  id: string,
  pageKey = '/apps/design/canvases/home',
): VisualAttachmentRecord {
  return {
    id,
    pageKey,
    blob: new Blob(['image'], { type: 'image/png' }),
    mimeType: 'image/png',
    width: 320,
    height: 180,
    origin: 'clipboard',
    createdAt: '2026-07-25T00:00:00.000Z',
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('visual attachment store', () => {
  it('stores and restores a Blob by id', async () => {
    const store = await openVisualAttachmentStore(new MemoryIdbFactory() as unknown as IDBFactory)
    const record = attachment('image-1')

    await store.put(record)

    expect(await store.get('image-1')).toMatchObject({
      id: 'image-1',
      pageKey: '/apps/design/canvases/home',
      origin: 'clipboard',
      mimeType: 'image/png',
    })
    expect(await store.get('image-1')).toMatchObject({
      blob: expect.objectContaining({ size: 5, type: 'image/png' }),
    })
  })

  it('isolates records by pageKey', async () => {
    const store = await openVisualAttachmentStore(new MemoryIdbFactory() as unknown as IDBFactory)
    await store.put(attachment('home-image'))
    await store.put(attachment('settings-image', '/apps/design/canvases/settings'))

    await store.reconcilePage('/apps/design/canvases/home', new Set())

    await expect(store.get('home-image')).resolves.toBeNull()
    await expect(store.get('settings-image')).resolves.toMatchObject({
      pageKey: '/apps/design/canvases/settings',
    })
  })

  it('deletes only one page', async () => {
    const store = await openVisualAttachmentStore(new MemoryIdbFactory() as unknown as IDBFactory)
    await store.put(attachment('home-image'))
    await store.put(attachment('settings-image', '/apps/design/canvases/settings'))

    await store.deletePage('/apps/design/canvases/home')

    await expect(store.get('home-image')).resolves.toBeNull()
    await expect(store.get('settings-image')).resolves.toMatchObject({
      pageKey: '/apps/design/canvases/settings',
    })
  })

  it('reconciles orphaned records without deleting referenced records', async () => {
    const store = await openVisualAttachmentStore(new MemoryIdbFactory() as unknown as IDBFactory)
    await store.put(attachment('keep'))
    await store.put(attachment('remove'))
    await store.put(attachment('other-page', '/apps/design/canvases/settings'))

    await store.reconcilePage('/apps/design/canvases/home', new Set(['keep']))

    await expect(store.get('keep')).resolves.toMatchObject({ id: 'keep' })
    await expect(store.get('remove')).resolves.toBeNull()
    await expect(store.get('other-page')).resolves.toMatchObject({
      pageKey: '/apps/design/canvases/settings',
    })
  })

  it('upgrades and opens wn.assistant.attachments.v1', async () => {
    const factory = new MemoryIdbFactory()

    await openVisualAttachmentStore(factory as unknown as IDBFactory)

    expect(factory.opened).toEqual([
      { name: 'wn.assistant.attachments.v1', version: 1 },
    ])
    expect(factory.databases.get('wn.assistant.attachments.v1')?.stores.get('attachments')?.indexes)
      .toEqual(new Map([['by-page-key', 'pageKey']]))
  })

  it('returns an English persistence error when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)

    await expect(getVisualAttachmentStore()).rejects.toThrow(
      'Browser storage is unavailable.',
    )

    vi.stubGlobal('indexedDB', new MemoryIdbFactory())

    await expect(getVisualAttachmentStore()).resolves.toHaveProperty('put')
  })

  it('round-trips wn-attachment URIs', () => {
    expect(attachmentUri('image-1')).toBe('wn-attachment:image-1')
    expect(parseAttachmentUri('wn-attachment:image-1')).toBe('image-1')
    expect(parseAttachmentUri('https://example.com/image-1')).toBeNull()
    expect(parseAttachmentUri('wn-attachment:')).toBeNull()
  })

  it.each<FailureMode>([
    'request-error',
    'transaction-error',
    'transaction-abort',
  ])('rejects when IndexedDB emits %s', async (failureMode) => {
    const factory = new MemoryIdbFactory()
    const store = await openVisualAttachmentStore(factory as unknown as IDBFactory)
    factory.failureMode = failureMode

    await expect(store.put(attachment('failed-image'))).rejects.toThrow()
  })
})
