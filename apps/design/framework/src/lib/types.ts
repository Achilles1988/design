export type AppConfig = {
  id: string
  name: string
  path?: string
  style: string
  /** Installed layout package ids for this App (order preserved). */
  layouts: string[]
}

export type CanvasEntry = {
  id: string
  name: string
  component: string
}

export type CanvasesFile = {
  canvases: CanvasEntry[]
}

export type AssetKind = 'designmd' | 'layoutmd'

export type AssetEntry = {
  id: string
  name: string
  previewUrl: string
}

export const DEFAULT_STYLE = 'dashboard'
export const DEFAULT_LAYOUT = 'sidebar-shell'
