import { describe, expect, it, vi } from "vitest"

import { createSerializedRunner } from "@/lib/serialized-runner"

/** A promise plus externally-callable resolve/reject, for controlling exact timing in tests. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("createSerializedRunner", () => {
  it("runs the function once for a single call", async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const schedule = createSerializedRunner(run)

    await schedule("a")

    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith("a")
  })

  it("coalesces calls made while one is in flight — only the latest superseded arg is dropped", async () => {
    const first = deferred<void>()
    const run = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
    const schedule = createSerializedRunner(run)

    const p1 = schedule("first")
    // "second" arrives while "first" is still in flight — it should be superseded
    // by "third" before it ever gets a chance to run.
    const p2 = schedule("second")
    const p3 = schedule("third")

    expect(run).toHaveBeenCalledTimes(1) // only "first" has actually started
    first.resolve()
    await Promise.all([p1, p2, p3])

    expect(run).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenNthCalledWith(1, "first")
    expect(run).toHaveBeenNthCalledWith(2, "third")
  })

  it("runs again for a call made after the previous run fully completed", async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const schedule = createSerializedRunner(run)

    await schedule("a")
    await schedule("b")

    expect(run).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenNthCalledWith(1, "a")
    expect(run).toHaveBeenNthCalledWith(2, "b")
  })

  it("still accepts and runs a new call after a previous run rejected", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined)
    const schedule = createSerializedRunner(run)

    await expect(schedule("a")).rejects.toThrow("boom")

    // If `inFlight` never got cleared on the throw, this would hang forever
    // (schedule() would keep returning the already-settled rejected promise
    // and `run` would never be called again).
    await schedule("b")

    expect(run).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenNthCalledWith(2, "b")
  })
})
