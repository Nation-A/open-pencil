import type { ActorScope, ActorScopeController } from './scope'

/** Per-actor settings; intentionally never reads or mutates the unscoped legacy slot. */
export class ActorSettingsStorage {
  readonly #key: string
  constructor(private controller: ActorScopeController, private scope: ActorScope, private storage: Storage) {
    this.#key = `open-pencil:actor:${scope.namespace}:ai-model-settings`
  }
  read(): unknown {
    this.controller.assertCurrent(this.scope)
    const raw = this.storage.getItem(this.#key)
    return raw === null ? null : JSON.parse(raw)
  }
  write(value: unknown): void {
    this.controller.assertCurrent(this.scope)
    this.storage.setItem(this.#key, JSON.stringify(value))
  }
}
