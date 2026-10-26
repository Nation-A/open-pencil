import { getStockPhotoProvider, type StockPhotoResult } from '@open-pencil/core/tools'

import type { EditorStore } from '@/app/editor/active-store'
import { pastePoint } from '@/app/editor/clipboard/paste/content'

import type { PhotoService } from './search'

/**
 * Downloads `photo` at the size it is placed at and tells its service it was used, as Unsplash's
 * terms ask; a failed report does not stop the photo.
 */
export async function downloadPhoto(service: PhotoService, photo: StockPhotoResult) {
  const response = await fetch(photo.url)
  if (!response.ok) throw new Error(`Download ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  void getStockPhotoProvider(service)
    ?.reportUse?.(photo)
    .catch(() => undefined)
  return { bytes, type: response.headers.get('content-type') ?? 'image/jpeg' }
}

/**
 * Places `photo` at the middle of the view and selects it, as a layer called `name`: its
 * credit, "Photo by Ann Lee on Unsplash", which the services ask for.
 */
export async function insertPhoto(
  store: EditorStore,
  service: PhotoService,
  photo: StockPhotoResult,
  name: string
): Promise<void> {
  const { bytes, type } = await downloadPhoto(service, photo)
  // The layer is named from the file name without its extension, so it needs one to lose.
  const extension = type.slice(type.indexOf('/') + 1)
  const file = new File([bytes], `${name}.${extension}`, { type })
  const { x, y } = pastePoint(store)
  await store.placeImageFiles([file], x, y)
}
