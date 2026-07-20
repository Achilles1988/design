import type { AppConfig, PageEntry } from './types'

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data = (await res.json().catch(() => ({}))) as {
    error?: unknown
  }
  if (!res.ok) {
    throw new Error(
      typeof data.error === 'string' ? data.error : res.statusText,
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
  listPages: (appId: string) =>
    request<PageEntry[]>(`/__design_fs/apps/${appId}/pages`),
  addPage: (appId: string, body: { id: string; name: string }) =>
    request<PageEntry>(`/__design_fs/apps/${appId}/pages`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deletePage: (appId: string, pageId: string) =>
    request<{ ok: true }>(`/__design_fs/apps/${appId}/pages/${pageId}`, {
      method: 'DELETE',
    }),
}
