import { afterEach, describe, expect, it } from 'vitest'
import { confirmTip, subscribeConfirmTip } from './confirmTip'

afterEach(() => {
  const box: { dismiss: ((value: boolean) => void) | null } = { dismiss: null }
  const unsub = subscribeConfirmTip((request) => {
    box.dismiss = request ? (value) => request.resolve(value) : null
  })
  box.dismiss?.(false)
  unsub()
})

describe('confirmTip', () => {
  it('emits the tip and resolves true when confirmed', async () => {
    const box: {
      message: string | null
      resolve: ((value: boolean) => void) | null
    } = { message: null, resolve: null }
    const unsub = subscribeConfirmTip((request) => {
      box.message = request?.message ?? null
      box.resolve = request ? (value) => request.resolve(value) : null
    })

    const pending = confirmTip({ message: 'Delete this?' })
    expect(box.message).toBe('Delete this?')
    box.resolve!(true)
    await expect(pending).resolves.toBe(true)
    expect(box.message).toBeNull()
    unsub()
  })

  it('resolves false when dismissed', async () => {
    const box: { resolve: ((value: boolean) => void) | null } = {
      resolve: null,
    }
    const unsub = subscribeConfirmTip((request) => {
      box.resolve = request ? (value) => request.resolve(value) : null
    })

    const pending = confirmTip({ message: 'Cancel me' })
    box.resolve!(false)
    await expect(pending).resolves.toBe(false)
    unsub()
  })

  it('replaces an open tip without emitting null in between', async () => {
    const messages: Array<string | null> = []
    const box: {
      message: string | null
      resolve: ((value: boolean) => void) | null
    } = { message: null, resolve: null }
    const unsub = subscribeConfirmTip((request) => {
      box.message = request?.message ?? null
      messages.push(box.message)
      box.resolve = request ? (value) => request.resolve(value) : null
    })

    const first = confirmTip({ message: 'first' })
    const second = confirmTip({ message: 'second' })

    expect(messages).toEqual([null, 'first', 'second'])
    await expect(first).resolves.toBe(false)
    expect(box.message).toBe('second')

    box.resolve!(true)
    await expect(second).resolves.toBe(true)
    unsub()
  })
})
