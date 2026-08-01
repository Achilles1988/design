import { createPromiseDialogStore } from './promiseDialogStore'
import type { StyleApplySlot } from './types'

export type ChooseStyleSlotRequest = {
  options: StyleApplySlot[]
  resolve: (value: StyleApplySlot | null) => void
}

const store = createPromiseDialogStore<
  StyleApplySlot | null,
  ChooseStyleSlotRequest
>()

export const subscribeChooseStyleSlot = store.subscribe

/** Prompts for a light/dark/both slot; resolves `null` on cancel or when superseded. */
export function chooseStyleSlot(
  options: StyleApplySlot[],
): Promise<StyleApplySlot | null> {
  return store.open((resolve) => ({ options, resolve }), null)
}
