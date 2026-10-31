import { expect, test, type Page } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'
import { toolbarToolTestId } from '#tests/helpers/test-ids'

/**
 * workos: a read-only document (a viewer or a commenter) can open the Variables section and dialog
 * and look at the collections, tokens and values, as in Figma. Creating, editing, renaming and
 * deleting them stays locked.
 */

test.setTimeout(60_000)

interface MockWindow extends Window {
  hostPush?: (threads: unknown[], rev: number) => void
}

async function open(page: Page) {
  await page.goto('/')
  await new CanvasHelper(page).waitForInit()
  await page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('no store')
    store.graph.addCollection({
      id: 'ro-c',
      name: 'Spacing',
      modes: [{ modeId: 'm1', name: 'Base' }],
      defaultModeId: 'm1',
      variableIds: []
    })
    store.graph.addVariable({
      id: 'ro-v',
      name: 'gap/small',
      type: 'FLOAT',
      collectionId: 'ro-c',
      valuesByMode: { m1: 8 },
      description: '',
      hiddenFromPublishing: false
    })
    store.select([])
    const w: MockWindow = window
    w.openPencil?.setCommentsHost?.({
      me: { id: 'u1', name: 'Ada' },
      readOnly: true,
      capabilities: { comment: true, resolve: true, react: true },
      members: [{ id: 'u1', name: 'Ada' }],
      subscribe: (callback) => {
        w.hostPush = (list, rev) => callback(list as never, rev)
        callback([], 0)
        return () => undefined
      },
      request: () => Promise.resolve({ ok: true, threadId: 'srv_1' })
    })
  })
  await expect
    .poll(() => page.evaluate(() => window.openPencil?.getStore?.().state.readOnly === true))
    .toBe(true)
}

const variablesFingerprint = (page: Page) =>
  page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('no store')
    return JSON.stringify({
      collections: [...store.graph.variableCollections.values()],
      variables: [...store.graph.variables.values()],
      canUndo: store.undo.peekUndo() !== undefined
    })
  })

test('a read-only document can open and read Variables but not change them', async ({ page }) => {
  await open(page)
  await page.getByTestId(toolbarToolTestId('HAND')).click()
  const before = await variablesFingerprint(page)

  // The section's open button is live (not inert) and the dialog lists the token and its value.
  const panel = page.getByTestId('design-panel-empty')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: /variables/i }).click()
  const dialog = page.getByTestId('variables-dialog')
  await expect(dialog).toBeVisible()
  const row = dialog.getByTestId('variable-row').filter({ hasText: 'small' })
  await expect(row).toBeVisible()
  await expect(row).toContainText('8')

  // Search and selection still work, so the viewer can read the inspector.
  await dialog.getByTestId('variables-search-input').first().fill('small')
  await expect(row).toBeVisible()
  await row.click()
  await expect(dialog.getByTestId('token-inspector')).toBeVisible()

  // No create, import, or delete entry points.
  await expect(dialog.getByTestId('variables-add-variable')).toHaveCount(0)
  await expect(dialog.getByTestId('variables-add-collection')).toHaveCount(0)
  await expect(dialog.getByTestId('variables-import-tokens')).toHaveCount(0)
  await expect(dialog.getByTestId('token-inspector').locator('[inert]')).toHaveCount(1)

  // Editing in place and keyboard delete do nothing.
  await row.dblclick()
  await expect(dialog.getByTestId('variables-cell-input')).toHaveCount(0)
  await row.press('Delete')
  await row.click({ button: 'right' })
  await expect(page.getByTestId('variables-row-menu')).toHaveCount(0)
  await page.keyboard.press('Escape')

  // Scripts and agent tools hit the editor guard.
  await page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('no store')
    store.renameVariable('ro-v', 'hacked')
    store.updateVariableValue('ro-v', 'm1', 99)
    store.removeVariable('ro-v')
  })

  expect(await variablesFingerprint(page)).toBe(before)
})
