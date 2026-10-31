import 'fake-indexeddb/auto'
import { expect, test } from 'bun:test'
import { BrowserCredentialStore } from '@/app/settings/credentials/browser'
import { credentialRef } from '@/app/settings/credentials/reference'

const ref = credentialRef('openai-compatible', 'api-key', 'scope-test')
test('simultaneous actor stores retain both encrypted keys', async () => {
  const a = new BrowserCredentialStore('c'.repeat(64)), b = new BrowserCredentialStore('d'.repeat(64))
  await Promise.all([a.write(ref, 'fixture-c'), b.write(ref, 'fixture-d')])
  expect(await new BrowserCredentialStore('c'.repeat(64)).read(ref)).toBe('fixture-c')
  expect(await new BrowserCredentialStore('d'.repeat(64)).read(ref)).toBe('fixture-d')
  await Promise.all([a.remove(ref), b.remove(ref)])
})
test('encrypted browser credentials are disjoint per actor namespace and preserve legacy', async () => {
  const legacy = new BrowserCredentialStore(), a = new BrowserCredentialStore('a'.repeat(64)), b = new BrowserCredentialStore('b'.repeat(64))
  await legacy.write(ref, 'fixture-legacy')
  expect(await a.read(ref)).toBeNull()
  await a.write(ref, 'fixture-a')
  expect(await b.read(ref)).toBeNull()
  await b.write(ref, 'fixture-b')
  expect(await new BrowserCredentialStore('a'.repeat(64)).read(ref)).toBe('fixture-a')
  expect(await new BrowserCredentialStore('b'.repeat(64)).read(ref)).toBe('fixture-b')
  expect(await legacy.read(ref)).toBe('fixture-legacy')
  await a.remove(ref); expect(await b.read(ref)).toBe('fixture-b'); expect(await legacy.read(ref)).toBe('fixture-legacy')
  await b.remove(ref); await legacy.remove(ref)
})
test('real encrypted backend composes with per-frame actor scope', async () => {
  const { ActorScopeController } = await import('@/app/ai/models/actor/scope')
  const { ActorCredentialStore } = await import('@/app/ai/models/actor/credential-store')
  const { ActorBrowserCredentialBackend } = await import('@/app/ai/models/actor/browser-credential-backend')
  const controller = new ActorScopeController(), backend = new ActorBrowserCredentialBackend()
  const a = new ActorCredentialStore(controller, await controller.activate('test-org', 'test-a'), backend)
  await a.write(ref, 'fixture-a')
  const b = new ActorCredentialStore(controller, await controller.activate('test-org', 'test-b'), backend)
  expect(await b.read(ref)).toBeNull()
  await b.write(ref, 'fixture-b')
  const again = new ActorCredentialStore(controller, await controller.activate('test-org', 'test-a'), backend)
  expect(await again.read(ref)).toBe('fixture-a')
  await again.remove(ref)
  const bAgain = new ActorCredentialStore(controller, await controller.activate('test-org', 'test-b'), backend)
  expect(await bAgain.read(ref)).toBe('fixture-b')
  await bAgain.remove(ref)
})
test('late encrypted write drains before actor reactivation can save a newer key', async () => {
  const { ActorScopeController } = await import('@/app/ai/models/actor/scope')
  const { ActorCredentialStore } = await import('@/app/ai/models/actor/credential-store')
  const { ActorBrowserCredentialBackend } = await import('@/app/ai/models/actor/browser-credential-backend')
  const controller = new ActorScopeController(), actual = new ActorBrowserCredentialBackend()
  let release!: () => void, delayed = true
  const backend = {
    read: actual.read.bind(actual), remove: actual.remove.bind(actual),
    async write(ns: string, key: typeof ref, value: string) {
      if (delayed) await new Promise<void>(resolve => { release = resolve })
      await actual.write(ns, key, value)
    }
  }
  const old = new ActorCredentialStore(controller, await controller.activate('race-org', 'actor-a'), backend)
  const oldWrite = old.write(ref, 'fixture-old').catch(() => undefined)
  await Promise.resolve()
  let activated = false
  const b = controller.activate('race-org', 'actor-b').then(scope => { activated = true; return scope })
  await new Promise<void>(resolve => { setTimeout(resolve, 0) }); expect(activated).toBe(false)
  delayed = false; release(); await oldWrite; await b
  const fresh = new ActorCredentialStore(controller, await controller.activate('race-org', 'actor-a'), backend)
  await fresh.write(ref, 'fixture-new')
  expect(await fresh.read(ref)).toBe('fixture-new')
  await fresh.remove(ref)
})
