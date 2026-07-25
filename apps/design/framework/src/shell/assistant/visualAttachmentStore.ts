const DATABASE_NAME = 'wn.assistant.attachments.v1'
const DATABASE_VERSION = 1
const STORE_NAME = 'attachments'
const PAGE_KEY_INDEX = 'by-page-key'
const ATTACHMENT_PREFIX = 'wn-attachment:'

const PERSISTENCE_ERROR = 'Visual attachment persistence failed.'
const STORAGE_UNAVAILABLE_ERROR = 'Browser storage is unavailable.'

export type VisualAttachmentRecord = {
  id: string
  pageKey: string
  blob: Blob
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  width: number
  height: number
  origin: 'clipboard' | 'url-capture'
  sourceUrl?: string
  createdAt: string
}

export type VisualAttachmentStore = {
  put(record: VisualAttachmentRecord): Promise<void>
  get(id: string): Promise<VisualAttachmentRecord | null>
  delete(id: string): Promise<void>
  deletePage(pageKey: string): Promise<void>
  reconcilePage(pageKey: string, referencedIds: Set<string>): Promise<void>
}

type Reject = (error?: unknown) => void

let visualAttachmentStorePromise: Promise<VisualAttachmentStore> | null = null

export function attachmentUri(id: string): `wn-attachment:${string}` {
  return `${ATTACHMENT_PREFIX}${id}`
}

export function parseAttachmentUri(value: string): string | null {
  if (!value.startsWith(ATTACHMENT_PREFIX)) return null
  const id = value.slice(ATTACHMENT_PREFIX.length)
  return id.length > 0 ? id : null
}

export function openVisualAttachmentStore(
  factory: IDBFactory | undefined = getIndexedDbFactory(),
): Promise<VisualAttachmentStore> {
  if (!factory) return Promise.reject(new Error(STORAGE_UNAVAILABLE_ERROR))

  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = factory.open(DATABASE_NAME, DATABASE_VERSION)
    } catch {
      reject(new Error(STORAGE_UNAVAILABLE_ERROR))
      return
    }

    request.onerror = () => reject(new Error(STORAGE_UNAVAILABLE_ERROR))
    request.onupgradeneeded = () => {
      const database = request.result
      if (database.objectStoreNames.contains(STORE_NAME)) return
      const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      store.createIndex(PAGE_KEY_INDEX, 'pageKey', { unique: false })
    }
    request.onsuccess = () => resolve(createStore(request.result))
  })
}

export function getVisualAttachmentStore(): Promise<VisualAttachmentStore> {
  if (visualAttachmentStorePromise) return visualAttachmentStorePromise

  const opened = openVisualAttachmentStore()
  visualAttachmentStorePromise = opened
  opened.catch(() => {
    if (visualAttachmentStorePromise === opened) {
      visualAttachmentStorePromise = null
    }
  })
  return opened
}

function createStore(database: IDBDatabase): VisualAttachmentStore {
  return {
    put: (record) => write(database, (store, rejectRequest) => {
      request(store.put(record), rejectRequest)
    }),
    get: (id) => read(database, id),
    delete: (id) => write(database, (store, rejectRequest) => {
      request(store.delete(id), rejectRequest)
    }),
    deletePage: (pageKey) => removePageRecords(database, pageKey, () => true),
    reconcilePage: (pageKey, referencedIds) => removePageRecords(
      database,
      pageKey,
      (record) => !referencedIds.has(record.id),
    ),
  }
}

function read(database: IDBDatabase, id: string): Promise<VisualAttachmentRecord | null> {
  let record: VisualAttachmentRecord | undefined
  return transaction(database, 'readonly', (store, rejectRequest) => {
    const getRequest = store.get(id) as IDBRequest<VisualAttachmentRecord | undefined>
    getRequest.onerror = () => rejectRequest(getRequest.error)
    getRequest.onsuccess = () => {
      record = getRequest.result
    }
  }).then(() => record ?? null)
}

function write(
  database: IDBDatabase,
  operation: (store: IDBObjectStore, rejectRequest: Reject) => void,
): Promise<void> {
  return transaction(database, 'readwrite', operation)
}

function removePageRecords(
  database: IDBDatabase,
  pageKey: string,
  shouldDelete: (record: VisualAttachmentRecord) => boolean,
): Promise<void> {
  return write(database, (store, rejectRequest) => {
    const cursorRequest = store.index(PAGE_KEY_INDEX).openCursor(pageKey)
    cursorRequest.onerror = () => rejectRequest(cursorRequest.error)
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) return
      const record = cursor.value as VisualAttachmentRecord
      if (shouldDelete(record)) {
        request(cursor.delete(), rejectRequest)
      }
      cursor.continue()
    }
  })
}

function request(idbRequest: IDBRequest, rejectRequest: Reject): void {
  idbRequest.onerror = () => rejectRequest(idbRequest.error)
}

function transaction(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, rejectRequest: Reject) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const fail: Reject = () => {
      if (settled) return
      settled = true
      reject(new Error(PERSISTENCE_ERROR))
    }
    const succeed = () => {
      if (settled) return
      settled = true
      resolve()
    }

    let idbTransaction: IDBTransaction
    try {
      idbTransaction = database.transaction(STORE_NAME, mode)
    } catch {
      fail()
      return
    }

    idbTransaction.onerror = () => fail(idbTransaction.error)
    idbTransaction.onabort = () => fail(idbTransaction.error)
    idbTransaction.oncomplete = succeed

    try {
      operation(idbTransaction.objectStore(STORE_NAME), fail)
    } catch {
      fail()
    }
  })
}

function getIndexedDbFactory(): IDBFactory | undefined {
  return typeof indexedDB === 'undefined' ? undefined : indexedDB
}
