import type { Page } from '@playwright/test'
import { toUint8Array } from 'js-base64'

import { expect, test, useEditorSetupWithClear } from '#tests/e2e/fixtures'
import { getSelectedNode } from '#tests/helpers/store'

/** A one-pixel PNG served for every photo, so the workflow needs no network. */
const PNG = Buffer.from(
  toUint8Array(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  )
)

const ctx = useEditorSetupWithClear()
/** The searches each service answered and the photos Unsplash was told were used. */
const requests = { unsplash: [] as string[], pexels: [] as string[], reported: [] as string[] }

function unsplashPhoto(id: string) {
  const url = `https://images.unsplash.test/${id}.png`
  return {
    id,
    width: 1200,
    height: 800,
    urls: { raw: url, full: url, regular: url, small: url, thumb: url },
    user: { name: 'Ann Lee', links: { html: 'https://unsplash.com/@ann' } },
    links: {
      html: `https://unsplash.com/photos/${id}`,
      download_location: `https://api.unsplash.com/photos/${id}/download`
    }
  }
}

test.beforeAll(async () => {
  await ctx.page.route('https://api.unsplash.com/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/search/photos') {
      requests.unsplash.push(url.searchParams.get('query') ?? '')
      await route.fulfill({ json: { results: [unsplashPhoto('first'), unsplashPhoto('second')] } })
    } else {
      requests.reported.push(url.pathname)
      await route.fulfill({ json: { url: 'https://images.unsplash.test/first.png' } })
    }
  })
  await ctx.page.route('https://api.pexels.com/**', async (route) => {
    requests.pexels.push(new URL(route.request().url()).searchParams.get('query') ?? '')
    const src = 'https://images.pexels.test/one.png'
    await route.fulfill({
      json: {
        photos: [
          {
            id: 7,
            width: 900,
            height: 600,
            url: 'https://www.pexels.com/photo/7/',
            photographer: 'Jonas Berg',
            photographer_url: 'https://www.pexels.com/@jonas',
            src: { original: src, large2x: src, large: src, medium: src, small: src }
          }
        ]
      }
    })
  })
  await ctx.page.route(/https:\/\/images\.(unsplash|pexels)\.test\//, (route) =>
    route.fulfill({ contentType: 'image/png', body: PNG })
  )
})

test.beforeEach(() => {
  requests.unsplash = []
  requests.pexels = []
  requests.reported = []
})

async function openPicker(page: Page) {
  await page.getByRole('button', { name: 'Insert photo' }).click()
  const dialog = page.getByRole('dialog', { name: 'Insert photo' })
  await expect(dialog).toBeVisible()
  return dialog
}

test('the picker asks for a service key in place, then searches and places a credited photo', async () => {
  const page = ctx.page
  const dialog = await openPicker(page)
  await expect(dialog.getByRole('textbox', { name: 'Search photos...' })).toBeHidden()
  await dialog.getByLabel('Access key').fill('unsplash-key')
  await dialog.getByRole('button', { name: 'Save' }).click()

  await dialog.getByRole('textbox', { name: 'Search photos...' }).fill('mountains')
  await expect(dialog.getByRole('option')).toHaveCount(2)
  expect(requests.unsplash).toEqual(['mountains'])
  await dialog.getByRole('option').first().hover()
  await expect(dialog).toContainText('Photo by Ann Lee on Unsplash')

  await dialog.getByRole('option').first().click()
  await expect(dialog).toBeHidden()
  await expect
    .poll(async () => (await getSelectedNode(page))?.name)
    .toBe('Photo by Ann Lee on Unsplash')
  const placed = await getSelectedNode(page)
  expect(placed?.fills[0]?.type).toBe('IMAGE')
  // Unsplash's API terms ask to be told of every photo used.
  await expect.poll(() => requests.reported).toEqual(['/photos/first/download'])
})

test('switching to a service without a key asks for that one, and its photos fill a layer', async () => {
  const page = ctx.page
  const dialog = await openPicker(page)
  await dialog.getByRole('combobox', { name: 'Photo service' }).click()
  await page.getByRole('option', { name: 'Pexels' }).click()
  await expect(dialog.getByLabel('API key')).toBeVisible()
  await dialog.getByLabel('API key').fill('pexels-key')
  await dialog.getByRole('button', { name: 'Save' }).click()

  await dialog.getByRole('textbox', { name: 'Search photos...' }).fill('forest')
  await dialog.getByRole('option').first().click()
  await expect
    .poll(async () => (await getSelectedNode(page))?.name)
    .toBe('Photo by Jonas Berg on Pexels')
  expect(requests.pexels).toEqual(['forest'])
  expect(requests.reported).toEqual([])
})
