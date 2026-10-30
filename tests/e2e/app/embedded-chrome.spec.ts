import { expect, test } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'

test('a host that draws the top row hides the sidebar header; chromeCommand drives gear and panel toggle', async ({
  page
}) => {
  await page.goto('/')
  await new CanvasHelper(page).waitForInit()
  await expect(page.getByTestId('app-document-name')).toBeVisible()

  await page.evaluate(() => {
    const w = window as Window & { states?: boolean[] }
    w.states = []
    window.openPencil?.setEmbeddedChrome?.({
      hideHeader: true,
      onLeftPanelChange: (open) => w.states?.push(open)
    })
  })
  await expect(page.getByTestId('app-document-name')).toHaveCount(0)
  await expect(page.getByTestId('app-logo')).toHaveCount(0)
  await expect(page.getByTestId('app-settings-trigger')).toHaveCount(0)
  await expect(page.getByTestId('app-toggle-ui')).toHaveCount(0)
  await expect(page.getByTestId('menubar-file')).toBeVisible()
  await page.screenshot({ path: process.env.CHROME_SHOT ?? 'test-results/embedded-chrome.png' })

  await page.evaluate(() => window.openPencil?.chromeCommand?.('toggle-left-panel'))
  await expect(page.getByTestId('menubar-file')).toHaveCount(0)
  await page.evaluate(() => window.openPencil?.chromeCommand?.('toggle-left-panel'))
  await expect(page.getByTestId('menubar-file')).toBeVisible()
  expect(await page.evaluate(() => (window as Window & { states?: boolean[] }).states)).toEqual([
    true,
    false,
    true
  ])

  await page.evaluate(() => window.openPencil?.chromeCommand?.('open-settings'))
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.evaluate(() => window.openPencil?.setEmbeddedChrome?.(null))
  await expect(page.getByTestId('app-document-name')).toBeVisible()
})
