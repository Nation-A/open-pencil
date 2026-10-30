import { beforeEach, describe, expect, test } from 'bun:test'

import { embeddedShare, runEmbeddedShare, setEmbeddedShare } from '@/app/embedded'

describe('embedded share hook', () => {
  beforeEach(() => setEmbeddedShare(null))

  test('is off until a host sets it, so the stock popover stays', () => {
    expect(embeddedShare.value).toBeNull()
    expect(runEmbeddedShare()).toBe(false)
  })

  test('a click calls the host handler and nothing else', () => {
    let calls = 0
    setEmbeddedShare({ onShare: () => (calls += 1) })
    expect(runEmbeddedShare()).toBe(true)
    expect(calls).toBe(1)
  })

  test('canShare false keeps the handler from running', () => {
    let calls = 0
    setEmbeddedShare({ onShare: () => (calls += 1), canShare: () => false })
    expect(runEmbeddedShare()).toBe(false)
    expect(calls).toBe(0)
  })

  test('null restores the stock behaviour', () => {
    setEmbeddedShare({ onShare: () => undefined })
    setEmbeddedShare(null)
    expect(embeddedShare.value).toBeNull()
    expect(runEmbeddedShare()).toBe(false)
  })
})
