import { afterEach, describe, expect, it } from 'vitest'
import { chooseStyleSlot, subscribeChooseStyleSlot } from './chooseStyleSlot'
import type { StyleApplySlot } from './types'

afterEach(() => {
  const box: { dismiss: ((value: StyleApplySlot | null) => void) | null } = {
    dismiss: null,
  }
  const unsub = subscribeChooseStyleSlot((request) => {
    box.dismiss = request ? (value) => request.resolve(value) : null
  })
  box.dismiss?.(null)
  unsub()
})

describe('chooseStyleSlot', () => {
  it('emits the options and resolves with the chosen slot', async () => {
    const box: {
      options: StyleApplySlot[] | null
      resolve: ((value: StyleApplySlot | null) => void) | null
    } = { options: null, resolve: null }
    const unsub = subscribeChooseStyleSlot((request) => {
      box.options = request?.options ?? null
      box.resolve = request ? (value) => request.resolve(value) : null
    })

    const pending = chooseStyleSlot(['light', 'dark', 'both'])
    expect(box.options).toEqual(['light', 'dark', 'both'])
    box.resolve!('dark')
    await expect(pending).resolves.toBe('dark')
    expect(box.options).toBeNull()
    unsub()
  })

  it('resolves null when cancelled', async () => {
    const box: { resolve: ((value: StyleApplySlot | null) => void) | null } = {
      resolve: null,
    }
    const unsub = subscribeChooseStyleSlot((request) => {
      box.resolve = request ? (value) => request.resolve(value) : null
    })

    const pending = chooseStyleSlot(['light', 'dark'])
    box.resolve!(null)
    await expect(pending).resolves.toBeNull()
    unsub()
  })

  it('resolves a superseded chooser with null without emitting null in between', async () => {
    const optionsSeen: Array<StyleApplySlot[] | null> = []
    const box: {
      options: StyleApplySlot[] | null
      resolve: ((value: StyleApplySlot | null) => void) | null
    } = { options: null, resolve: null }
    const unsub = subscribeChooseStyleSlot((request) => {
      box.options = request?.options ?? null
      optionsSeen.push(box.options)
      box.resolve = request ? (value) => request.resolve(value) : null
    })

    const first = chooseStyleSlot(['light'])
    const second = chooseStyleSlot(['dark'])

    expect(optionsSeen).toEqual([null, ['light'], ['dark']])
    await expect(first).resolves.toBeNull()
    expect(box.options).toEqual(['dark'])

    box.resolve!('both')
    await expect(second).resolves.toBe('both')
    unsub()
  })
})
