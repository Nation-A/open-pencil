import type { ActorScope, ActorScopeController } from './scope'

/** Prevents a model retained from a previous activation from starting or continuing requests. */
export function actorScopedFetch(controller: ActorScopeController, scope: ActorScope, upstream: typeof fetch): typeof fetch {
  return async (input, init) => {
    controller.assertCurrent(scope)
    const requestSignal = input instanceof Request ? input.signal : undefined
    const signals = [scope.signal, init?.signal, requestSignal].filter((value): value is AbortSignal => value != null)
    const response = await upstream(input, { ...init, signal: AbortSignal.any(signals) })
    try { controller.assertCurrent(scope) }
    catch (error) { await response.body?.cancel().catch(() => undefined); throw error }
    return response
  }
}
