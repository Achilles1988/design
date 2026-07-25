import { describe, expect, it } from 'vitest'
import { createCanvasPreviewDocument } from './canvasPreviewDocument'

describe('createCanvasPreviewDocument', () => {
  const configuration = {
    appId: 'design',
    componentFile: 'Home.tsx',
    generation: 'design:home:0',
    moduleBase:
      '/__design_canvas_preview/00000000-0000-4000-8000-000000000001/',
    theme: 'light' as const,
  }

  it('routes every preview module prefix through the session capability', () => {
    const document = createCanvasPreviewDocument(configuration)

    expect(document).toContain('"/apps/design/"')
    expect(document).toContain(
      '/__design_canvas_preview/00000000-0000-4000-8000-000000000001/apps/design/',
    )
    expect(document).toContain(
      '/__design_canvas_preview/00000000-0000-4000-8000-000000000001/framework/src/preview/',
    )
    expect(document).not.toContain(
      "await import('/framework/src/preview/canvasPreviewFrame.tsx')",
    )
  })

  it('reports bootstrap import rejection instead of remaining loading', () => {
    const document = createCanvasPreviewDocument(configuration)
    const firstImport = document.indexOf('await import(')
    const catchBlock = document.indexOf('catch (error)')
    const errorMessage = document.indexOf('canvas-preview:error')

    expect(document.indexOf('try {')).toBeLessThan(firstImport)
    expect(catchBlock).toBeGreaterThan(firstImport)
    expect(errorMessage).toBeGreaterThan(catchBlock)
    expect(document).toContain(
      'generation: configuration.generation',
    )
    expect(document).toContain('.slice(0, 4000)')
  })
})
