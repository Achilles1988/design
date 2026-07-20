export type AppConfig = {
  id: string
  name: string
  path?: string
  style: string
  layout: string
}

export type PageEntry = {
  id: string
  name: string
  component: string
}

export type PagesFile = {
  pages: PageEntry[]
}

export const DEFAULT_STYLE = 'dashboard'
export const DEFAULT_LAYOUT = 'sidebar-shell'
