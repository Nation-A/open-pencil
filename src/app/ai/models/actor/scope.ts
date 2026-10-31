/** Per-frame, fail-closed scope primitive. Authentication of the host message is a caller obligation. */
export type ActorScope = Readonly<{ namespace: string; epoch: number; signal: AbortSignal }>

export class ActorScopeController {
  #epoch = 0
  #pendingMutations = new Set<Promise<unknown>>()
  #active: { scope: ActorScope; controller: AbortController } | null = null

  async activate(org: string, actor: string): Promise<ActorScope> {
    // Even a rejected activation must not leave the previous actor authorized.
    this.invalidate()
    if (!org || !actor || org.length > 512 || actor.length > 512) throw new Error('invalid actor scope')
    const epoch = this.#epoch
    // No later activation may authorize a new writer until old writes settle.
    await Promise.allSettled(this.#pendingMutations)
    if (epoch !== this.#epoch) throw new Error('actor scope superseded')
    const bytes = new TextEncoder().encode(JSON.stringify([org, actor]))
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    if (epoch !== this.#epoch) throw new Error('actor scope superseded')
    const namespace = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
    const controller = new AbortController()
    const scope = Object.freeze({ namespace, epoch, signal: controller.signal })
    this.#active = { scope, controller }
    return scope
  }

  async mutate<T>(scope: ActorScope, action: () => Promise<T>): Promise<T> {
    this.assertCurrent(scope)
    const operation = Promise.resolve().then(action)
    this.#pendingMutations.add(operation)
    try { const result = await operation; this.assertCurrent(scope); return result }
    finally { this.#pendingMutations.delete(operation) }
  }

  current(): ActorScope | null { return this.#active?.scope ?? null }
  isCurrent(scope: ActorScope): boolean { return this.#active?.scope === scope && !scope.signal.aborted }
  assertCurrent(scope: ActorScope): void { if (!this.isCurrent(scope)) throw new Error('actor scope superseded') }
  invalidate(): void { this.#epoch++; this.#active?.controller.abort(); this.#active = null }
}
