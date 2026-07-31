import type { StyleApplySlot } from './types'

export type ChooseStyleSlotRequest = {
  options: StyleApplySlot[]
  resolve: (value: StyleApplySlot | null) => void
}

type ChooseStyleSlotListener = (request: ChooseStyleSlotRequest | null) => void

let active: ChooseStyleSlotRequest | null = null
const listeners = new Set<ChooseStyleSlotListener>()

function emit(request: ChooseStyleSlotRequest | null) {
  for (const listener of listeners) listener(request)
}

export function subscribeChooseStyleSlot(
  listener: ChooseStyleSlotListener,
): () => void {
  listeners.add(listener)
  listener(active)
  return () => {
    listeners.delete(listener)
  }
}

/** Prompts for a light/dark/both slot; resolves `null` on cancel or when superseded. */
export function chooseStyleSlot(
  options: StyleApplySlot[],
): Promise<StyleApplySlot | null> {
  return new Promise((resolve) => {
    const previous = active
    const request: ChooseStyleSlotRequest = {
      options,
      resolve: (value) => {
        if (active === request) {
          active = null
          emit(null)
        }
        resolve(value)
      },
    }
    active = request
    emit(active)
    if (previous) previous.resolve(null)
  })
}
