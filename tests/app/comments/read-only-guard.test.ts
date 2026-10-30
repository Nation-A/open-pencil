import 'fake-indexeddb/auto'
import { expect, test } from 'bun:test'

import { createEditorStore } from '@/app/editor/session/create'

function storeWithRect() {
  const store = createEditorStore()
  const id = store.createShape('RECTANGLE', 10, 10, 100, 50)
  store.select([id])
  return { store, id }
}

test('a read-only editor ignores every way of changing the document', () => {
  const { store, id } = storeWithRect()
  const pages = store.graph.getPages().length
  const children = store.graph.getChildren(store.state.currentPageId).length
  store.state.readOnly = true

  store.updateNode(id, { name: 'renamed', x: 500 })
  store.updateNodeWithUndo(id, { visible: false })
  store.renameNode(id, 'again')
  store.toggleNodeVisibility(id)
  store.toggleNodeLock(id)
  store.addPage()
  store.renamePage(store.state.currentPageId, 'nope')
  store.duplicateSelected()
  store.groupSelected()
  store.deleteSelected()
  store.undo.execute({
    label: 'x',
    forward: () => store.graph.updateNode(id, { x: 900 }),
    inverse: () => undefined
  })

  const node = store.graph.getNode(id)
  expect(node?.name).not.toBe('renamed')
  expect(node?.name).not.toBe('again')
  expect(node?.x).toBe(10)
  expect(node?.visible).toBe(true)
  expect(node?.locked).toBe(false)
  expect(store.graph.getPages()).toHaveLength(pages)
  expect(store.graph.getChildren(store.state.currentPageId)).toHaveLength(children)
})

test('reading, selecting, zooming and copying still work while read-only', () => {
  const { store, id } = storeWithRect()
  store.state.readOnly = true
  store.select([])
  store.select([id])
  expect([...store.state.selectedIds]).toEqual([id])
  expect(store.getSelectedNodes().map((n) => n.id)).toEqual([id])
  store.zoomToFit()
  expect(() => store.prepareCopy()).not.toThrow()
})

test('the same actions work again when the document is editable', () => {
  const { store, id } = storeWithRect()
  store.state.readOnly = true
  store.updateNode(id, { x: 500 })
  store.state.readOnly = false
  store.updateNode(id, { x: 500 })
  expect(store.graph.getNode(id)?.x).toBe(500)
  store.renameNode(id, 'ok')
  expect(store.graph.getNode(id)?.name).toBe('ok')
})
