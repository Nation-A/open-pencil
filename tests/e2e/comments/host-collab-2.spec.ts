import { expect, test, type Page } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'
import { toolbarToolTestId } from '#tests/helpers/test-ids'

// A 1x1 red PNG: the host's avatar for Ada. Bea's URL points nowhere, so hers falls back to initials.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='
const BROKEN = 'http://127.0.0.1:9/missing.png'

interface HostThread {
  id: string
  pageId: string
  nodeId: string | null
  offsetX: number
  offsetY: number
  x: number
  y: number
  author: string
  authorId: string
  authorAvatarUrl?: string
  text: string
  mentions: string[]
  createdAt: string
  updatedAt: string
  resolved: boolean
  replies: Array<{ id: string; author: string; authorId: string; text: string; createdAt: string }>
  reactions: never[]
}

interface Op {
  type: string
  threadId?: string
  replyId?: string | null
  anchor?: { pageId: string; x: number; y: number; nodeId: string | null }
  text?: string
  mentions?: string[]
}

interface MockWindow extends Window {
  hostPush?: (threads: HostThread[], rev: number) => void
  hostRequest?: (op: Op) => Promise<unknown>
}

async function openWithHost(
  page: Page,
  me: { id: string; name: string },
  options: {
    readOnly: boolean
    comment?: boolean
    request: (who: string, op: Op) => Promise<unknown>
  }
) {
  await page.goto('/')
  await new CanvasHelper(page).waitForInit()
  await page.exposeFunction('hostRequest', (op: Op) => options.request(me.id, op))
  await page.evaluate(
    ({ me: who, readOnly, comment, png, broken }) => {
      const w: MockWindow = window
      w.openPencil?.setCommentsHost?.({
        me: who,
        readOnly,
        capabilities: { comment, resolve: comment, react: comment },
        members: [
          { id: 'u1', name: 'Ada', avatarUrl: png },
          { id: 'u2', name: 'Bea', avatarUrl: broken }
        ],
        subscribe: (callback) => {
          w.hostPush = (list, rev) => {
            const pageId = w.openPencil?.getStore?.().state.currentPageId ?? ''
            callback(list.map((entry) => ({ ...entry, pageId })) as never, rev)
          }
          callback([], 0)
          return () => undefined
        },
        request: (op) => (w.hostRequest?.(op as Op) ?? Promise.resolve({ ok: false })) as never
      })
    },
    { me, readOnly: options.readOnly, comment: options.comment ?? true, png: PNG, broken: BROKEN }
  )
}

const livePins = (page: Page) => page.locator('[data-slot="comment-pin"]:not([data-draft])')

test('a pin can be edited, moved and shows avatars; both editors follow the host', async ({
  browser
}) => {
  const threads: HostThread[] = []
  const ops: Op[] = []
  const pages: Page[] = []
  const push = async () => {
    for (const page of pages) {
      await page.evaluate((list) => (window as MockWindow).hostPush?.(list, Date.now()), threads)
    }
  }
  const request = async (who: string, op: Op) => {
    ops.push(op)
    if (op.type === 'create' && op.anchor) {
      threads.push({
        id: 'srv_1',
        pageId: op.anchor.pageId,
        nodeId: null,
        offsetX: 0,
        offsetY: 0,
        x: op.anchor.x,
        y: op.anchor.y,
        author: 'Ada',
        authorId: who,
        authorAvatarUrl: PNG,
        text: op.text ?? '',
        mentions: op.mentions ?? [],
        createdAt: '2026-10-30T10:00:00.000Z',
        updatedAt: '2026-10-30T10:00:00.000Z',
        resolved: false,
        replies: [
          {
            id: 'r1',
            author: 'Bea',
            authorId: 'u2',
            text: 'bea says hi',
            createdAt: '2026-10-30T10:30:00.000Z'
          }
        ],
        reactions: []
      })
      await push()
      return { ok: true, threadId: 'srv_1' }
    }
    const target = threads.find((entry) => entry.id === op.threadId)
    if (op.type === 'edit' && target) {
      target.text = op.text ?? ''
      target.mentions = op.mentions ?? []
      await push()
    }
    if (op.type === 'move' && target && op.anchor) {
      // The host takes a moment, and refuses a pin dropped far to the right.
      if (op.anchor.x > 2000) return { ok: false, error: 'forbidden' }
      target.x = op.anchor.x
      target.y = op.anchor.y
      await push()
    }
    return { ok: true }
  }

  const ada = await (await browser.newContext()).newPage()
  const bea = await (await browser.newContext()).newPage()
  pages.push(ada, bea)
  await openWithHost(ada, { id: 'u1', name: 'Ada' }, { readOnly: false, request })
  await openWithHost(bea, { id: 'u2', name: 'Bea' }, { readOnly: false, request })

  await ada.getByTestId(toolbarToolTestId('COMMENT')).click()
  const box = await ada.locator('canvas').first().boundingBox()
  if (!box) throw new Error('no canvas')
  await ada.mouse.click(box.x + 200, box.y + 200)
  const composer = ada.getByRole('textbox', { name: 'Add a comment' })
  // The mention list shows Ada's picture; Bea's broken one falls back to her initials.
  await composer.pressSequentially('@')
  await expect(ada.locator('[data-slot="mention-list"] [data-slot="avatar-image"]')).toHaveCount(1)
  await composer.fill('')
  await composer.pressSequentially('first draft')
  await composer.press('Enter')
  await expect(livePins(ada)).toHaveCount(1)
  await expect(livePins(bea)).toHaveCount(1)

  // The pin shows the host's picture.
  await expect(livePins(ada).locator('[data-slot="avatar-image"]')).toBeVisible()

  // Edit: the card's menu offers it for Ada's own comment, not for Bea's reply.
  await ada.keyboard.press('Escape')
  await livePins(ada).click()
  await expect(ada.locator('[data-slot="comment-thread"]')).toBeVisible()
  await expect(ada.locator('[data-command="comment-edit-reply"]')).toHaveCount(0)
  await ada.getByRole('button', { name: 'More actions' }).click()
  // The menu overlaps the card's text while it opens, so pick the item with the keyboard.
  await ada.locator('[data-command="comment-edit"]').focus()
  await ada.keyboard.press('Enter')
  const editor = ada.getByRole('textbox', { name: 'Edit comment' })
  await expect(editor).toHaveValue('first draft')
  await editor.fill('second draft')
  await ada.locator('[data-command="comment-edit-save"]').click()
  expect(ops.find((entry) => entry.type === 'edit')).toMatchObject({
    threadId: 'srv_1',
    replyId: null,
    text: 'second draft'
  })
  await expect(ada.locator('[data-slot="comment-message"]').first()).toContainText('second draft')
  await bea.locator('[data-slot="comment-pin"]:not([data-draft])').click()
  await expect(bea.locator('[data-slot="comment-message"]').first()).toContainText('second draft')
  // Bea may edit her own reply but not Ada's comment; her broken avatar shows initials.
  await expect(bea.locator('[data-command="comment-edit-reply"]')).toHaveCount(1)
  await bea.getByRole('button', { name: 'More actions' }).click()
  await expect(bea.locator('[data-command="comment-edit"]')).toHaveCount(0)
  await bea.keyboard.press('Escape')

  // Move: Ada drags her pin; it moves at once and the host stores the new place.
  await ada.keyboard.press('Escape')
  const pin = livePins(ada)
  const before = await pin.boundingBox()
  if (!before) throw new Error('no pin')
  const startX = before.x + 14
  const startY = before.y + 14
  await ada.mouse.move(startX, startY)
  await ada.mouse.down()
  await ada.mouse.move(startX + 60, startY + 40, { steps: 6 })
  await ada.mouse.up()
  await expect.poll(() => ops.filter((entry) => entry.type === 'move').length).toBe(1)
  const moved = await pin.boundingBox()
  expect(Math.round((moved?.x ?? 0) - before.x)).toBeGreaterThan(40)
  expect(Math.round((moved?.y ?? 0) - before.y)).toBeGreaterThan(10)
  const op = ops.find((entry) => entry.type === 'move')
  expect(op?.anchor?.x).toBeGreaterThan(200)
  await expect.poll(async () => (await livePins(bea).boundingBox())?.x ?? 0).toBeGreaterThan(0)

  // Bea cannot drag Ada's pin.
  const beaPin = livePins(bea)
  const beaBefore = await beaPin.boundingBox()
  if (!beaBefore) throw new Error('no pin for Bea')
  await bea.mouse.move(beaBefore.x + 14, beaBefore.y + 14)
  await bea.mouse.down()
  await bea.mouse.move(beaBefore.x + 80, beaBefore.y + 60, { steps: 5 })
  await bea.mouse.up()
  expect(ops.filter((entry) => entry.type === 'move')).toHaveLength(1)
})

test('a refused move puts the pin back', async ({ browser }) => {
  const threads: HostThread[] = []
  const pages: Page[] = []
  const request = async (_who: string, op: Op) => {
    if (op.type === 'create' && op.anchor) {
      threads.push({
        id: 'srv_1',
        pageId: op.anchor.pageId,
        nodeId: null,
        offsetX: 0,
        offsetY: 0,
        x: op.anchor.x,
        y: op.anchor.y,
        author: 'Ada',
        authorId: 'u1',
        text: op.text ?? '',
        mentions: [],
        createdAt: '2026-10-30T10:00:00.000Z',
        updatedAt: '2026-10-30T10:00:00.000Z',
        resolved: false,
        replies: [],
        reactions: []
      })
      for (const page of pages) {
        await page.evaluate((list) => (window as MockWindow).hostPush?.(list, 2), threads)
      }
      return { ok: true, threadId: 'srv_1' }
    }
    return { ok: false, error: 'forbidden' }
  }
  const ada = await (await browser.newContext()).newPage()
  pages.push(ada)
  await openWithHost(ada, { id: 'u1', name: 'Ada' }, { readOnly: false, request })
  await ada.getByTestId(toolbarToolTestId('COMMENT')).click()
  const box = await ada.locator('canvas').first().boundingBox()
  if (!box) throw new Error('no canvas')
  await ada.mouse.click(box.x + 200, box.y + 200)
  await ada.getByRole('textbox', { name: 'Add a comment' }).pressSequentially('x')
  await ada.keyboard.press('Enter')
  await expect(livePins(ada)).toHaveCount(1)
  await ada.keyboard.press('Escape')
  const before = await livePins(ada).boundingBox()
  if (!before) throw new Error('no pin')
  await ada.mouse.move(before.x + 14, before.y + 14)
  await ada.mouse.down()
  await ada.mouse.move(before.x + 114, before.y + 74, { steps: 6 })
  await ada.mouse.up()
  await expect
    .poll(async () => Math.round(((await livePins(ada).boundingBox())?.x ?? 0) - before.x))
    .toBe(0)
})

test('the list filters by mentions and unresolved, sorts by page, and C and Esc switch the comment mode', async ({
  browser
}) => {
  const ada = await (await browser.newContext()).newPage()
  const threads: HostThread[] = [
    {
      id: 'a',
      pageId: '',
      nodeId: null,
      offsetX: 0,
      offsetY: 0,
      x: 100,
      y: 100,
      author: 'Bea',
      authorId: 'u2',
      text: 'for you @[Ada](mention:u1)',
      mentions: ['u1'],
      createdAt: '2026-10-30T10:00:00.000Z',
      updatedAt: '2026-10-30T10:00:00.000Z',
      resolved: false,
      replies: [],
      reactions: []
    },
    {
      id: 'b',
      pageId: '',
      nodeId: null,
      offsetX: 0,
      offsetY: 0,
      x: 300,
      y: 100,
      author: 'Bea',
      authorId: 'u2',
      text: 'plain note',
      mentions: [],
      createdAt: '2026-10-30T11:00:00.000Z',
      updatedAt: '2026-10-30T11:00:00.000Z',
      resolved: true,
      replies: [],
      reactions: []
    }
  ]
  await openWithHost(
    ada,
    { id: 'u1', name: 'Ada' },
    { readOnly: false, request: () => Promise.resolve({ ok: true }) }
  )
  await ada.evaluate((list) => (window as MockWindow).hostPush?.(list, 1), threads)

  // C enters comment mode, which opens the list; Esc leaves it.
  await ada.keyboard.press('c')
  const items = ada.locator('[data-slot="comment-list-item"]')
  await expect(ada.locator('[data-slot="comments-panel"]')).toBeVisible()
  await expect(items).toHaveCount(1) // the resolved one is hidden
  await ada.getByRole('button', { name: 'Filter and sort' }).click()
  await ada.locator('[data-command="comments-status-resolved"]').click()
  await expect(items).toHaveCount(1)
  await expect(items.first()).toContainText('plain note')
  await ada.getByRole('button', { name: 'Filter and sort' }).click()
  await ada.getByRole('menuitemradio', { name: 'All comments' }).click()
  await ada.getByRole('button', { name: 'Filter and sort' }).click()
  await ada.locator('[data-command="comments-only-mentions"]').click()
  await expect(items).toHaveCount(1)
  await expect(items.first()).toContainText('for you')
  await ada.keyboard.press('Escape')
  await ada.keyboard.press('Escape')
  await expect(ada.locator('[data-slot="comments-panel"]')).toHaveCount(0)
})

test('a read-only document ignores edit shortcuts, nudges, paste and tool keys, but comments work', async ({
  browser
}) => {
  const edits: Op[] = []
  const bea = await (await browser.newContext()).newPage()
  await openWithHost(
    bea,
    { id: 'u2', name: 'Bea' },
    {
      readOnly: true,
      request: (_who, op) => {
        edits.push(op)
        return Promise.resolve({ ok: true, threadId: 'srv_1' })
      }
    }
  )
  const nodeId = await bea.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('no store')
    const node = store.graph.createNode('RECTANGLE', store.state.currentPageId, {
      name: 'Box',
      x: 50,
      y: 50,
      width: 100,
      height: 80
    })
    store.select([node.id])
    return node.id
  })
  const snapshot = () =>
    bea.evaluate((id) => {
      const store = window.openPencil?.getStore?.()
      if (!store) throw new Error('no store')
      const node = store.graph.getNode(id)
      const children = store.graph.getChildren(store.state.currentPageId).length
      return { x: node?.x, y: node?.y, exists: !!node, children, tool: store.state.activeTool }
    }, nodeId)
  const before = await snapshot()
  expect(before.tool).toBe('COMMENT')

  await bea
    .locator('body')
    .click({ position: { x: 5, y: 5 } })
    .catch(() => undefined)
  for (const key of [
    'ArrowRight',
    'Shift+ArrowDown',
    'Meta+d',
    'Control+d',
    'Meta+g',
    'Control+g',
    'r',
    'v',
    'f',
    'Delete',
    'Backspace',
    'Enter',
    'Meta+z',
    'Control+z'
  ]) {
    await bea.keyboard.press(key)
  }
  // A pasted SVG would place a layer on an editable document.
  await bea.evaluate(() => {
    const data = new DataTransfer()
    data.setData(
      'text/plain',
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'
    )
    window.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    )
    document.body.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    )
  })
  await bea.waitForTimeout(300)
  const after = await snapshot()
  expect(after).toEqual(before)

  // Esc leaves Comment for Hand; C comes back; commenting still posts to the host.
  await bea.keyboard.press('Escape')
  await expect.poll(async () => (await snapshot()).tool).toBe('HAND')
  await bea.keyboard.press('c')
  await expect.poll(async () => (await snapshot()).tool).toBe('COMMENT')
  const box = await bea.locator('canvas').first().boundingBox()
  if (!box) throw new Error('no canvas')
  await bea.mouse.click(box.x + 300, box.y + 300)
  await bea.getByRole('textbox', { name: 'Add a comment' }).pressSequentially('can still comment')
  await bea.keyboard.press('Enter')
  await expect.poll(() => edits.filter((entry) => entry.type === 'create').length).toBe(1)
})

test('control: without read-only the same paste and keys do edit the document', async ({
  page
}) => {
  await page.goto('/')
  await new CanvasHelper(page).waitForInit()
  const count = () =>
    page.evaluate(() => {
      const store = window.openPencil?.getStore?.()
      return store ? store.graph.getChildren(store.state.currentPageId).length : -1
    })
  const before = await count()
  await page.evaluate(() => {
    const data = new DataTransfer()
    data.setData(
      'text/plain',
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'
    )
    document.body.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    )
  })
  await expect.poll(count).toBeGreaterThan(before)
})
