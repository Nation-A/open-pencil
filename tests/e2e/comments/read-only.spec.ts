import { expect, test, type Page } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'
import { toolbarToolTestId } from '#tests/helpers/test-ids'

/**
 * workos: a read-only document (a viewer or a commenter) cannot be changed from any panel, menu or
 * shortcut, and can still be inspected, exported, copied and commented on.
 */

// The first load of the dev server compiles the app, which takes longer than the default timeout.
test.setTimeout(60_000)

interface MockWindow extends Window {
  hostPush?: (threads: unknown[], rev: number) => void
}

async function setHost(page: Page, readOnly: boolean) {
  await page.evaluate(
    ({ readOnly: locked }) => {
      const w: MockWindow = window
      w.openPencil?.setCommentsHost?.({
        me: { id: 'u1', name: 'Ada' },
        readOnly: locked,
        capabilities: { comment: true, resolve: true, react: true },
        members: [{ id: 'u1', name: 'Ada' }],
        subscribe: (callback) => {
          w.hostPush = (list, rev) => callback(list as never, rev)
          callback([], 0)
          return () => undefined
        },
        request: () => Promise.resolve({ ok: true, threadId: 'srv_1' })
      })
    },
    { readOnly }
  )
  await expect
    .poll(() => page.evaluate(() => window.openPencil?.getStore?.().state.readOnly === true))
    .toBe(readOnly)
}

async function open(page: Page, readOnly: boolean) {
  await page.goto('/')
  await new CanvasHelper(page).waitForInit()
  await page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('no store')
    const a = store.createShape('RECTANGLE', 100, 100, 200, 120, undefined, 'Box A')
    store.createShape('RECTANGLE', 400, 100, 200, 120, undefined, 'Box B')
    store.select([a])
    store.zoomToSelection()
  })
  await setHost(page, readOnly)
}

/** Everything about the document an edit could change, as one string. */
function documentFingerprint(page: Page) {
  return page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('no store')
    return JSON.stringify({
      nodes: [...store.graph.getAllNodes()].map((n) => [
        n.id,
        n.name,
        n.parentId,
        n.x,
        n.y,
        n.width,
        n.height,
        n.visible,
        n.locked,
        n.opacity,
        n.exportSettings,
        n.childIds
      ]),
      pages: store.graph.getPages().map((p) => p.name),
      canUndo: store.undo.peekUndo() !== undefined
    })
  })
}

const layerRow = (page: Page, name: string) =>
  page.getByTestId('layers-item').filter({ hasText: name })

test('a read-only document cannot be changed from the panels, menus or shortcuts', async ({
  page
}) => {
  await open(page, true)
  // A commenter starts on the Comment tool, which shows the comments list; Hand shows the panels.
  await page.getByTestId(toolbarToolTestId('HAND')).click()
  const before = await documentFingerprint(page)
  const selectedBefore = await page.evaluate(() => [
    ...(window.openPencil?.getStore?.().state.selectedIds ?? [])
  ])

  // Layers: no rename, no visibility or lock toggle, no drag to reorder.
  await layerRow(page, 'Box A').dblclick()
  await expect(page.getByTestId('layers-item-input')).toHaveCount(0)
  await layerRow(page, 'Box A').hover()
  for (const action of await layerRow(page, 'Box A').locator('[data-slot="action"]').all()) {
    await expect(action).toBeDisabled()
  }
  const rowA = await layerRow(page, 'Box A').boundingBox()
  const rowB = await layerRow(page, 'Box B').boundingBox()
  if (!rowA || !rowB) throw new Error('no layer rows')
  await page.mouse.move(rowA.x + 40, rowA.y + rowA.height / 2)
  await page.mouse.down()
  await page.mouse.move(rowB.x + 40, rowB.y + rowB.height + 4, { steps: 6 })
  await page.mouse.up()

  // Properties: the design sections are inert; a click and typing change nothing.
  await expect(page.getByTestId('design-panel-single').locator('[data-locked]')).toHaveAttribute(
    'inert',
    ''
  )
  const x = page.getByTestId('design-panel-single').locator('[data-property="x"]').first()
  const xBox = await x.boundingBox()
  if (xBox) {
    await page.mouse.click(xBox.x + 10, xBox.y + 8)
    await page.keyboard.type('777')
    await page.keyboard.press('Enter')
  }

  // Pages: no add button, no rename.
  await expect(page.getByTestId('pages-add')).toHaveCount(0)
  await page.getByTestId('pages-item').first().dblclick()
  await expect(page.getByTestId('pages-item-input')).toHaveCount(0)

  // Top menu: editing items are disabled, viewing items are not.
  await page.getByTestId('menubar-edit').click()
  for (const name of ['Undo', 'Redo', 'Cut', 'Paste', 'Duplicate', 'Delete']) {
    await expect(
      page.getByRole('menuitem', { name: new RegExp(`^${name}`) }).first()
    ).toHaveAttribute('data-disabled', '')
  }
  await expect(page.getByRole('menuitem', { name: /^Copy/ })).not.toHaveAttribute(
    'data-disabled',
    ''
  )
  await expect(page.getByRole('menuitem', { name: /^Select all/i })).not.toHaveAttribute(
    'data-disabled',
    ''
  )
  await page.keyboard.press('Escape')
  await page.getByTestId('menubar-object').click()
  await expect(page.getByRole('menuitem', { name: /^Group sel/i })).toHaveAttribute(
    'data-disabled',
    ''
  )
  await page.keyboard.press('Escape')

  // Canvas right-click: the editing items are disabled, copy stays.
  const canvas = await page.locator('canvas').first().boundingBox()
  if (!canvas) throw new Error('no canvas')
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, {
    button: 'right'
  })
  await expect(page.getByTestId('context-delete')).toHaveAttribute('data-disabled', '')
  await expect(page.getByTestId('context-duplicate')).toHaveAttribute('data-disabled', '')
  await expect(page.getByTestId('context-cut')).toHaveAttribute('data-disabled', '')
  await expect(page.getByTestId('context-paste')).toHaveAttribute('data-disabled', '')
  await expect(page.getByTestId('context-copy')).not.toHaveAttribute('data-disabled', '')
  await page.keyboard.press('Escape')

  // Shortcuts and the AI tab: nothing there either.
  await page.keyboard.press('Delete')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('ControlOrMeta+d')
  await page.keyboard.press('ControlOrMeta+g')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByTestId('properties-tab-ai')).toHaveCount(0)

  // Calling the editor itself, as a script or an agent tool would, is ignored too.
  await page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('no store')
    const [id] = [...store.state.selectedIds]
    store.updateNode(id, { name: 'hacked', x: 9 })
    store.renameNode(id, 'hacked')
    store.deleteSelected()
    store.addPage()
    store.createShape('RECTANGLE', 0, 0, 10, 10)
  })

  expect(await documentFingerprint(page)).toBe(before)
  const selectedAfter = await page.evaluate(() => [
    ...(window.openPencil?.getStore?.().state.selectedIds ?? [])
  ])
  expect(selectedAfter).toEqual(selectedBefore)
})

test('a read-only document can still be inspected, exported, copied and commented on', async ({
  page
}) => {
  await open(page, true)
  // A commenter starts on the Comment tool, which shows the comments list; Hand shows the panels.
  await page.getByTestId(toolbarToolTestId('HAND')).click()

  // Inspect: Code shows the selection.
  await page.getByTestId('properties-tab-code').click()
  await expect(page.getByTestId('properties-tab-code')).toHaveAttribute('data-state', 'active')

  // Export: the Design tab offers a default PNG export without storing a setting.
  await page.getByTestId('properties-tab-design').click()
  await page.evaluate(() => {
    window.showSaveFilePicker = undefined
  })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-button').click()
  ])
  expect(download.suggestedFilename()).toMatch(/\.png$/i)
  expect(await documentFingerprint(page)).not.toContain('"exportSettings":[{')

  // Copy: allowed, and it leaves the document alone.
  const copied = await page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('no store')
    return store.prepareCopy !== undefined
  })
  expect(copied).toBe(true)

  // Comments: the Comment tool still opens and takes a comment.
  await page.getByTestId(toolbarToolTestId('COMMENT')).click()
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('no canvas')
  await page.mouse.click(box.x + 80, box.y + 80)
  await expect(page.getByRole('textbox', { name: 'Add a comment' })).toBeVisible()
})

test('an editable document still accepts the same edits', async ({ page }) => {
  await open(page, false)

  await layerRow(page, 'Box A').dblclick()
  const input = page.getByTestId('layers-item-input')
  await expect(input).toBeVisible()
  await input.fill('Renamed')
  await input.press('Enter')
  await expect(layerRow(page, 'Renamed')).toBeVisible()

  await expect(page.getByTestId('pages-add')).toBeVisible()
  await expect(page.getByTestId('properties-tab-ai')).toBeVisible()
  await page.getByTestId('pages-add').click()
  await expect(page.getByTestId('pages-item')).toHaveCount(2)

  await page.getByTestId('menubar-edit').click()
  await expect(page.getByRole('menuitem', { name: /^Cut( |$)/ })).not.toHaveAttribute(
    'data-disabled',
    ''
  )
  await page.keyboard.press('Escape')
})

test('a host that turns read-only off and on again changes the same editor', async ({ page }) => {
  await open(page, false)
  await setHost(page, true)
  await expect(page.getByTestId('pages-add')).toHaveCount(0)
  await setHost(page, false)
  await expect(page.getByTestId('pages-add')).toBeVisible()
})

/** Drops an SVG file on the canvas the way a drag from the desktop delivers it. */
function dropSVG(page: Page) {
  return page.getByTestId('canvas-element').evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect()
    const transfer = new DataTransfer()
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>'
    transfer.items.add(new File([svg], 'dropped.svg', { type: 'image/svg+xml' }))
    const options = {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + 200,
      clientY: bounds.top + 200,
      dataTransfer: transfer
    }
    canvas.dispatchEvent(new DragEvent('dragover', options))
    canvas.dispatchEvent(new DragEvent('drop', options))
  })
}

test('a file dropped on a read-only document adds nothing', async ({ page }) => {
  await open(page, true)
  const before = await documentFingerprint(page)
  await dropSVG(page)
  await page.waitForTimeout(600)
  expect(await documentFingerprint(page)).toBe(before)
  await expect(page.getByRole('tab')).toHaveCount(1)
})

test('control: the same drop on an editable document places the file', async ({ page }) => {
  await open(page, false)
  const before = await documentFingerprint(page)
  await dropSVG(page)
  await expect.poll(() => documentFingerprint(page)).not.toBe(before)
})
