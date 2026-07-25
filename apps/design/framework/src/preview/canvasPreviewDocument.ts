import type { ThemeMode } from '@/lib/theme'

export type CanvasPreviewConfiguration = {
  appId: string
  componentFile: string
  generation: string
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
  return `<!doctype html>
<html lang="en" data-theme="${configuration.theme}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Canvas preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      globalThis.__canvasPreviewConfiguration = ${safeJson(configuration)}
      document.querySelector('script[type="module"]')?.remove()
      const RefreshRuntime = (await import('/@react-refresh')).default
      RefreshRuntime.injectIntoGlobalHook(window)
      window.$RefreshReg$ = () => {}
      window.$RefreshSig$ = () => (type) => type
      window.__vite_plugin_react_preamble_installed__ = true
      await import('/@vite/client')
      await import('/framework/src/preview/canvasPreviewFrame.tsx')
    </script>
  </body>
</html>`
}
