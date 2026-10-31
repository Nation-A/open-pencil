import { describe, expect, it } from 'bun:test'
import { ActorScopeController } from '@/app/ai/models/actor/scope'

describe('per-frame actor scope', () => {
  it('isolates org and actor, restores namespace on return, and aborts stale work', async () => {
    const frame = new ActorScopeController()
    const a = await frame.activate('org', 'actor-a')
    const b = await frame.activate('org', 'actor-b')
    expect(a.signal.aborted).toBe(true)
    expect(frame.isCurrent(a)).toBe(false)
    expect(b.namespace).not.toBe(a.namespace)
    const a2 = await frame.activate('org', 'actor-a')
    expect(a2.namespace).toBe(a.namespace)
    expect(a2.epoch).not.toBe(a.epoch)
    expect((await frame.activate('other-org', 'actor-a')).namespace).not.toBe(a.namespace)
  })
  it('rejects empty identity and does not let a pending old activation win', async () => {
    const frame = new ActorScopeController()
    const prior = await frame.activate('org', 'prior')
    await expect(frame.activate('', 'actor')).rejects.toThrow()
    expect(prior.signal.aborted).toBe(true)
    expect(frame.current()).toBeNull()
    const first = frame.activate('org', 'first')
    const second = frame.activate('org', 'second')
    await expect(first).rejects.toThrow('superseded')
    expect(frame.isCurrent(await second)).toBe(true)
  })
  it('keeps frame controllers independent', async () => {
    const one = new ActorScopeController(), two = new ActorScopeController()
    const a = await one.activate('org', 'a'), b = await two.activate('org', 'b')
    one.invalidate()
    expect(a.signal.aborted).toBe(true)
    expect(two.isCurrent(b)).toBe(true)
  })
})
