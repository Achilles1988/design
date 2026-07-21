export type ConfirmTipOptions = {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmTipRequest = ConfirmTipOptions & {
  resolve: (value: boolean) => void
}

type ConfirmTipListener = (request: ConfirmTipRequest | null) => void

let active: ConfirmTipRequest | null = null
const listeners = new Set<ConfirmTipListener>()

function emit(request: ConfirmTipRequest | null) {
  for (const listener of listeners) listener(request)
}

export function subscribeConfirmTip(listener: ConfirmTipListener): () => void {
  listeners.add(listener)
  listener(active)
  return () => {
    listeners.delete(listener)
  }
}

export function confirmTip(options: ConfirmTipOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const previous = active
    const request: ConfirmTipRequest = {
      ...options,
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
    if (previous) previous.resolve(false)
  })
}
