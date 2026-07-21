import type { ComponentType } from 'react'

const modules = import.meta.glob('../../../apps/*/canvases/*.tsx')

export async function loadCanvasModule(
  appId: string,
  componentFile: string,
): Promise<ComponentType | null> {
  const suffix = `/apps/${appId}/canvases/${componentFile}`
  const key = Object.keys(modules).find((k) => k.endsWith(suffix))
  if (!key) return null
  const loader = modules[key]
  if (!loader) return null
  const mod = (await loader()) as { default?: ComponentType }
  return mod.default ?? null
}
