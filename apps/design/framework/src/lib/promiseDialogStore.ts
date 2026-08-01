/**
 * Shared singleton subscribe/emit pattern behind confirmTip and
 * chooseStyleSlot: one dialog request is active at a time; opening a new
 * one resolves the previous request with a caller-provided default (never
 * emitting `null` in between) instead of leaving it pending.
 */
export type PromiseDialogListener<TRequest> = (
  request: TRequest | null,
) => void

export function createPromiseDialogStore<
  TValue,
  TRequest extends { resolve: (value: TValue) => void },
>() {
  let active: TRequest | null = null
  const listeners = new Set<PromiseDialogListener<TRequest>>()

  function emit(request: TRequest | null) {
    for (const listener of listeners) listener(request)
  }

  function subscribe(listener: PromiseDialogListener<TRequest>): () => void {
    listeners.add(listener)
    listener(active)
    return () => {
      listeners.delete(listener)
    }
  }

  function open(
    buildRequest: (resolve: (value: TValue) => void) => TRequest,
    supersededValue: TValue,
  ): Promise<TValue> {
    return new Promise((resolve) => {
      const previous = active
      const request = buildRequest((value) => {
        if (active === request) {
          active = null
          emit(null)
        }
        resolve(value)
      })
      active = request
      emit(active)
      if (previous) previous.resolve(supersededValue)
    })
  }

  return { subscribe, open }
}
