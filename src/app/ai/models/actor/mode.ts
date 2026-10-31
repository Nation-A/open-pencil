/**
 * workos: whether this editor frame runs AI under a host-activated actor scope. It stays off until the host calls
 * `window.openPencil.activateWorkosAiScope` or `invalidateWorkosAiScope`; without a caller nothing changes.
 */
let active = false

export function actorScopeMode(): boolean {
  return active
}

export function enableActorScopeMode(): void {
  active = true
}
