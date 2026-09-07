/**
 * Tests for the shared model-call queue.
 *
 * The properties that matter: never more than the limit at once, first come
 * first served, and a slot always comes back — including when the work throws,
 * because a leaked slot stops the queue for everyone.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import { QUEUE_LIMIT, queueStatus, resetQueue, withSlot } from "./queue.ts"

const tick = () => new Promise((resolve) => setTimeout(resolve, 10))

function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => resetQueue())

describe("withSlot", () => {
  it("never runs more than the limit at once", async () => {
    let inFlight = 0
    let peak = 0

    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        withSlot(`t${i}`, async () => {
          inFlight += 1
          peak = Math.max(peak, inFlight)
          await tick()
          inFlight -= 1
        }),
      ),
    )

    assert.ok(peak <= QUEUE_LIMIT, `peak ${peak} exceeded limit ${QUEUE_LIMIT}`)
    assert.equal(inFlight, 0)
  })

  it("serves waiters in the order they arrived", async () => {
    const order: string[] = []
    const gates = Array.from({ length: QUEUE_LIMIT }, () => deferred())

    // Fill every slot so the rest have to queue.
    const holders = gates.map((gate, i) =>
      withSlot(`hold${i}`, async () => {
        await gate.promise
      }),
    )
    await tick()

    const queued = ["a", "b", "c"].map((id) =>
      withSlot(id, async () => {
        order.push(id)
      }),
    )
    await tick()

    gates.forEach((gate) => gate.resolve())
    await Promise.all([...holders, ...queued])

    assert.deepEqual(order, ["a", "b", "c"])
  })

  it("returns the slot when the work throws", async () => {
    await assert.rejects(
      withSlot("boom", async () => {
        throw new Error("failed")
      }),
    )

    // A leaked slot would leave this permanently queued.
    let ran = false
    await withSlot("after", async () => {
      ran = true
    })
    assert.equal(ran, true)
    assert.equal(queueStatus().running, 0)
  })

  it("passes the result through", async () => {
    assert.equal(await withSlot("x", async () => 42), 42)
  })
})

describe("queueStatus", () => {
  it("reports 0 for a call that is running", async () => {
    const gate = deferred()
    const held = withSlot("running-one", async () => {
      await gate.promise
    })
    await tick()

    assert.equal(queueStatus("running-one").position, 0)
    assert.equal(queueStatus().running, 1)

    gate.resolve()
    await held
  })

  it("counts how many are ahead of a waiting ticket", async () => {
    const gates = Array.from({ length: QUEUE_LIMIT }, () => deferred())
    const holders = gates.map((gate, i) => withSlot(`h${i}`, () => gate.promise))
    await tick()

    const queued = ["first", "second"].map((id) => withSlot(id, async () => {}))
    await tick()

    assert.equal(queueStatus("first").position, 0)
    assert.equal(queueStatus("second").position, 1)
    assert.equal(queueStatus("first").mine, 1)
    assert.equal(queueStatus().waiting, 2)

    gates.forEach((gate) => gate.resolve())
    await Promise.all([...holders, ...queued])
  })

  it("reports -1 for a ticket it has never seen, rather than 0", () => {
    assert.equal(queueStatus("nobody").position, -1)
    assert.equal(queueStatus().position, -1)
  })

  it("is empty once everything settles", async () => {
    await Promise.all(["p", "q", "r"].map((id) => withSlot(id, async () => tick())))
    assert.deepEqual(queueStatus(), {
      position: -1,
      mine: 0,
      others: 0,
      waiting: 0,
      running: 0,
    })
  })
})

describe("shared tickets", () => {
  it("counts calls, not tickets — one run's eight calls still obey the cap", async () => {
    // Every call of a run shares a ticket. Counting distinct tickets would see
    // "one thing running" and let the whole batch through at once.
    let inFlight = 0
    let peak = 0

    await Promise.all(
      Array.from({ length: 8 }, () =>
        withSlot("one-run", async () => {
          inFlight += 1
          peak = Math.max(peak, inFlight)
          await tick()
          inFlight -= 1
        }),
      ),
    )

    assert.ok(peak <= QUEUE_LIMIT, `peak ${peak} exceeded limit ${QUEUE_LIMIT}`)
  })

  it("reports people ahead, not calls ahead", async () => {
    const gates = Array.from({ length: QUEUE_LIMIT }, () => deferred())
    const holders = gates.map((gate, i) => withSlot(`h${i}`, () => gate.promise))
    await tick()

    // One earlier run queues four calls; ours should read as one person ahead.
    const theirs = Array.from({ length: 4 }, () => withSlot("them", async () => {}))
    const ours = withSlot("us", async () => {})
    await tick()

    assert.equal(queueStatus("them").position, 0)
    assert.equal(queueStatus("us").position, 1)
    // Four of theirs queued, one of ours, and each sees the other as company.
    assert.equal(queueStatus("them").mine, 4)
    assert.equal(queueStatus("us").mine, 1)
    assert.ok(queueStatus("us").others >= 1)

    gates.forEach((gate) => gate.resolve())
    await Promise.all([...holders, ...theirs, ours])
    assert.equal(queueStatus().running, 0)
  })
})


describe("mine", () => {
  it("reports a run's own queued calls even while one of them runs", async () => {
    const gate = deferred()
    const calls = Array.from({ length: 5 }, () =>
      withSlot("batch", async () => {
        await gate.promise
      }),
    )
    await tick()

    const status = queueStatus("batch")
    // Some are in flight, the rest are queued — that is still a wait worth
    // showing, even though nobody else is ahead.
    assert.equal(status.position, 0)
    assert.ok(status.mine > 0, "expected queued calls of its own")

    gate.resolve()
    await Promise.all(calls)
    assert.equal(queueStatus("batch").mine, 0)
  })
})
