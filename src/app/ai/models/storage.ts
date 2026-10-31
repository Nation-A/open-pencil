import { StorageSerializers, useLocalStorage } from '@vueuse/core'

const STORAGE_PREFIX = 'open-pencil:'
const MODEL_SETTINGS_KEY = `${STORAGE_PREFIX}ai-model-settings`

const modelSettings = useLocalStorage<unknown>(MODEL_SETTINGS_KEY, null, {
  serializer: StorageSerializers.object,
  writeDefaults: false
})

const legacyValues = {
  'ai-provider': useLocalStorage<string | null>(`${STORAGE_PREFIX}ai-provider`, null, {
    serializer: StorageSerializers.string,
    writeDefaults: false
  }),
  'ai-model': useLocalStorage<string | null>(`${STORAGE_PREFIX}ai-model`, null, {
    serializer: StorageSerializers.string,
    writeDefaults: false
  }),
  'ai-custom-model': useLocalStorage<string | null>(`${STORAGE_PREFIX}ai-custom-model`, null, {
    serializer: StorageSerializers.string,
    writeDefaults: false
  }),
  'ai-base-url': useLocalStorage<string | null>(`${STORAGE_PREFIX}ai-base-url`, null, {
    serializer: StorageSerializers.string,
    writeDefaults: false
  }),
  'ai-api-type': useLocalStorage<string | null>(`${STORAGE_PREFIX}ai-api-type`, null, {
    serializer: StorageSerializers.string,
    writeDefaults: false
  }),
  'ai-max-output-tokens': useLocalStorage<string | null>(
    `${STORAGE_PREFIX}ai-max-output-tokens`,
    null,
    {
      serializer: StorageSerializers.string,
      writeDefaults: false
    }
  )
}

export type LegacyAIModelStorageKey = keyof typeof legacyValues

export function readLegacyAIModelStorage(key: LegacyAIModelStorageKey): string | null {
  return legacyValues[key].value
}

/**
 * workos: once a host scopes AI to an actor, settings no longer live in the origin-wide slot. `null` is the legacy slot,
 * `'blocked'` means no actor is active (nothing is read or written), anything else is that actor's own storage.
 */
export type AIModelSettingsRedirect = {
  read(): unknown
  write(value: unknown): void
}
let redirect: AIModelSettingsRedirect | 'blocked' | null = null

export function redirectAIModelSettingsStorage(next: AIModelSettingsRedirect | 'blocked' | null): void {
  redirect = next
}

export function readAIModelSettingsStorage(): unknown {
  if (redirect === 'blocked') return null
  return redirect ? redirect.read() : modelSettings.value
}

export function writeAIModelSettingsStorage(value: unknown): void {
  if (redirect === 'blocked') return
  if (redirect) {
    // A write queued for an actor that is no longer current is dropped, never redirected.
    try {
      redirect.write(value)
    } catch (error) {
      console.warn('Dropped an AI settings write for a scope that is no longer current', error)
    }
    return
  }
  modelSettings.value = value
}

/** workos: the browser storage an actor's settings live in; kept here so no other module touches localStorage directly. */
export function actorSettingsBackingStorage(): Storage {
  return localStorage
}
