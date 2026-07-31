import type {
  AppConfig,
  AssetEntry,
  AssetKind,
  CanvasEntry,
  StyleApplySlot,
  StyleSlot,
} from './types'

/** Shown when `/__design_fs` is missing (e.g. `vite preview` / production). */
export const DESIGN_FS_UNAVAILABLE =
  'Start with npm run dev to manage apps'

type DesignFsErrorBody = {
  error?: unknown
  needsSlot?: boolean
  options?: StyleApplySlot[]
}

export class DesignFsError extends Error {
  status: number
  needsSlot?: boolean
  options?: StyleApplySlot[]

  constructor(
    message: string,
    status: number,
    extras?: Pick<DesignFsError, 'needsSlot' | 'options'>,
  ) {
    super(message)
    this.name = 'DesignFsError'
    this.status = status
    if (extras?.needsSlot !== undefined) this.needsSlot = extras.needsSlot
    if (extras?.options !== undefined) this.options = extras.options
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new Error(DESIGN_FS_UNAVAILABLE)
  }

  const contentType = res.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')
  const data = isJson
    ? ((await res.json().catch(() => null)) as DesignFsErrorBody | null)
    : null

  // Plugin absent: HTML SPA fallback (often 200) or non-JSON 404.
  if (data === null) {
    throw new Error(DESIGN_FS_UNAVAILABLE)
  }

  if (!res.ok) {
    throw new Error(
      typeof data.error === 'string' ? data.error : res.statusText,
    )
  }
  return data as T
}

async function requestDesignFs<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new Error(DESIGN_FS_UNAVAILABLE)
  }

  const contentType = res.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')
  const data = isJson
    ? ((await res.json().catch(() => null)) as DesignFsErrorBody | null)
    : null

  if (data === null) {
    throw new Error(DESIGN_FS_UNAVAILABLE)
  }

  if (!res.ok) {
    throw new DesignFsError(
      typeof data.error === 'string' ? data.error : res.statusText,
      res.status,
      {
        needsSlot: data.needsSlot,
        options: data.options,
      },
    )
  }
  return data as T
}

export const designApi = {
  listApps: () => request<AppConfig[]>('/__design_fs/apps'),
  getApp: (id: string) => request<AppConfig>(`/__design_fs/apps/${id}`),
  createApp: (body: { id: string; name: string; path?: string }) =>
    request<AppConfig>('/__design_fs/apps', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteApp: (id: string) =>
    request<{ ok: true }>(`/__design_fs/apps/${id}`, { method: 'DELETE' }),
  removeAppLayout: (appId: string, layoutId: string) =>
    request<AppConfig>(
      `/__design_fs/apps/${appId}/layouts/${encodeURIComponent(layoutId)}`,
      { method: 'DELETE' },
    ),
  removeAppStyle: (appId: string, slot: StyleSlot) =>
    requestDesignFs<AppConfig>(
      `/__design_fs/apps/${appId}/style/${slot}`,
      { method: 'DELETE' },
    ),
  listCanvases: (appId: string) =>
    request<CanvasEntry[]>(`/__design_fs/apps/${appId}/canvases`),
  addCanvas: (appId: string, body: { id: string; name: string }) =>
    request<CanvasEntry>(`/__design_fs/apps/${appId}/canvases`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteCanvas: (appId: string, canvasId: string) =>
    request<{ ok: true }>(
      `/__design_fs/apps/${appId}/canvases/${encodeURIComponent(canvasId)}`,
      {
        method: 'DELETE',
      },
    ),
  renameCanvas: (
    appId: string,
    canvasId: string,
    body: { id: string; name: string },
  ) =>
    request<CanvasEntry>(
      `/__design_fs/apps/${appId}/canvases/${encodeURIComponent(canvasId)}/rename`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),
  listAssets: (kind: AssetKind) =>
    request<AssetEntry[]>(`/__design_fs/assets/${kind}`),
  downloadAssetUrl: (kind: AssetKind, id: string) =>
    `/__design_fs/assets/${kind}/${encodeURIComponent(id)}/download`,
  applyAsset: (
    kind: AssetKind,
    id: string,
    appId: string,
    slot?: StyleApplySlot,
  ) =>
    requestDesignFs<AppConfig>(
      `/__design_fs/assets/${kind}/${encodeURIComponent(id)}/apply`,
      {
        method: 'POST',
        body: JSON.stringify({
          appId,
          ...(slot !== undefined ? { slot } : {}),
        }),
      },
    ),
}
