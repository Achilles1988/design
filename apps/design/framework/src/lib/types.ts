export type AppConfig = {
  id: string
  name: string
  path?: string
  style: string
  layout: string
}

export type CanvasEntry = {
  id: string
  name: string
  component: string
}

export type CanvasesFile = {
  canvases: CanvasEntry[]
}

export const DEFAULT_STYLE = 'dashboard'
export const DEFAULT_LAYOUT = 'sidebar-shell'
