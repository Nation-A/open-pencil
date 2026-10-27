import { useLocalStorage, watchDebounced } from '@vueuse/core'
import { computed, ref, shallowRef, watch } from 'vue'

import { getStockPhotoProvider, type StockPhotoResult } from '@open-pencil/core/tools'

import { pexelsKeyStatus, unsplashKeyStatus } from '@/app/settings/credentials/media'

export type PhotoService = 'unsplash' | 'pexels'

/** The services, with where to get a key and the site the picker credits, as both ask. */
export const PHOTO_SERVICES: readonly {
  id: PhotoService
  name: string
  keyURL: string
  siteURL: string
}[] = [
  {
    id: 'unsplash',
    name: 'Unsplash',
    keyURL: 'https://unsplash.com/oauth/applications',
    siteURL: 'https://unsplash.com/?utm_source=openpencil&utm_medium=referral'
  },
  {
    id: 'pexels',
    name: 'Pexels',
    keyURL: 'https://www.pexels.com/api/',
    siteURL: 'https://www.pexels.com'
  }
]

const PHOTO_SERVICE_STORAGE_KEY = 'open-pencil:photo-service'
/** Results a page; a multiple of the picker's three columns. */
const PHOTOS_PER_PAGE = 24
/** The width a placed photo is downloaded at; the services' regular size. */
export const PLACED_PHOTO_SIZE = 1080
const SEARCH_DEBOUNCE_MS = 300

/** The service the picker searched last. */
export const lastPhotoService = useLocalStorage<PhotoService>(PHOTO_SERVICE_STORAGE_KEY, 'unsplash')

export function photoServiceHasKey(service: PhotoService): boolean {
  const status = service === 'pexels' ? pexelsKeyStatus.value : unsplashKeyStatus.value
  return status === 'configured'
}

/**
 * Searches the chosen stock photo service as the query changes, a page at a time. A newer
 * search drops the answers to older ones.
 */
export function usePhotoSearch() {
  const query = ref('')
  const service = lastPhotoService
  const photos = shallowRef<StockPhotoResult[]>([])
  const loading = ref(false)
  const failed = ref(false)
  const hasMore = ref(false)
  const hasKey = computed(() => photoServiceHasKey(service.value))
  let page = 0
  let generation = 0

  async function load(next: number) {
    const term = query.value.trim()
    const provider = getStockPhotoProvider(service.value)
    const current = ++generation
    if (!term || !provider) {
      photos.value = []
      loading.value = false
      failed.value = false
      hasMore.value = false
      return
    }
    loading.value = true
    failed.value = false
    try {
      const found = await provider.search(term, {
        perPage: PHOTOS_PER_PAGE,
        page: next,
        targetDim: PLACED_PHOTO_SIZE
      })
      if (current !== generation) return
      page = next
      const shown = next === 1 ? [] : photos.value
      const seen = new Set(shown.map((photo) => photo.sourceId))
      photos.value = [...shown, ...found.filter((photo) => !seen.has(photo.sourceId))]
      hasMore.value = found.length === PHOTOS_PER_PAGE
    } catch {
      if (current !== generation) return
      failed.value = true
      hasMore.value = false
    } finally {
      if (current === generation) loading.value = false
    }
  }

  // Another service's photos must not stay pickable while the new search waits out the
  // debounce: they would be placed and reported as the new service's.
  watch(service, () => {
    generation++
    photos.value = []
    hasMore.value = false
    failed.value = false
  })
  // Placeholders show from the first keystroke, not only once the search goes out.
  watch([query, service], () => {
    if (query.value.trim() && hasKey.value) loading.value = true
  })
  watchDebounced([query, service, hasKey], () => void load(1), { debounce: SEARCH_DEBOUNCE_MS })

  function loadMore() {
    if (!loading.value && hasMore.value) void load(page + 1)
  }

  function find(id: string) {
    return photos.value.find((photo) => photo.sourceId === id)
  }

  return { query, service, photos, loading, failed, hasMore, hasKey, loadMore, find }
}
