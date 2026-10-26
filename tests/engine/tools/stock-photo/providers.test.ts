import { afterEach, expect, test } from 'bun:test'

import {
  getStockPhotoProvider,
  setPexelsAPIKey,
  setUnsplashAccessKey
} from '#core/tools/stock-photo/providers'

const realFetch = globalThis.fetch
/** Each request the providers sent, and an answer per path. */
let requests: URL[] = []

function answer(byPath: Record<string, unknown>) {
  requests = []
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input)
      requests.push(url)
      const body = byPath[url.pathname]
      return body === undefined ? new Response('missing', { status: 404 }) : Response.json(body)
    },
    { preconnect: realFetch.preconnect }
  )
}

afterEach(() => {
  globalThis.fetch = realFetch
  setPexelsAPIKey(null)
  setUnsplashAccessKey(null)
})

test('Unsplash results credit the photographer with referral links, and a used photo is reported', async () => {
  answer({
    '/search/photos': {
      results: [
        {
          id: 'abc',
          width: 1200,
          height: 800,
          urls: { raw: 'r', full: 'f', regular: 'g', small: 's', thumb: 't' },
          user: { name: 'Ann Lee', links: { html: 'https://unsplash.com/@ann' } },
          links: {
            html: 'https://unsplash.com/photos/abc',
            download_location: 'https://api.unsplash.com/photos/abc/download?ixid=1'
          }
        }
      ]
    },
    '/photos/abc/download': { url: 'f' }
  })
  setUnsplashAccessKey('key')
  const provider = getStockPhotoProvider('unsplash')
  if (!provider) throw new Error('Unsplash was not registered')

  const [photo] = await provider.search('hills', { perPage: 3, page: 2, targetDim: 1080 })
  expect(photo).toEqual({
    url: 'g',
    thumbnailURL: 's',
    width: 1200,
    height: 800,
    photographer: 'Ann Lee',
    photographerURL: 'https://unsplash.com/@ann?utm_source=openpencil&utm_medium=referral',
    pageURL: 'https://unsplash.com/photos/abc?utm_source=openpencil&utm_medium=referral',
    sourceId: 'abc'
  })
  expect(Object.fromEntries(requests[0].searchParams)).toEqual({
    query: 'hills',
    per_page: '3',
    page: '2'
  })

  await provider.reportUse?.(photo)
  expect(requests[1].pathname).toBe('/photos/abc/download')
})

test('a malformed answer fails the search instead of returning half a photo', async () => {
  answer({ '/v1/search': { photos: [{ id: 1, width: 10 }] } })
  setPexelsAPIKey('key')
  const provider = getStockPhotoProvider('pexels')
  if (!provider) throw new Error('Pexels was not registered')
  await expect(provider.search('sea', { perPage: 1, targetDim: 100 })).rejects.toThrow()
})

test('removing a key unregisters its service', () => {
  setPexelsAPIKey('key')
  expect(getStockPhotoProvider('pexels')).not.toBeNull()
  setPexelsAPIKey(null)
  expect(getStockPhotoProvider('pexels')).toBeNull()
})
