import { expect, test } from 'bun:test'
import { ActorScopeController } from '@/app/ai/models/actor/scope'
import { actorScopedFetch } from '@/app/ai/models/actor/fetch'

test('superseded model cannot send, and switching aborts its in-flight fetch', async () => {
  const controller = new ActorScopeController(), scope = await controller.activate('org', 'a')
  let signal: AbortSignal | null = null, calls = 0
  const fetcher: typeof fetch = async (_input, init) => {
    calls++; signal = init?.signal ?? null
    return await new Promise((_resolve, reject) => { signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }) })
  }
  const guarded = actorScopedFetch(controller, scope, fetcher), request = guarded('https://fixture.invalid')
  const rejected = request.then(() => null, error => error)
  await controller.activate('org', 'b')
  expect((await rejected)?.message).toBe('aborted')
  expect(signal?.aborted).toBe(true)
  await expect(guarded('https://fixture.invalid')).rejects.toThrow('superseded')
  expect(calls).toBe(1)
})
