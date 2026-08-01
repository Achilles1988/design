import { describe, expect, it } from 'vitest'
import { createPromiseDialogStore } from './promiseDialogStore'

type Request = { label: string; resolve: (value: string) => void }

describe('createPromiseDialogStore', () => {
  it('emits the open request and resolves with the chosen value', async () => {
    const store = createPromiseDialogStore<string, Request>()
    const seen: Array<string | null> = []
    const unsub = store.subscribe((req) => seen.push(req?.label ?? null))

    const pending = store.open((resolve) => ({ label: 'first', resolve }), 'default')
    expect(seen).toEqual([null, 'first'])

    let resolveFn: ((value: string) => void) | undefined
    store.subscribe((req) => {
      resolveFn = req?.resolve
    })
    resolveFn!('chosen')

    await expect(pending).resolves.toBe('chosen')
    expect(seen).toEqual([null, 'first', null])
    unsub()
  })

  it('resolves a superseded request with the default value without emitting null in between', async () => {
    const store = createPromiseDialogStore<string, Request>()
    const seen: Array<string | null> = []
    const unsub = store.subscribe((req) => seen.push(req?.label ?? null))

    const first = store.open((resolve) => ({ label: 'first', resolve }), 'default')
    store.open((resolve) => ({ label: 'second', resolve }), 'default')

    expect(seen).toEqual([null, 'first', 'second'])
    await expect(first).resolves.toBe('default')
    unsub()
  })
})
