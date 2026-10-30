import { ref, watch } from 'vue'

import { aiModelSettings } from '@/app/ai/models/store'
import { embedded, hostOwnsOnboarding } from '@/app/embedded'
import { appPreferences, updateAISetupState } from '@/app/settings/preferences/store'

import { isUnconfiguredModelSettings } from './apply'

/** `welcome` introduces OpenPencil first; `guided` starts at the setup questions. */
export type AISetupEntry = 'welcome' | 'guided'

export const aiSetupDialogOpen = ref(false)
export const aiSetupEntry = ref<AISetupEntry>('guided')

export function openAISetup(entry: AISetupEntry = 'guided'): void {
  // workos: the host injects the AI connection; the introduction (and its tour) is never offered inside it.
  if (entry === 'welcome' && hostOwnsOnboarding()) return
  aiSetupEntry.value = entry
  aiSetupDialogOpen.value = true
}

/** Closing guided setup in any way counts as done, so the welcome is offered only once. */
export function closeAISetup(): void {
  aiSetupDialogOpen.value = false
  updateAISetupState('done')
}

/**
 * Offers the welcome to a fresh install; anyone who already configured AI never sees it.
 * Returns whether the welcome opened.
 */
export function offerAISetupOnFirstRun(): boolean {
  // The native test binary starts every run with an empty data store.
  if (import.meta.env.MODE === 'native-test') return false
  // workos: inside a host page nothing here is the person's first launch; an open welcome would also lock the page behind it.
  if (hostOwnsOnboarding()) return false
  if (appPreferences.value.onboarding.aiSetup === 'done') return false
  if (!isUnconfiguredModelSettings(aiModelSettings.value)) {
    updateAISetupState('done')
    return false
  }
  openAISetup('welcome')
  return true
}

/** workos: a host that switches embedded mode on after boot closes a welcome that already opened, which releases its page lock. */
watch(embedded, (on) => {
  if (on && aiSetupDialogOpen.value && aiSetupEntry.value === 'welcome') closeAISetup()
})
