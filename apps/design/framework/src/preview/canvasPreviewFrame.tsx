import {
  Component,
  StrictMode,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { createRoot } from 'react-dom/client'
import { loadCanvasModule } from './loadCanvasModule'
import type { CanvasPreviewConfiguration } from './canvasPreviewDocument'
import './canvasReveal.css'
import '../styles/global.css'

declare global {
  var __canvasPreviewConfiguration:
    | CanvasPreviewConfiguration
    | undefined
}

type CanvasPreviewMessage =
  | {
      type: 'canvas-preview:ready'
      generation: string
    }
  | {
      type: 'canvas-preview:error'
      generation: string
      message: string
    }

const configuration = globalThis.__canvasPreviewConfiguration
delete globalThis.__canvasPreviewConfiguration

function post(message: CanvasPreviewMessage): void {
  window.parent.postMessage(message, '*')
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Canvas preview could not be loaded.'
}

class CanvasErrorBoundary extends Component<
  { children: ReactNode; generation: string },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: true } {
    return { failed: true }
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    post({
      type: 'canvas-preview:error',
      generation: this.props.generation,
      message: errorMessage(error),
    })
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

async function mount(): Promise<void> {
  if (
    !configuration ||
    typeof configuration.appId !== 'string' ||
    typeof configuration.componentFile !== 'string' ||
    typeof configuration.generation !== 'string'
  ) {
    throw new Error('Canvas preview configuration is invalid.')
  }
  document.documentElement.setAttribute(
    'data-theme',
    configuration.theme,
  )
  const Canvas = await loadCanvasModule(
    configuration.appId,
    configuration.componentFile,
  )
  if (!Canvas) {
    throw new Error(
      'Canvas not found / restart dev server after adding files if glob cache stale',
    )
  }
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('Canvas preview root could not be loaded.')
  }
  createRoot(rootElement).render(
    <StrictMode>
      <CanvasErrorBoundary generation={configuration.generation}>
        <Canvas />
      </CanvasErrorBoundary>
    </StrictMode>,
  )
  if (configuration.reveal) {
    const root = rootElement
    root.setAttribute('data-canvas-reveal', 'true')
    const children = Array.from(root.children) as HTMLElement[]
    children.forEach((el, index) => {
      el.style.setProperty('--reveal-index', String(index))
    })
    window.setTimeout(() => {
      root.removeAttribute('data-canvas-reveal')
      children.forEach((el) => el.style.removeProperty('--reveal-index'))
    }, 900)
  }
  requestAnimationFrame(() => {
    post({
      type: 'canvas-preview:ready',
      generation: configuration.generation,
    })
  })
}

void mount().catch((error: unknown) => {
  post({
    type: 'canvas-preview:error',
    generation: configuration?.generation ?? '',
    message: errorMessage(error),
  })
})
