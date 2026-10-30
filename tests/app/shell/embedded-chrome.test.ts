import { beforeEach, describe, expect, test } from 'bun:test'

import {
  embeddedChrome,
  reportLeftPanelOpen,
  runEmbeddedChromeCommand,
  setEmbeddedChrome
} from '@/app/embedded'

describe('embedded chrome hook', () => {
  beforeEach(() => setEmbeddedChrome(null))

  test('is off until a host sets it, so the stock header stays', () => {
    expect(embeddedChrome.value).toBeNull()
    expect(embeddedChrome.value?.hideHeader).toBeUndefined()
  })

  test('hideHeader is readable while set and gone after null', () => {
    setEmbeddedChrome({ hideHeader: true })
    expect(embeddedChrome.value?.hideHeader).toBe(true)
    setEmbeddedChrome(null)
    expect(embeddedChrome.value).toBeNull()
  })

  test('chrome commands run the header actions', () => {
    const calls: string[] = []
    const actions = {
      openSettings: () => calls.push('settings'),
      toggleLeftPanel: () => calls.push('toggle')
    }
    expect(runEmbeddedChromeCommand('open-settings', actions)).toBe(true)
    expect(runEmbeddedChromeCommand('toggle-left-panel', actions)).toBe(true)
    expect(runEmbeddedChromeCommand('nope', actions)).toBe(false)
    expect(calls).toEqual(['settings', 'toggle'])
  })

  test('the left-panel callback hears the current state when set, then every change', () => {
    reportLeftPanelOpen(true)
    const seen: boolean[] = []
    setEmbeddedChrome({ hideHeader: true, onLeftPanelChange: (open) => seen.push(open) })
    reportLeftPanelOpen(false)
    reportLeftPanelOpen(true)
    expect(seen).toEqual([true, false, true])
  })

  test('after null the callback is no longer called', () => {
    const seen: boolean[] = []
    setEmbeddedChrome({ hideHeader: true, onLeftPanelChange: (open) => seen.push(open) })
    const heardOnSet = seen.length
    setEmbeddedChrome(null)
    reportLeftPanelOpen(false)
    expect(seen.length).toBe(heardOnSet)
  })
})
