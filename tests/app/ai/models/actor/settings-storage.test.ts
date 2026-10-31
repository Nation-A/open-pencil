import { expect, test } from 'bun:test'
import { ActorScopeController } from '@/app/ai/models/actor/scope'
import { ActorSettingsStorage } from '@/app/ai/models/actor/settings-storage'

class MemoryStorage implements Storage {
  #values = new Map<string, string>()
  get length() { return this.#values.size }
  clear() { this.#values.clear() }
  getItem(key: string) { return this.#values.get(key) ?? null }
  key(index: number) { return [...this.#values.keys()][index] ?? null }
  removeItem(key: string) { this.#values.delete(key) }
  setItem(key: string, value: string) { this.#values.set(key, value) }
}

test('settings isolate actors and leave ownerless legacy untouched', async () => {
  const storage = new MemoryStorage(), c = new ActorScopeController()
  storage.setItem('open-pencil:ai-model-settings', '{"legacy":true}')
  const a = new ActorSettingsStorage(c, await c.activate('org', 'a'), storage)
  a.write({ model: 'a' })
  const b = new ActorSettingsStorage(c, await c.activate('org', 'b'), storage)
  expect(b.read()).toBeNull(); b.write({ model: 'b' })
  expect(() => a.write({ model: 'stale' })).toThrow('superseded')
  const again = new ActorSettingsStorage(c, await c.activate('org', 'a'), storage)
  expect(again.read()).toEqual({ model: 'a' })
  expect(storage.getItem('open-pencil:ai-model-settings')).toBe('{"legacy":true}')
})
