import { expect, test } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'

test('a host-owned Share button renders no peer-to-peer popover and calls onShare', async ({
  page
}) => {
  await page.goto('/')
  await new CanvasHelper(page).waitForInit()
  const button = page.getByTestId('collab-share-button')

  // Stock behaviour first: the popover opens.
  await button.click()
  await expect(page.getByTestId('collab-popover')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('collab-popover')).toHaveCount(0)

  await page.evaluate(() => {
    const w = window as unknown as { __shares: number }
    w.__shares = 0
    window.openPencil?.setEmbeddedShare?.({
      onShare: () => {
        w.__shares += 1
      },
      label: 'Share'
    })
  })
  await button.click()
  await expect(page.getByTestId('collab-popover')).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shares: number }).__shares))
    .toBe(1)

  // Null gives the stock popover back.
  await page.evaluate(() => window.openPencil?.setEmbeddedShare?.(null))
  await button.click()
  await expect(page.getByTestId('collab-popover')).toBeVisible()
})
