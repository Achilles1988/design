import type {
  Browser,
  BrowserContext,
  LaunchOptions,
  Page,
  Request,
} from 'playwright'

const MAX_URLS = 4
const NAVIGATION_TIMEOUT_MS = 15_000
const TOTAL_TIMEOUT_MS = 20_000
const MAX_REDIRECTS = 5

export type CaptureResult = {
  url: string
  finalUrl?: string
  ok: boolean
  mimeType?: 'image/png'
  bytes?: Uint8Array
  error?: string
}

type LaunchBrowser = (options: LaunchOptions) => Promise<Browser>

export type UrlCaptureService = {
  capture(
    urls: string[],
    signal: AbortSignal,
  ): Promise<CaptureResult[]>
  close(): Promise<void>
}

function captureError(url: string, error: string): CaptureResult {
  return { url, ok: false, error }
}

function isHttpUrl(source: string): boolean {
  try {
    const protocol = new URL(source).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function redirectCount(request: Request): number {
  let count = 0
  let previous = request.redirectedFrom()
  while (previous) {
    count += 1
    previous = previous.redirectedFrom()
  }
  return count
}

function abortError(): Error {
  return new Error('URL capture was aborted.')
}

async function raceCapture<T>(
  operation: Promise<T>,
  activePage: () => Page | undefined,
  signal: AbortSignal,
  timeoutMs: number,
  cancel: () => void,
): Promise<T> {
  if (signal.aborted) throw abortError()

  let timeout: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      cancel()
      void activePage()?.close().catch(() => undefined)
      reject(new Error('URL capture exceeded 20 seconds.'))
    }, timeoutMs)
  })
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      cancel()
      void activePage()?.close().catch(() => undefined)
      reject(abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })

  try {
    return await Promise.race([operation, deadline, aborted])
  } finally {
    if (timeout) clearTimeout(timeout)
    if (onAbort) signal.removeEventListener('abort', onAbort)
  }
}

export function createUrlCaptureService({
  launch,
  now,
}: {
  launch: LaunchBrowser
  now: () => number
}): UrlCaptureService {
  let browserPromise: Promise<Browser> | undefined
  let contextPromise: Promise<BrowserContext> | undefined
  let closed = false

  const getBrowser = () => {
    if (closed) {
      throw new Error('URL capture service is closed.')
    }
    browserPromise ??= launch({ headless: true })
    return browserPromise
  }

  const getContext = () => {
    contextPromise ??= getBrowser().then((browser) =>
      browser.newContext({
        viewport: { width: 1440, height: 1000 },
        acceptDownloads: false,
      }),
    )
    return contextPromise
  }

  const captureOne = async (
    url: string,
    signal: AbortSignal,
  ): Promise<CaptureResult> => {
    if (!isHttpUrl(url)) {
      return captureError(url, 'Only HTTP and HTTPS URLs can be captured.')
    }
    if (signal.aborted) {
      return captureError(url, 'URL capture was aborted.')
    }

    let page: Page | undefined
    let policyError: string | undefined
    let cancelled = false
    try {
      const startedAt = now()
      const operation = (async () => {
        const activePage = await getContext().then((context) =>
          context.newPage(),
        )
        page = activePage
        if (cancelled || signal.aborted) {
          await activePage.close().catch(() => undefined)
          throw abortError()
        }
        activePage.on('popup', (popup) => {
          void popup.close().catch(() => undefined)
        })
        activePage.on('download', (download) => {
          void download.cancel().catch(() => undefined)
        })
        await activePage.route('**/*', async (route) => {
          const request = route.request()
          if (!isHttpUrl(request.url())) {
            policyError =
              'A redirect attempted to leave the HTTP/HTTPS URL policy.'
            await route.abort()
            return
          }
          if (
            request.isNavigationRequest() &&
            request.frame() === activePage.mainFrame() &&
            redirectCount(request) > MAX_REDIRECTS
          ) {
            policyError = 'URL capture allows at most five redirects.'
            await route.abort()
            return
          }
          await route.continue()
        })
        await activePage.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: NAVIGATION_TIMEOUT_MS,
        })
        const bytes = await activePage.screenshot({
          type: 'png',
          fullPage: false,
          animations: 'disabled',
        })
        if (!bytes) throw new Error('Screenshot bytes were unavailable.')
        return bytes
      })()
      const bytes = await raceCapture(
        operation,
        () => page,
        signal,
        Math.max(0, TOTAL_TIMEOUT_MS - (now() - startedAt)),
        () => {
          cancelled = true
        },
      )
      if (!page) throw new Error('Capture Page was unavailable.')
      return {
        url,
        finalUrl: page.url(),
        ok: true,
        mimeType: 'image/png',
        bytes,
      }
    } catch (error) {
      if (policyError) return captureError(url, policyError)
      if (signal.aborted) {
        return captureError(url, 'URL capture was aborted.')
      }
      const message = error instanceof Error ? error.message : ''
      if (/20 seconds/i.test(message)) {
        return captureError(url, 'URL capture exceeded 20 seconds.')
      }
      return captureError(url, 'This page could not be captured.')
    } finally {
      await page?.close().catch(() => undefined)
    }
  }

  return {
    async capture(urls, signal) {
      if (urls.length > MAX_URLS) {
        throw new Error('URL capture accepts at most four URLs.')
      }
      return Promise.all(urls.map((url) => captureOne(url, signal)))
    },
    async close() {
      if (closed) return
      closed = true
      const context = await contextPromise?.catch(() => undefined)
      await context?.close().catch(() => undefined)
      const browser = await browserPromise?.catch(() => undefined)
      await browser?.close().catch(() => undefined)
    },
  }
}
