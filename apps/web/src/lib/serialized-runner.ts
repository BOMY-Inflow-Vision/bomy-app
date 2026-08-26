/**
 * Ensures at most one `run` call is in flight at a time. A call made while
 * one is already running doesn't start a new one immediately — it's held as
 * "pending", overwriting any earlier pending call. Once the in-flight call
 * finishes, the runner immediately re-runs with only the *latest* pending
 * arg (superseded intermediate args are dropped, never run).
 *
 * Built for drag-reorder autosave: rapid drags shouldn't fire overlapping
 * writes, but every drag's caller should still get a promise that resolves
 * once its intent has actually been persisted (or superseded).
 */
export function createSerializedRunner<T>(
  run: (arg: T) => Promise<void>,
): (arg: T) => Promise<void> {
  let inFlight: Promise<void> | null = null
  let pending: T | undefined
  let hasPending = false

  async function drain(): Promise<void> {
    while (hasPending) {
      const arg = pending as T
      hasPending = false
      pending = undefined
      await run(arg)
    }
    inFlight = null
  }

  return function schedule(arg: T): Promise<void> {
    pending = arg
    hasPending = true
    inFlight ??= drain()
    return inFlight
  }
}
