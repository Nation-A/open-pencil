import { afterEach, describe, expect, test } from 'bun:test'

import {
  aiSetupDialogOpen,
  closeAISetup,
  offerAISetupOnFirstRun,
  openAISetup
} from '@/app/ai/models/settings/onboarding/dialog'
import { hostOwnsOnboarding, isHostFramed, setEmbedded } from '@/app/embedded'
import { appPreferences, updateAISetupState } from '@/app/settings/preferences/store'

afterEach(() => {
  setEmbedded(false)
  aiSetupDialogOpen.value = false
})

describe('embedded onboarding', () => {
  test('a page that is not framed and not embedded keeps the stock first run', () => {
    expect(isHostFramed()).toBe(false)
    expect(hostOwnsOnboarding()).toBe(false)
  })

  test('embedded mode never offers the welcome on a fresh install', () => {
    updateAISetupState('pending')
    setEmbedded(true)
    expect(offerAISetupOnFirstRun()).toBe(false)
    expect(aiSetupDialogOpen.value).toBe(false)
  })

  test('embedded mode refuses to open the welcome but still opens guided setup from settings', () => {
    setEmbedded(true)
    openAISetup('welcome')
    expect(aiSetupDialogOpen.value).toBe(false)
    openAISetup('guided')
    expect(aiSetupDialogOpen.value).toBe(true)
  })

  test('switching embedded on after a welcome opened closes it', async () => {
    openAISetup('welcome')
    expect(aiSetupDialogOpen.value).toBe(true)
    setEmbedded(true)
    await Promise.resolve()
    expect(aiSetupDialogOpen.value).toBe(false)
    expect(appPreferences.value.onboarding.aiSetup).toBe('done')
    closeAISetup()
  })
})
