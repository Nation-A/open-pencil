import { BrowserCredentialStore } from '@/app/settings/credentials/browser'
import type { CredentialRef } from '@/app/settings/credentials/types'
import type { NamespacedCredentialBackend } from './credential-store'

/** Actual encrypted IndexedDB backend; each namespace has independent credential keys. */
export class ActorBrowserCredentialBackend implements NamespacedCredentialBackend<CredentialRef> {
  #stores = new Map<string, BrowserCredentialStore>()
  #store(namespace: string): BrowserCredentialStore {
    let store = this.#stores.get(namespace)
    if (!store) { store = new BrowserCredentialStore(namespace); this.#stores.set(namespace, store) }
    return store
  }
  read(namespace: string, reference: CredentialRef) { return this.#store(namespace).read(reference) }
  write(namespace: string, reference: CredentialRef, value: string) { return this.#store(namespace).write(reference, value) }
  remove(namespace: string, reference: CredentialRef) { return this.#store(namespace).remove(reference) }
}
