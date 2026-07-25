import { describe, expect, it, vi } from 'vitest'
import { createUrlCaptureService } from './capture'

type Handler = (...args: unknown[]) => void | Promise<void>

function fakeBrowser(
  pages: Array<{
    goto?: () => Promise<void>
    screenshot?: () => Promise<Uint8Array>
    finalUrl?: string
    duringGoto?: (handlers: Map<string, Handler>) => Promise<void> | void
  }> = [{}],
) {
  const launch = vi.fn()
  const newContext = vi.fn()
  const contextClose = vi.fn(async () => undefined)
  const browserClose = vi.fn(async () => undefined)
  const pageRecords: Array<{
    close: ReturnType<typeof vi.fn>
    goto: ReturnType<typeof vi.fn>
    screenshot: ReturnType<typeof vi.fn>
    handlers: Map<string, Handler>
    routeHandler?: Handler
  }> = []

  const context = {
    newPage: vi.fn(async () => {
      const plan = pages[pageRecords.length] ?? {}
      const handlers = new Map<string, Handler>()
      const record = {
        close: vi.fn(async () => undefined),
        goto: vi.fn(async () => {
          await plan.duringGoto?.(handlers)
          await plan.goto?.()
        }),
        screenshot: vi.fn(
          plan.screenshot ??
            (async () => new Uint8Array([137, 80, 78, 71])),
        ),
        handlers,
        routeHandler: undefined as Handler | undefined,
      }
      const page = {
        on: vi.fn((event: string, handler: Handler) => {
          handlers.set(event, handler)
        }),
        route: vi.fn((_pattern: string, handler: Handler) => {
          record.routeHandler = handler
        }),
        goto: record.goto,
        screenshot: record.screenshot,
        close: record.close,
        url: vi.fn(() => plan.finalUrl ?? 'https://example.com/final'),
        mainFrame: vi.fn(() => 'main-frame'),
      }
      pageRecords.push(record)
      return page
    }),
    close: contextClose,
  }
  const browser = {
    newContext: newContext.mockResolvedValue(context),
    close: browserClose,
  }
  launch.mockResolvedValue(browser)

  return {
    launch,
    newContext,
    contextClose,
    browserClose,
    pageRecords,
  }
}

function service(fake: ReturnType<typeof fakeBrowser>) {
  return createUrlCaptureService({
    launch: fake.launch,
    now: () => Date.now(),
  })
}

describe('createUrlCaptureService', () => {
  it('accepts public, localhost, and private-network HTTP URLs', async () => {
    const fake = fakeBrowser([{}, {}, {}])
    const capture = service(fake)

    const results = await capture.capture(
      [
        'https://example.com/design',
        'http://localhost:5173/',
        'http://192.168.1.20/dashboard',
      ],
      new AbortController().signal,
    )

    expect(results.map((result) => result.ok)).toEqual([
      true,
      true,
      true,
    ])
    expect(fake.pageRecords.map((record) => record.goto.mock.calls[0]))
      .toEqual([
        [
          'https://example.com/design',
          { waitUntil: 'domcontentloaded', timeout: 15_000 },
        ],
        [
          'http://localhost:5173/',
          { waitUntil: 'domcontentloaded', timeout: 15_000 },
        ],
        [
          'http://192.168.1.20/dashboard',
          { waitUntil: 'domcontentloaded', timeout: 15_000 },
        ],
      ])
  })

  it('rejects file, data, javascript, and ftp URLs', async () => {
    const fake = fakeBrowser()
    const capture = service(fake)

    const results = await capture.capture(
      [
        'file:///etc/passwd',
        'data:text/html,hello',
        'javascript:alert(1)',
        'ftp://example.com/file',
      ],
      new AbortController().signal,
    )

    expect(results).toHaveLength(4)
    expect(results.every((result) => !result.ok)).toBe(true)
    expect(fake.launch).not.toHaveBeenCalled()
  })

  it('rejects more than four URLs', async () => {
    const capture = service(fakeBrowser())

    await expect(
      capture.capture(
        Array.from({ length: 5 }, (_, index) =>
          `https://example.com/${index}`),
        new AbortController().signal,
      ),
    ).rejects.toThrow('four')
  })

  it('uses a 1440 by 1000 viewport and captures only that viewport', async () => {
    const fake = fakeBrowser()
    const capture = service(fake)

    await capture.capture(
      ['https://example.com'],
      new AbortController().signal,
    )

    expect(fake.launch).toHaveBeenCalledWith({ headless: true })
    expect(fake.newContext).toHaveBeenCalledWith({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: false,
    })
    expect(fake.pageRecords[0]?.screenshot).toHaveBeenCalledWith({
      type: 'png',
      fullPage: false,
      animations: 'disabled',
    })
  })

  it('waits at most 15 seconds for DOMContentLoaded and 20 seconds total', async () => {
    vi.useFakeTimers()
    try {
      const fake = fakeBrowser([
        { screenshot: () => new Promise<Uint8Array>(() => undefined) },
      ])
      const capture = service(fake)

      const pending = capture.capture(
        ['https://example.com'],
        new AbortController().signal,
      )
      await vi.advanceTimersByTimeAsync(20_000)
      const [result] = await pending

      expect(fake.pageRecords[0]?.goto).toHaveBeenCalledWith(
        'https://example.com',
        { waitUntil: 'domcontentloaded', timeout: 15_000 },
      )
      expect(result?.ok).toBe(false)
      expect(result?.error).toMatch(/20 seconds/i)
    } finally {
      vi.useRealTimers()
    }
  })

  it('allows at most five HTTP/HTTPS redirects', async () => {
    const fake = fakeBrowser([
      {
        goto: async () => {
          const route = fake.pageRecords[0]?.routeHandler
          if (!route) throw new Error('route was not installed')
          let previous: object | null = null
          for (let index = 0; index < 7; index += 1) {
            const redirectedFrom = previous
            const request = {
              url: () => `https://example.com/${index}`,
              isNavigationRequest: () => true,
              frame: () => 'main-frame',
              redirectedFrom: () => redirectedFrom,
            }
            const abort = vi.fn()
            await route({
              request: () => request,
              continue: vi.fn(),
              abort,
            })
            previous = request
            if (abort.mock.calls.length > 0) {
              throw new Error('redirect rejected')
            }
          }
        },
      },
    ])
    const capture = service(fake)

    const [result] = await capture.capture(
      ['https://example.com/start'],
      new AbortController().signal,
    )

    expect(result?.ok).toBe(false)
    expect(result?.error).toMatch(/five redirects/i)
  })

  it('closes popups and cancels downloads', async () => {
    const popupClose = vi.fn(async () => undefined)
    const cancel = vi.fn(async () => undefined)
    const fake = fakeBrowser([
      {
        duringGoto: async (handlers) => {
          await handlers.get('popup')?.({ close: popupClose })
          await handlers.get('download')?.({ cancel })
        },
      },
    ])
    const capture = service(fake)

    await capture.capture(
      ['https://example.com'],
      new AbortController().signal,
    )

    expect(popupClose).toHaveBeenCalled()
    expect(cancel).toHaveBeenCalled()
  })

  it('returns independent success and failure results in input order', async () => {
    const fake = fakeBrowser([
      { finalUrl: 'https://one.example/final' },
      { goto: async () => { throw new Error('navigation failed') } },
      { finalUrl: 'http://localhost:3000/final' },
    ])
    const capture = service(fake)

    const results = await capture.capture(
      [
        'https://one.example',
        'https://two.example',
        'http://localhost:3000',
      ],
      new AbortController().signal,
    )

    expect(results.map(({ url, ok }) => ({ url, ok }))).toEqual([
      { url: 'https://one.example', ok: true },
      { url: 'https://two.example', ok: false },
      { url: 'http://localhost:3000', ok: true },
    ])
    expect(results[0]?.finalUrl).toBe('https://one.example/final')
    expect(results[2]?.finalUrl).toBe('http://localhost:3000/final')
  })

  it('aborts page work when the request signal aborts', async () => {
    const fake = fakeBrowser([
      { goto: () => new Promise<void>(() => undefined) },
    ])
    const capture = service(fake)
    const controller = new AbortController()

    const pending = capture.capture(
      ['https://example.com'],
      controller.signal,
    )
    await vi.waitFor(() => {
      expect(fake.pageRecords).toHaveLength(1)
    })
    controller.abort()
    const [result] = await pending

    expect(result?.ok).toBe(false)
    expect(result?.error).toMatch(/aborted/i)
    expect(fake.pageRecords[0]?.close).toHaveBeenCalled()
  })

  it('aborts browser setup before a Page exists', async () => {
    const launch = vi.fn(async () => ({
      newContext: () => new Promise<never>(() => undefined),
      close: vi.fn(async () => undefined),
    }))
    const capture = createUrlCaptureService({
      launch,
      now: () => Date.now(),
    })
    const controller = new AbortController()

    const pending = capture.capture(
      ['https://example.com'],
      controller.signal,
    )
    await Promise.resolve()
    controller.abort()

    await expect(pending).resolves.toEqual([
      {
        url: 'https://example.com',
        ok: false,
        error: 'URL capture was aborted.',
      },
    ])
  })

  it('closes its shared context and browser', async () => {
    const fake = fakeBrowser()
    const capture = service(fake)
    await capture.capture(
      ['https://example.com'],
      new AbortController().signal,
    )

    await capture.close()

    expect(fake.contextClose).toHaveBeenCalled()
    expect(fake.browserClose).toHaveBeenCalled()
  })
})
