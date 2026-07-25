import type { ThemeMode } from '@/lib/theme'

export type CanvasPreviewConfiguration = {
  appId: string
  componentFile: string
  generation: string
  moduleBase: string
  theme: ThemeMode
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function createCanvasPreviewDocument(
  configuration: CanvasPreviewConfiguration,
): string {
  const modulePath = (pathname: string) =>
    `${configuration.moduleBase}${pathname.replace(/^\//, '')}`
  const importMap = {
    imports: {
      '/@react-refresh': modulePath('/@react-refresh'),
      '/@vite/client': modulePath('/@vite/client'),
      '/node_modules/': modulePath('/node_modules/'),
      '/framework/src/preview/': modulePath(
        '/framework/src/preview/',
      ),
      '/framework/src/styles/': modulePath('/framework/src/styles/'),
      [`/apps/${configuration.appId}/`]: modulePath(
        `/apps/${configuration.appId}/`,
      ),
    },
  }
  return `<!doctype html>
<html lang="en" data-theme="${configuration.theme}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Canvas preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="importmap">${safeJson(importMap)}</script>
    <script type="module">
      const configuration = ${safeJson(configuration)}
      globalThis.__canvasPreviewConfiguration = configuration
      document.querySelector('script[type="module"]')?.remove()
      try {
        const RefreshRuntime = (await import(${safeJson(
          modulePath('/@react-refresh'),
        )})).default
        RefreshRuntime.injectIntoGlobalHook(window)
        window.$RefreshReg$ = () => {}
        window.$RefreshSig$ = () => (type) => type
        window.__vite_plugin_react_preamble_installed__ = true
        await import(${safeJson(modulePath('/@vite/client'))})
        await import(${safeJson(
          modulePath(
            '/framework/src/preview/canvasPreviewFrame.tsx',
          ),
        )})
      } catch (error) {
        const message = (
          error instanceof Error && error.message
            ? error.message
            : 'Canvas preview bootstrap could not be loaded.'
        ).slice(0, 4000)
        window.parent.postMessage(
          {
            type: 'canvas-preview:error',
            generation: configuration.generation,
            message,
          },
          '*',
        )
      }
    </script>
  </body>
</html>`
}
