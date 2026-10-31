import { describe, expect, it } from 'bun:test'
import { ActorScopeController } from '@/app/ai/models/actor/scope'
import { ActorCredentialStore } from '@/app/ai/models/actor/credential-store'

describe('actor credential scope boundary', () => {
  it('preserves ownerless legacy and restores actor A without exposing it to B', async () => {
    const values = new Map<string, string>([['legacy:provider', 'legacy-private']])
    const backend = {
      async read(ns: string, ref: string) { return values.get(`${ns}:${ref}`) ?? null },
      async write(ns: string, ref: string, value: string) { values.set(`${ns}:${ref}`, value) },
      async remove(ns: string, ref: string) { values.delete(`${ns}:${ref}`) }
    }
    const controller = new ActorScopeController()
    const a = new ActorCredentialStore(controller, await controller.activate('org', 'a'), backend)
    await a.write('provider', 'a-private')
    const b = new ActorCredentialStore(controller, await controller.activate('org', 'b'), backend)
    expect(await b.read('provider')).toBeNull()
    await b.write('provider', 'b-private')
    await expect(a.read('provider')).rejects.toThrow('superseded')
    const again = new ActorCredentialStore(controller, await controller.activate('org', 'a'), backend)
    expect(await again.read('provider')).toBe('a-private')
    expect(values.get('legacy:provider')).toBe('legacy-private')
  })
  it('does not deliver an old read after a switch', async () => {
    let finish!: (value: string) => void
    const backend = { read: () => new Promise<string>(resolve => { finish = resolve }), async write() { await Promise.resolve() }, async remove() { await Promise.resolve() } }
    const controller = new ActorScopeController()
    const store = new ActorCredentialStore(controller, await controller.activate('org', 'a'), backend)
    const pending = store.read('provider')
    await controller.activate('org', 'b')
    finish('a-private')
    await expect(pending).rejects.toThrow('superseded')
  })
})
it('drains old writes and removes before reactivating the same actor', async () => {
  const values = new Map<string, string>()
  let finish!: () => void
  let block = false
  const backend = {
    async read(ns: string, ref: string) { return values.get(`${ns}:${ref}`) ?? null },
    async write(ns: string, ref: string, value: string) { if (block) await new Promise<void>(resolve => { finish = resolve }); values.set(`${ns}:${ref}`, value) },
    async remove(ns: string, ref: string) { if (block) await new Promise<void>(resolve => { finish = resolve }); values.delete(`${ns}:${ref}`) }
  }
  const c = new ActorScopeController(), a = new ActorCredentialStore(c, await c.activate('org', 'a'), backend)
  block = true
  const oldWrite = a.write('key', 'old').catch(() => undefined)
  await Promise.resolve()
  let switched = false
  const switching = c.activate('org', 'b').then(scope => { switched = true; return scope })
  await new Promise<void>(resolve => { setTimeout(resolve, 0) })
  expect(switched).toBe(false)
  block = false; finish(); await oldWrite; await switching
  const next = new ActorCredentialStore(c, await c.activate('org', 'a'), backend)
  await next.write('key', 'new')
  expect(await next.read('key')).toBe('new')
  block = true
  const oldRemove = next.remove('key').catch(() => undefined)
  await Promise.resolve()
  switched = false
  const secondSwitch = c.activate('org', 'b').then(scope => { switched = true; return scope })
  await new Promise<void>(resolve => { setTimeout(resolve, 0) })
  expect(switched).toBe(false)
  block = false; finish(); await oldRemove; await secondSwitch
  const final = new ActorCredentialStore(c, await c.activate('org', 'a'), backend)
  await final.write('key', 'newer')
  expect(await final.read('key')).toBe('newer')
})
