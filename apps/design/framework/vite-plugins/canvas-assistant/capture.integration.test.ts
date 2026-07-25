import {
  createServer,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import {
  chromium,
  type Browser,
  type Download,
  type LaunchOptions,
  type Page,
} from 'playwright'
import {
  createUrlCaptureService,
  type UrlCaptureService,
} from './capture'

type BrowserEvidence = {
  pages: Page[]
  downloads: Download[]
  navigationRedirectDepths: Array<{
    url: string
    depth: number
  }>
}

const openResponses = new Set<ServerResponse>()
let baseUrl = ''
let server = createServer()
let popupRequests = 0
let downloadRequests = 0
let abortRequests = 0

function html(body: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      :root { color-scheme: light; font-family: system-ui, sans-serif; }
      body { margin: 0; min-height: 1800px; background: linear-gradient(#123456, #f7f0dc); }
      main { margin: 80px; padding: 48px; color: white; border: 8px solid #f7f0dc; }
    </style>
  </head>
  <body>${body}</body>
</html>`
}

function pngDimensions(bytes: Uint8Array): {
  width: number
  height: number
} {
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  )
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  }
}

function launchWithEvidence(evidence: BrowserEvidence) {
  return async (options: LaunchOptions): Promise<Browser> => {
    const browser = await chromium.launch(options)
    return new Proxy(browser, {
      get(target, property) {
        if (property === 'newContext') {
          return async (...args: Parameters<Browser['newContext']>) => {
            const context = await target.newContext(...args)
            context.on('request', (request) => {
              if (!request.isNavigationRequest()) return
              let depth = 0
              let previous = request.redirectedFrom()
              while (previous) {
                depth += 1
                previous = previous.redirectedFrom()
              }
              evidence.navigationRedirectDepths.push({
                url: request.url(),
                depth,
              })
            })
            context.on('page', (page) => {
              evidence.pages.push(page)
              page.on('download', (download) => {
                evidence.downloads.push(download)
              })
            })
            return context
          }
        }
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }
}

function captureService(evidence: BrowserEvidence): UrlCaptureService {
  return createUrlCaptureService({
    launch: launchWithEvidence(evidence),
    now: () => Date.now(),
  })
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture.test')
    if (url.pathname === '/styled') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.end(html('<main>Styled reference</main>'))
      return
    }

    const redirect = /^\/redirect\/(\d+)$/u.exec(url.pathname)
    if (redirect) {
      const remaining = Number(redirect[1])
      response.statusCode = 302
      response.setHeader(
        'Location',
        remaining === 0 ? '/styled' : `/redirect/${remaining - 1}`,
      )
      response.end()
      return
    }

    if (url.pathname === '/interactions') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.end(html(`
        <main>Popup and download reference</main>
        <script>
          window.open('/popup-target', '_blank')
          const link = document.createElement('a')
          link.href = '/download'
          link.download = 'reference.txt'
          link.click()
        </script>
      `))
      return
    }

    if (url.pathname === '/popup-target') {
      popupRequests += 1
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.end(html('<main>Popup target</main>'))
      return
    }

    if (url.pathname === '/download') {
      downloadRequests += 1
      response.setHeader(
        'Content-Disposition',
        'attachment; filename="reference.txt"',
      )
      response.setHeader('Content-Type', 'text/plain')
      response.end('download must not be accepted')
      return
    }

    if (url.pathname === '/slow' || url.pathname === '/abort') {
      if (url.pathname === '/abort') abortRequests += 1
      openResponses.add(response)
      response.on('close', () => openResponses.delete(response))
      return
    }

    response.statusCode = 404
    response.end('Not found')
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  for (const response of openResponses) response.destroy()
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('real Playwright URL capture', () => {
  it('captures a styled viewport PNG and keeps independent results in input order', async () => {
    const evidence: BrowserEvidence = {
      pages: [],
      downloads: [],
      navigationRedirectDepths: [],
    }
    const service = captureService(evidence)
    try {
      const urls = [
        `${baseUrl}/styled`,
        'file:///not-capturable',
        `${baseUrl}/styled?second`,
      ]

      const results = await service.capture(
        urls,
        new AbortController().signal,
      )

      expect(results.map(({ url, ok }) => ({ url, ok }))).toEqual([
        { url: urls[0], ok: true },
        { url: urls[1], ok: false },
        { url: urls[2], ok: true },
      ])
      const successful = results.filter(
        (result): result is typeof result & { bytes: Uint8Array } =>
          result.ok && result.bytes !== undefined,
      )
      expect(successful).toHaveLength(2)
      expect(successful.map((result) => pngDimensions(result.bytes))).toEqual([
        { width: 1440, height: 1000 },
        { width: 1440, height: 1000 },
      ])
    } finally {
      await service.close()
    }
  }, 60_000)

  it('allows five redirects and rejects the sixth redirect', async () => {
    const evidence: BrowserEvidence = {
      pages: [],
      downloads: [],
      navigationRedirectDepths: [],
    }
    const service = captureService(evidence)
    try {
      const five = `${baseUrl}/redirect/4`
      const six = `${baseUrl}/redirect/5`
      const results = await service.capture(
        [five, six],
        new AbortController().signal,
      )

      expect(results[0]).toMatchObject({
        url: five,
        finalUrl: `${baseUrl}/styled`,
        ok: true,
      })
      expect(
        Math.max(...evidence.navigationRedirectDepths.map(({ depth }) => depth)),
      ).toBe(6)
      expect(results[1]).toEqual({
        url: six,
        ok: false,
        error: 'URL capture allows at most five redirects.',
      })
    } finally {
      await service.close()
    }
  }, 60_000)

  it('enforces the real fifteen-second DOMContentLoaded timeout', async () => {
    const service = captureService({
      pages: [],
      downloads: [],
      navigationRedirectDepths: [],
    })
    try {
      const startedAt = Date.now()
      const [result] = await service.capture(
        [`${baseUrl}/slow`],
        new AbortController().signal,
      )
      const elapsed = Date.now() - startedAt

      expect(result).toMatchObject({
        url: `${baseUrl}/slow`,
        ok: false,
        error: 'This page could not be captured.',
      })
      expect(elapsed).toBeGreaterThanOrEqual(14_000)
      expect(elapsed).toBeLessThan(20_000)
    } finally {
      await service.close()
    }
  }, 45_000)

  it('closes popup pages, denies downloads, and aborts active page work', async () => {
    const evidence: BrowserEvidence = {
      pages: [],
      downloads: [],
      navigationRedirectDepths: [],
    }
    const service = captureService(evidence)
    try {
      const [interaction] = await service.capture(
        [`${baseUrl}/interactions`],
        new AbortController().signal,
      )

      expect(interaction?.ok).toBe(true)
      expect(popupRequests).toBeGreaterThan(0)
      expect(downloadRequests).toBeGreaterThan(0)
      expect(evidence.pages.length).toBeGreaterThan(1)
      expect(evidence.pages.slice(1).some((page) => page.isClosed())).toBe(true)
      expect(evidence.downloads).toHaveLength(1)
      await expect(evidence.downloads[0]!.failure()).resolves.not.toBeNull()

      const controller = new AbortController()
      const pending = service.capture([`${baseUrl}/abort`], controller.signal)
      await expect.poll(() => abortRequests).toBeGreaterThan(0)
      controller.abort()

      await expect(pending).resolves.toEqual([{
        url: `${baseUrl}/abort`,
        ok: false,
        error: 'URL capture was aborted.',
      }])
      expect(evidence.pages.at(-1)?.isClosed()).toBe(true)
    } finally {
      await service.close()
    }
  }, 30_000)
})
