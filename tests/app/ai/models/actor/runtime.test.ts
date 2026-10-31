import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'bun:test'

// The editor reads `shim`; bun has no DOM, so give it a plain Map-backed one before the modules load.
const backing = new Map<string, string>()
const shim = {
  get length() { return backing.size },
  key: (index: number) => [...backing.keys()][index] ?? null,
  getItem: (key: string) => backing.get(key) ?? null,
  setItem: (key: string, value: string) => void backing.set(key, String(value)),
  removeItem: (key: string) => void backing.delete(key),
  clear: () => backing.clear()
}
// oxlint-ignore-next-line open-pencil/no-direct-storage-access
Object.assign(globalThis, { window: globalThis, localStorage: shim })

const { activateActorAIScope, invalidateActorAIScope, refreshActorAISettings } = await import('@/app/ai/models/actor/runtime')
const { aiModelSettings } = await import('@/app/ai/models/store')
const { appCredentialServices } = await import('@/app/settings/credentials/app')

const LEGACY = 'open-pencil:ai-model-settings'
const settingsFor = (name: string) => ({
  version: 1,
  connections: [{ id: 'connection-workos', providerID: 'openai-compatible', customBaseURL: 'https://gw.test/v1', customAPIType: 'completions', credentialProfileId: 'workos-managed' }],
  models: [{ id: 'model-workos-0', name, connectionId: 'connection-workos', modelID: '', customModelID: name, maxOutputTokens: 1024, thinkingLevel: 'default', capabilities: ['tools'] }],
  assignments: { design: 'model-workos-0', review: null, fast: null, vision: null }
})

describe('workos AI scope API', () => {
  beforeEach(() => {
    invalidateActorAIScope()
    shim.clear()
  })

  it('reads and writes settings under the actor key, never the legacy slot', async () => {
    shim.setItem(LEGACY, JSON.stringify(settingsFor('legacy')))
    const a = await activateActorAIScope('org', 'a')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(aiModelSettings.value.models.some((m) => m.customModelID === 'legacy')).toBe(false)
    shim.setItem(`open-pencil:actor:${a}:ai-model-settings`, JSON.stringify(settingsFor('model-a')))
    refreshActorAISettings()
    expect(aiModelSettings.value.models[0].customModelID).toBe('model-a')
    const b = await activateActorAIScope('org', 'b')
    expect(b).not.toBe(a)
    expect(aiModelSettings.value.models.some((m) => m.customModelID === 'model-a')).toBe(false)
    expect(JSON.parse(shim.getItem(LEGACY) as string).models[0].customModelID).toBe('legacy')
    await activateActorAIScope('org', 'a')
    expect(aiModelSettings.value.models[0].customModelID).toBe('model-a')
  })

  it('does not turn defaults into saved settings on activation', async () => {
    const a = await activateActorAIScope('org', 'fresh')
    await Promise.resolve()
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(shim.getItem(`open-pencil:actor:${a}:ai-model-settings`)).toBeNull()
  })

  it('closes credentials while no actor is active and keeps the managed profile keyless', async () => {
    const ref = { integrationId: 'openai-compatible', profileId: 'p', field: 'api-key' }
    await expect(appCredentialServices.resolver.resolve(ref)).rejects.toThrow()
    await activateActorAIScope('org', 'a')
    await appCredentialServices.manager.set(ref, 'secret-a')
    expect(await appCredentialServices.resolver.resolve(ref)).toBe('secret-a')
    expect(await appCredentialServices.resolver.resolve({ ...ref, profileId: 'workos-managed' })).toBe('workos-managed')
    await activateActorAIScope('org', 'b')
    expect(await appCredentialServices.resolver.resolve(ref)).toBeNull()
    await activateActorAIScope('org', 'a')
    expect(await appCredentialServices.resolver.resolve(ref)).toBe('secret-a')
    invalidateActorAIScope()
    await expect(appCredentialServices.resolver.resolve(ref)).rejects.toThrow()
  })
})
