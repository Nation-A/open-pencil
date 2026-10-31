import type { ActorScope, ActorScopeController } from './scope'

/**
 * Scope-bound storage for the editor's encrypted credential backend. The adapter
 * receives an exact namespace and never reads or migrates unscoped legacy values.
 * It is not an authentication boundary: the caller must authenticate activation.
 */
export interface NamespacedCredentialBackend<Reference> {
  read(namespace: string, reference: Reference): Promise<string | null>
  write(namespace: string, reference: Reference, value: string): Promise<void>
  remove(namespace: string, reference: Reference): Promise<void>
}

export class ActorCredentialStore<Reference> {
  constructor(private controller: ActorScopeController, private scope: ActorScope,
    private backend: NamespacedCredentialBackend<Reference>) {}

  async read(reference: Reference): Promise<string | null> {
    this.controller.assertCurrent(this.scope)
    const result = await this.backend.read(this.scope.namespace, reference)
    this.controller.assertCurrent(this.scope)
    return result
  }
  async write(reference: Reference, value: string): Promise<void> {
    await this.controller.mutate(this.scope, () => this.backend.write(this.scope.namespace, reference, value))
  }
  async remove(reference: Reference): Promise<void> {
    await this.controller.mutate(this.scope, () => this.backend.remove(this.scope.namespace, reference))
  }
}
