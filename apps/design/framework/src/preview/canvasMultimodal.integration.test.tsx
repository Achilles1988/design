// @vitest-environment jsdom
import { useEffect } from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  BrowserRouter,
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
import type { CanvasChatRequest } from '@/lib/canvasAssistantProtocol'
import { AssistantProvider } from '@/shell/assistant/AssistantProvider'
import { AssistantThread } from '@/shell/assistant/AssistantThread'
import { useAssistantPageSession } from '@/shell/assistant/pageSession'
import type {
  VisualAttachmentRecord,
} from '@/shell/assistant/visualAttachmentStore'
import { useCanvasAssistant } from './useCanvasAssistant'

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

function createRequest<T>(): FakeRequest<T> {
  return {
    error: null,
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null,
    result: undefined as T,
  }
}

class MemoryIdbFactory {
  readonly databases = new Map<string, MemoryDatabase>()
  readonly opened: Array<{ name: string; version: number | undefined }> = []

  open(name: string, version?: number) {
    this.opened.push({ name, version })
    const request = createRequest<MemoryDatabase>()
    queueMicrotask(() => {
      let database = this.databases.get(name)
      const oldVersion = database?.version ?? 0
      if (!database) {
        database = new MemoryDatabase(version ?? 1)
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

  records(): VisualAttachmentRecord[] {
    return [...this.databases.values()].flatMap((database) =>
      [...database.stores.values()].flatMap((store) =>
        [...store.records.values()]))
  }
}

class MemoryDatabase {
  readonly stores = new Map<string, MemoryObjectStore>()

  constructor(readonly version: number) {}

  get objectStoreNames() {
    return {
      contains: (name: string) => this.stores.has(name),
    } as DOMStringList
  }

  createObjectStore(name: string, options?: IDBObjectStoreParameters) {
    if (options?.keyPath !== 'id') {
      throw new Error('Unexpected object-store key.')
    }
    const store = new MemoryObjectStore()
    this.stores.set(name, store)
    return store as unknown as IDBObjectStore
  }

  transaction(name: string) {
    const transaction: FakeTransaction = {
      error: null,
      onabort: null,
      oncomplete: null,
      onerror: null,
    }
    const store = this.stores.get(name)
    if (!store) throw new DOMException('Missing object store', 'NotFoundError')
    setTimeout(() => {
      transaction.oncomplete?.(new Event('complete'))
    })
    return Object.assign(transaction, {
      objectStore: () => store.forTransaction(),
    }) as unknown as IDBTransaction
  }
}

class MemoryObjectStore {
  readonly records = new Map<string, VisualAttachmentRecord>()
  readonly indexes = new Map<string, string>()

  createIndex(
    name: string,
    keyPath: string | string[],
    options?: IDBIndexParameters,
  ) {
    if (options?.unique) {
      throw new Error('The memory fixture supports non-unique indexes only.')
    }
    this.indexes.set(name, String(keyPath))
    return {} as IDBIndex
  }

  forTransaction() {
    return {
      put: (record: VisualAttachmentRecord) => this.mutate(() => {
        this.records.set(record.id, record)
      }),
      get: (id: string) => this.read(this.records.get(id)),
      delete: (id: string) => this.mutate(() => {
        this.records.delete(id)
      }),
      index: (name: string) => {
        const keyPath = this.indexes.get(name)
        if (!keyPath) throw new DOMException('Missing index', 'NotFoundError')
        return {
          openCursor: (pageKey: string) => this.cursor(pageKey, keyPath),
        } as unknown as IDBIndex
      },
    } as unknown as IDBObjectStore
  }

  private mutate(apply: () => void) {
    const request = createRequest<IDBValidKey>()
    queueMicrotask(() => {
      apply()
      request.onsuccess?.(new Event('success'))
    })
    return request as unknown as IDBRequest<IDBValidKey>
  }

  private read(value: VisualAttachmentRecord | undefined) {
    const request = createRequest<VisualAttachmentRecord | undefined>()
    queueMicrotask(() => {
      request.result = value
      request.onsuccess?.(new Event('success'))
    })
    return request as unknown as IDBRequest<
      VisualAttachmentRecord | undefined
    >
  }

  private cursor(pageKey: string, keyPath: string) {
    const records = [...this.records.values()].filter(
      (record) =>
        record[keyPath as keyof VisualAttachmentRecord] === pageKey,
    )
    let position = 0
    const request = createRequest<IDBCursorWithValue | null>()
    const advance = () => {
      queueMicrotask(() => {
        const record = records[position]
        if (!record) {
          request.result = null
          request.onsuccess?.(new Event('success'))
          return
        }
        request.result = {
          value: record,
          delete: () => this.mutate(() => {
            this.records.delete(record.id)
          }),
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

let indexedDbFactory: MemoryIdbFactory

vi.mock('@/shell/assistant/visualAttachmentStore', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/shell/assistant/visualAttachmentStore')
  >()
  return {
    ...actual,
    getVisualAttachmentStore: () => actual.openVisualAttachmentStore(
      indexedDbFactory as unknown as IDBFactory,
    ),
  }
})

type CaptureResponse = {
  results: Array<
    | {
        url: string
        finalUrl: string
        ok: true
        mimeType: 'image/png'
        base64: string
      }
    | {
        url: string
        ok: false
        error: string
      }
  >
}

type CaptureResponder = (
  urls: string[],
  signal: AbortSignal,
) => Promise<CaptureResponse>

const VISION_ERROR =
  'The configured model does not support image input. Choose a vision-capable model or remove the images.'
const PNG_BASE64 = 'aW1hZ2U='
const originalScrollTo = HTMLElement.prototype.scrollTo
const originalCreateObjectUrl = URL.createObjectURL
const originalRevokeObjectUrl = URL.revokeObjectURL

function ndjsonResponse(events: Array<Record<string, unknown>>): Response {
  return new Response(
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    },
  )
}

function successfulCapture(urls: readonly string[]): CaptureResponse {
  return {
    results: urls.map((url) => ({
      url,
      finalUrl: url,
      ok: true,
      mimeType: 'image/png',
      base64: PNG_BASE64,
    })),
  }
}

class FakeMultimodalApi {
  readonly captureCalls: Array<{
    urls: string[]
    signal: AbortSignal
  }> = []
  readonly chatForms: FormData[] = []
  readonly captureResponders: CaptureResponder[] = []
  readonly chatErrors: string[] = []

  enqueueCapture(responder: CaptureResponder): void {
    this.captureResponders.push(responder)
  }

  rejectNextChat(error: string): void {
    this.chatErrors.push(error)
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

    if (url === '/__design_ai/references/capture') {
      const body = JSON.parse(String(init?.body)) as { urls: string[] }
      const signal = init?.signal
      if (!signal) throw new Error('Capture signal was not forwarded.')
      this.captureCalls.push({ urls: body.urls, signal })
      const responder = this.captureResponders.shift()
      if (!responder) {
        throw new Error('No fake capture response was queued.')
      }
      const response = await responder(body.urls, signal)
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (url === '/__design_ai/canvas/chat') {
      const form = init?.body
      if (!(form instanceof FormData)) {
        throw new Error('Canvas chat did not use FormData.')
      }
      this.chatForms.push(form)
      const error = this.chatErrors.shift()
      if (error) {
        return ndjsonResponse([{ type: 'error', error }])
      }
      return ndjsonResponse([{
        type: 'run-result',
        value: {
          content: [{
            type: 'text',
            text: `Multimodal response ${this.chatForms.length}`,
          }],
        },
      }])
    }

    throw new Error(`Unexpected fake request: ${url}`)
  })
}

function CanvasSurface() {
  const { canvasId = '' } = useParams<{ canvasId: string }>()
  const navigate = useNavigate()
  const session = useAssistantPageSession()
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
        onClick={() => navigate('/apps/design/canvases/home')}
      >
        Open Home Canvas
      </button>
      <button
        type="button"
        onClick={() => navigate('/apps/design/canvases/about')}
      >
        Open About Canvas
      </button>
      <button
        type="button"
        onClick={() => session.startNewChat(session.owner)}
      >
        Clear current Canvas chat
      </button>
      <AssistantThread />
    </>
  )
}

function renderCanvas() {
  return render(
    <BrowserRouter>
      <AssistantProvider>
        <Routes>
          <Route
            path="/apps/:id/canvases/:canvasId"
            element={<CanvasSurface />}
          />
        </Routes>
      </AssistantProvider>
    </BrowserRouter>,
  )
}

function imageFile(name: string, type = 'image/png'): File {
  return new File([`pixels:${name}`], name, { type })
}

async function pasteImages(files: readonly File[]): Promise<void> {
  const input = await screen.findByPlaceholderText('Describe what you need…')
  fireEvent.paste(input, {
    clipboardData: {
      items: files.map((file) => ({
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
      })),
    },
  })
  await waitFor(() => {
    for (const file of files) {
      expect(screen.getByRole('img', {
        name: `Preview of ${file.name}`,
      })).toBeTruthy()
    }
  })
}

async function setPromptAndSend(text: string): Promise<void> {
  const input = await screen.findByPlaceholderText('Describe what you need…')
  fireEvent.change(input, { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

function requestFrom(form: FormData): CanvasChatRequest {
  return JSON.parse(String(form.get('request'))) as CanvasChatRequest
}

function attachmentFields(form: FormData): string[] {
  return [...form.keys()].filter((key) => key.startsWith('attachment:'))
}

function recordsFor(pageKey: string): VisualAttachmentRecord[] {
  return indexedDbFactory.records().filter(
    (record) => record.pageKey === pageKey,
  )
}

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
  if (originalCreateObjectUrl) {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectUrl,
    })
  } else {
    Reflect.deleteProperty(URL, 'createObjectURL')
  }
  if (originalRevokeObjectUrl) {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectUrl,
    })
  } else {
    Reflect.deleteProperty(URL, 'revokeObjectURL')
  }
})

describe('Canvas multimodal LocalRuntime integration', () => {
  let api: FakeMultimodalApi
  let objectUrlIndex = 0

  beforeEach(() => {
    window.history.replaceState(
      {},
      '',
      '/apps/design/canvases/home',
    )
    localStorage.clear()
    writeAiConfig({
      provider: 'openai',
      apiKey: 'integration-key',
      model: 'integration-model',
    })
    indexedDbFactory = new MemoryIdbFactory()
    objectUrlIndex = 0
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => `blob:integration-${objectUrlIndex += 1}`),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 32,
      height: 24,
      close: vi.fn(),
    })))
    api = new FakeMultimodalApi()
    vi.stubGlobal('fetch', api.fetch)
  })

  afterEach(() => {
    cleanup()
  })

  it('combines text, two pasted images, and two URL screenshots in one run', async () => {
    const urls = [
      'https://one.example/reference',
      'http://127.0.0.1:4173/local-reference',
    ]
    api.enqueueCapture(async (capturedUrls) =>
      successfulCapture(capturedUrls))
    renderCanvas()
    await pasteImages([
      imageFile('wireframe.png'),
      imageFile('palette.webp', 'image/webp'),
    ])

    await setPromptAndSend(
      `Use both screenshots plus ${urls[0]} and ${urls[1]}`,
    )
    await screen.findByText(
      'Review the captured references, then send again.',
    )
    expect(api.chatForms).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByText('Multimodal response 1')
    expect(api.chatForms).toHaveLength(1)
    const form = api.chatForms[0]!
    const request = requestFrom(form)
    expect(attachmentFields(form)).toHaveLength(4)
    const user = [...request.messages]
      .reverse()
      .find((message) => message.role === 'user')
    expect(user?.content).toEqual([
      {
        type: 'text',
        text: `Use both screenshots plus ${urls[0]} and ${urls[1]}`,
      },
      expect.objectContaining({
        type: 'image',
        image: expect.stringMatching(/^wn-attachment:/u),
      }),
      expect.objectContaining({
        type: 'image',
        image: expect.stringMatching(/^wn-attachment:/u),
      }),
      { type: 'text', text: `Source URL: ${urls[0]}` },
      expect.objectContaining({
        type: 'image',
        image: expect.stringMatching(/^wn-attachment:/u),
      }),
      { type: 'text', text: `Source URL: ${urls[1]}` },
      expect.objectContaining({
        type: 'image',
        image: expect.stringMatching(/^wn-attachment:/u),
      }),
    ])
    const storedRecords = recordsFor('/apps/design/canvases/home')
    expect(storedRecords.map(({ origin }) => origin)).toEqual([
      'clipboard',
      'clipboard',
      'url-capture',
      'url-capture',
    ])
    expect(storedRecords.map(({ sourceUrl }) => sourceUrl)).toEqual([
      undefined,
      undefined,
      urls[0],
      urls[1],
    ])
  })

  it('restores thumbnails and messages after remount from IndexedDB', async () => {
    renderCanvas()
    await pasteImages([imageFile('persisted.png')])
    await setPromptAndSend('Remember this visual reference')
    await screen.findByText('Multimodal response 1')
    await waitFor(() => {
      expect(recordsFor('/apps/design/canvases/home')).toHaveLength(1)
      expect(localStorage.getItem('wn.assistant.page-state.v1')).toContain(
        'wn-attachment:',
      )
    })
    const opensBeforeRemount = indexedDbFactory.opened.length

    cleanup()
    renderCanvas()

    expect(await screen.findByText('Remember this visual reference')).toBeTruthy()
    expect(await screen.findByRole('img', {
      name: 'Attached image',
    })).toBeTruthy()
    expect(screen.getByText('Multimodal response 1')).toBeTruthy()
    expect(indexedDbFactory.opened.length).toBeGreaterThan(opensBeforeRemount)
    expect(recordsFor('/apps/design/canvases/home')[0]?.blob).toBeInstanceOf(
      Blob,
    )
  })

  it('New chat deletes only current-Canvas image records', async () => {
    renderCanvas()
    await pasteImages([imageFile('home.png')])
    await setPromptAndSend('Home visual')
    await screen.findByText('Multimodal response 1')

    fireEvent.click(screen.getByRole('button', {
      name: 'Open About Canvas',
    }))
    await screen.findByText('about', {
      selector: '[aria-label="current Canvas"]',
    })
    await pasteImages([imageFile('about.png')])
    await setPromptAndSend('About visual')
    await screen.findByText('Multimodal response 2')

    fireEvent.click(screen.getByRole('button', {
      name: 'Open Home Canvas',
    }))
    await screen.findByText('Home visual')
    fireEvent.click(screen.getByRole('button', {
      name: 'Clear current Canvas chat',
    }))

    await waitFor(() => {
      expect(recordsFor('/apps/design/canvases/home')).toEqual([])
      expect(recordsFor('/apps/design/canvases/about')).toHaveLength(1)
    })
    fireEvent.click(screen.getByRole('button', {
      name: 'Open About Canvas',
    }))
    expect(await screen.findByText('About visual')).toBeTruthy()
    expect(await screen.findByRole('img', {
      name: 'Attached image',
    })).toBeTruthy()
  })

  it('a failed URL blocks send until dismissed or replaced', async () => {
    const url = 'https://private.example/reference'
    api.enqueueCapture(async () => ({
      results: [{
        url,
        ok: false,
        error: 'fixture failure',
      }],
    }))
    renderCanvas()

    await setPromptAndSend(`Use ${url}`)
    await screen.findByText(
      'This page could not be captured. Paste a screenshot or remove this reference.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await act(async () => Promise.resolve())
    expect(api.chatForms).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', {
      name: 'Remove reference',
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByText('Multimodal response 1')
    expect(api.chatForms).toHaveLength(1)
    expect(attachmentFields(api.chatForms[0]!)).toEqual([])
  })

  it('a poor capture can be dismissed and replaced by a pasted screenshot', async () => {
    const url = 'https://signed-in.example/dashboard'
    api.enqueueCapture(async (urls) => successfulCapture(urls))
    renderCanvas()

    await setPromptAndSend(`Match ${url}`)
    await screen.findByText(
      'Review the captured references, then send again.',
    )
    expect(recordsFor('/apps/design/canvases/home')).toEqual([
      expect.objectContaining({
        origin: 'url-capture',
        sourceUrl: url,
      }),
    ])
    fireEvent.click(screen.getByRole('button', {
      name: 'Remove reference',
    }))
    await pasteImages([imageFile('signed-in-manual.png')])
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByText('Multimodal response 1')
    const form = api.chatForms[0]!
    expect(attachmentFields(form)).toHaveLength(1)
    expect(
      requestFrom(form).messages.flatMap((message) => message.content),
    ).not.toContainEqual({ type: 'text', text: `Source URL: ${url}` })
    const [replacement] = recordsFor('/apps/design/canvases/home')
    expect(replacement).toMatchObject({ origin: 'clipboard' })
    expect(replacement?.sourceUrl).toBeUndefined()
  })

  it('switching Canvas cancels capture and keeps sessions isolated', async () => {
    let releaseCapture = () => {}
    const captureStarted = new Promise<void>((resolve) => {
      api.enqueueCapture((_urls, signal) => new Promise((resolveCapture) => {
        resolve()
        releaseCapture = () => resolveCapture(
          successfulCapture(['https://slow.example/reference']),
        )
        signal.addEventListener('abort', releaseCapture, { once: true })
      }))
    })
    renderCanvas()

    await setPromptAndSend('Use https://slow.example/reference')
    await captureStarted
    const signal = api.captureCalls[0]!.signal
    fireEvent.click(screen.getByRole('button', {
      name: 'Open About Canvas',
    }))

    await waitFor(() => {
      expect(screen.getByLabelText('current Canvas').textContent).toBe('about')
      expect(signal.aborted).toBe(true)
    })
    releaseCapture()
    await act(async () => Promise.resolve())
    expect(recordsFor('/apps/design/canvases/home')).toEqual([])

    await pasteImages([imageFile('about-only.png')])
    await setPromptAndSend('About-only visual')
    await screen.findByText('Multimodal response 1')
    expect(recordsFor('/apps/design/canvases/about')).toHaveLength(1)
    expect(recordsFor('/apps/design/canvases/home')).toEqual([])

    fireEvent.click(screen.getByRole('button', {
      name: 'Open Home Canvas',
    }))
    await waitFor(() => {
      expect(screen.queryByText('About-only visual')).toBeNull()
    })
  })

  it('vision-model rejection preserves the message and references', async () => {
    api.rejectNextChat(VISION_ERROR)
    renderCanvas()
    await pasteImages([imageFile('vision.png')])

    await setPromptAndSend('Use this image with the Canvas')

    expect(await screen.findByText(VISION_ERROR)).toBeTruthy()
    expect(screen.getByText('Use this image with the Canvas')).toBeTruthy()
    expect(await screen.findByRole('img', {
      name: 'Attached image',
    })).toBeTruthy()
    expect(recordsFor('/apps/design/canvases/home')).toHaveLength(1)
    expect(attachmentFields(api.chatForms[0]!)).toHaveLength(1)
    expect(
      [...requestFrom(api.chatForms[0]!).messages]
        .reverse()
        .find((message) => message.role === 'user')
        ?.content,
    ).toEqual([
      { type: 'text', text: 'Use this image with the Canvas' },
      expect.objectContaining({
        type: 'image',
        image: expect.stringMatching(/^wn-attachment:/u),
      }),
    ])
  })
})
