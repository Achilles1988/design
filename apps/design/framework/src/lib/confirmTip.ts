import { createPromiseDialogStore } from './promiseDialogStore'

export type ConfirmTipOptions = {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export type ConfirmTipRequest = ConfirmTipOptions & {
  resolve: (value: boolean) => void
}

const store = createPromiseDialogStore<boolean, ConfirmTipRequest>()

export const subscribeConfirmTip = store.subscribe

export function confirmTip(options: ConfirmTipOptions): Promise<boolean> {
  return store.open((resolve) => ({ ...options, resolve }), false)
}
