import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DESIGN_FS_UNAVAILABLE, DesignFsError, designApi } from './api'

describe('designApi request (shared path)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects with DesignFsError when the plugin is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    )

    const err = designApi.listApps()
    await expect(err).rejects.toBeInstanceOf(DesignFsError)
    await expect(err).rejects.toMatchObject({ message: DESIGN_FS_UNAVAILABLE })
  })

  it('rejects with DesignFsError on non-JSON responses (SPA fallback)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!doctype html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )

    const err = designApi.listApps()
    await expect(err).rejects.toBeInstanceOf(DesignFsError)
    await expect(err).rejects.toMatchObject({ message: DESIGN_FS_UNAVAILABLE })
  })

  it('rejects with a plain-Error-compatible DesignFsError on JSON error bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'App not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const err = designApi.getApp('missing')
    await expect(err).rejects.toBeInstanceOf(Error)
    await expect(err).rejects.toMatchObject({
      status: 404,
      message: 'App not found',
    })
  })
})

describe('designApi.applyAsset', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws DesignFsError with needsSlot on 409', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'Choose Light, Dark, or Both for this style.',
          needsSlot: true,
          options: ['light', 'dark', 'both'],
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const err = designApi.applyAsset('designmd', 'dual', 'my-app')
    await expect(err).rejects.toBeInstanceOf(DesignFsError)
    await expect(err).rejects.toMatchObject({
      status: 409,
      needsSlot: true,
      options: ['light', 'dark', 'both'],
      message: 'Choose Light, Dark, or Both for this style.',
    })
  })

  it('throws DesignFsError on other apply failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'This style does not support the light slot.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      designApi.applyAsset('designmd', 'midnight', 'my-app', 'light'),
    ).rejects.toMatchObject({
      status: 400,
      message: 'This style does not support the light slot.',
    })
  })

  it('includes slot in request body when provided', async () => {
    const app = {
      id: 'my-app',
      name: 'My App',
      style: { dark: 'midnight' },
      layouts: ['sidebar-shell'],
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(app), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await designApi.applyAsset('designmd', 'midnight', 'my-app', 'dark')

    expect(fetchMock).toHaveBeenCalledWith(
      '/__design_fs/assets/designmd/midnight/apply',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ appId: 'my-app', slot: 'dark' }),
      }),
    )
  })

  it('omits slot from request body when not provided', async () => {
    const app = {
      id: 'my-app',
      name: 'My App',
      style: { light: 'sunny' },
      layouts: ['sidebar-shell'],
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(app), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await designApi.applyAsset('designmd', 'sunny', 'my-app')

    expect(fetchMock).toHaveBeenCalledWith(
      '/__design_fs/assets/designmd/sunny/apply',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ appId: 'my-app' }),
      }),
    )
  })
})

describe('designApi.removeAppStyle', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('DELETEs the style slot URL', async () => {
    const app = {
      id: 'my-app',
      name: 'My App',
      style: { dark: 'dual' },
      layouts: ['sidebar-shell'],
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(app), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await designApi.removeAppStyle('my-app', 'light')

    expect(fetchMock).toHaveBeenCalledWith(
      '/__design_fs/apps/my-app/style/light',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
