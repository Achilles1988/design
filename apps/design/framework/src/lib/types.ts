import type { AppStyleSlots } from './styleSlots'
export type { AppStyleSlots, StyleApplySlot, StyleSlot } from './styleSlots'

export type AppConfig = {
  id: string
  name: string
  path?: string
  style: AppStyleSlots
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

export const DEFAULT_LAYOUT = 'sidebar-shell'
