import { toRaw } from 'vue'

import { ActorBrowserCredentialBackend } from '@/app/ai/models/actor/browser-credential-backend'
import { ActorCredentialStore } from '@/app/ai/models/actor/credential-store'
import { actorScopedFetch } from '@/app/ai/models/actor/fetch'
import { enableActorScopeMode, actorScopeMode } from '@/app/ai/models/actor/mode'
import { ActorScopeController, type ActorScope } from '@/app/ai/models/actor/scope'
import { ActorSettingsStorage } from '@/app/ai/models/actor/settings-storage'
import {
  actorSettingsBackingStorage,
  redirectAIModelSettingsStorage,
  writeAIModelSettingsStorage
} from '@/app/ai/models/storage'
import { aiModelSettings, reloadAIModelSettings } from '@/app/ai/models/store'
import { appCredentialStore } from '@/app/settings/credentials/app'
import {
  CredentialStoreError,
  type CredentialRef,
  type CredentialStatus,
  type CredentialStore,
  type CredentialStoreAvailability
} from '@/app/settings/credentials/types'

/** The credential profile the host bridge assigns to the WorkOS gateway connection; the bridge's fetch supplies the real bearer. */
export const WORKOS_MANAGED_PROFILE = 'workos-managed'
const WORKOS_MANAGED_PLACEHOLDER = 'workos-managed'

const controller = new ActorScopeController()
const backend = new ActorBrowserCredentialBackend()

/** Refuses every operation: used while no actor is active. */
class ClosedCredentialStore implements CredentialStore {
  readonly backend = 'browser' as const
  availability(): Promise<CredentialStoreAvailability> {
    return Promise.resolve('unavailable')
  }
  status(): Promise<CredentialStatus> {
    return Promise.resolve('unavailable')
  }
  read(): Promise<string | null> {
    return Promise.reject(new CredentialStoreError('unavailable', 'No actor scope is active'))
  }
  write(): Promise<void> {
    return Promise.reject(new CredentialStoreError('unavailable', 'No actor scope is active'))
  }
  remove(): Promise<void> {
    return Promise.reject(new CredentialStoreError('unavailable', 'No actor scope is active'))
  }
}

/** The editor's credential store while one actor is active: that actor's namespace, plus the keyless WorkOS gateway profile. */
class ScopedCredentialStore implements CredentialStore {
  readonly backend = 'browser' as const
  readonly #store: ActorCredentialStore<CredentialRef>
  constructor(scope: ActorScope) {
    this.#store = new ActorCredentialStore(controller, scope, backend)
  }
  async availability(): Promise<CredentialStoreAvailability> {
    return 'available'
  }
  async status(reference: CredentialRef): Promise<CredentialStatus> {
    if (reference.profileId === WORKOS_MANAGED_PROFILE) return 'configured'
    try {
      return (await this.read(reference)) === null ? 'missing' : 'configured'
    } catch (error) {
      if (error instanceof CredentialStoreError && error.code === 'locked') return 'locked'
      return 'unavailable'
    }
  }
  async read(reference: CredentialRef): Promise<string | null> {
    if (reference.profileId === WORKOS_MANAGED_PROFILE) {
      return WORKOS_MANAGED_PLACEHOLDER
    }
    return this.#store.read(reference)
  }
  async write(reference: CredentialRef, value: string): Promise<void> {
    if (reference.profileId === WORKOS_MANAGED_PROFILE) return
    await this.#store.write(reference, value)
  }
  async remove(reference: CredentialRef): Promise<void> {
    if (reference.profileId === WORKOS_MANAGED_PROFILE) return
    await this.#store.remove(reference)
  }
}

/** Saves the current actor's pending settings before they could be dropped by a switch. */
function persistActiveSettings(): void {
  const scope = controller.current()
  if (!scope) return
  writeAIModelSettingsStorage(structuredClone(toRaw(aiModelSettings.value)))
}

function close(): void {
  persistActiveSettings()
  enableActorScopeMode()
  controller.invalidate()
  redirectAIModelSettingsStorage('blocked')
  appCredentialStore.replace(new ClosedCredentialStore())
  reloadAIModelSettings()
}

/** Ends the active actor scope. AI settings and credentials are unavailable until the next activation. */
export function invalidateActorAIScope(): void {
  close()
}

/**
 * Binds AI settings and credentials to `org`+`actor` and resolves with the namespace (64 hex characters). The host must
 * have authenticated the caller; this API does not. Never reads or migrates the origin-wide legacy settings or keys.
 */
export async function activateActorAIScope(org: string, actor: string): Promise<string> {
  close()
  const scope = await controller.activate(org, actor)
  const settings = new ActorSettingsStorage(controller, scope, actorSettingsBackingStorage())
  redirectAIModelSettingsStorage({ read: () => settings.read(), write: (value) => settings.write(value) })
  appCredentialStore.replace(new ScopedCredentialStore(scope))
  reloadAIModelSettings()
  return scope.namespace
}

/** Re-reads the active actor's settings after the host wrote them to storage. No-op without an active scope. */
export function refreshActorAISettings(): void {
  if (controller.current()) reloadAIModelSettings()
}

/** The fetch a model created now must use: the active scope's, so a model kept past a switch can no longer reach a provider. */
export function actorModelFetch(): typeof fetch | undefined {
  if (!actorScopeMode()) return undefined
  const scope = controller.current()
  if (!scope) throw new Error('No actor scope is active')
  const upstream: typeof fetch = (input, init) =>
    (window.__WORKOS_AI_FETCH__ ?? globalThis.fetch).call(globalThis, input, init)
  return actorScopedFetch(controller, scope, upstream)
}

export function assertActorScopeStillCurrent(scope: ActorScope | null): void {
  if (scope) controller.assertCurrent(scope)
}

export function currentActorScope(): ActorScope | null {
  return controller.current()
}
