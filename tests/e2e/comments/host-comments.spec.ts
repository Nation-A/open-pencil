import { expect, test, type Page } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'
import { toolbarToolTestId } from '#tests/helpers/test-ids'

// Two editors, one mock host store between them: a pin placed in one shows in the other.
interface HostThread {
  id: string
  pageId: string
  x: number
  y: number
  author: string
  authorId: string
  text: string
  mentions: string[]
  createdAt: string
  updatedAt: string
  resolved: boolean
  replies: never[]
  reactions: Array<{ emoji: string; userIds: string[] }>
}

interface Op {
  type: string
  threadId?: string
  anchor?: { pageId: string; x: number; y: number }
  text?: string
  mentions?: string[]
  emoji?: string
  on?: boolean
  resolved?: boolean
}

interface MockWindow extends Window {
  hostPush?: (threads: HostThread[], rev: number) => void
  hostRequest?: (op: Op) => Promise<unknown>
}

async function openWithHost(
  page: Page,
  me: { id: string; name: string },
  options: { readOnly: boolean; request: (who: string, op: Op) => Promise<unknown> }
) {
  await page.goto('/')
  await new CanvasHelper(page).waitForInit()
  await page.exposeFunction('hostRequest', (op: Op) => options.request(me.id, op))
  await page.evaluate(
    ({ me: who, readOnly }) => {
      const w: MockWindow = window
      w.openPencil?.setCommentsHost?.({
        me: who,
        readOnly,
        capabilities: { comment: true, resolve: true, react: true },
        members: [
          { id: 'u1', name: 'Ada' },
          { id: 'u2', name: 'Bea' }
        ],
        subscribe: (callback) => {
          // Each mock editor opened its own blank document, so pins are placed on whichever page it shows.
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
    { me, readOnly: options.readOnly }
  )
}

test('a pin, an @mention and a reaction made in one editor show in the other', async ({
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
        x: op.anchor.x,
        y: op.anchor.y,
        author: who === 'u1' ? 'Ada' : 'Bea',
        authorId: who,
        text: op.text ?? '',
        mentions: op.mentions ?? [],
        createdAt: '2026-10-30T10:00:00.000Z',
        updatedAt: '2026-10-30T10:00:00.000Z',
        resolved: false,
        replies: [],
        reactions: []
      })
      await push()
      return { ok: true, threadId: 'srv_1' }
    }
    if (op.type === 'react' && op.emoji) {
      const target = threads.find((entry) => entry.id === op.threadId)
      if (target) target.reactions = op.on ? [{ emoji: op.emoji, userIds: [who] }] : []
      await push()
    }
    return { ok: true }
  }

  const ada = await (await browser.newContext()).newPage()
  const bea = await (await browser.newContext()).newPage()
  pages.push(ada, bea)
  await openWithHost(ada, { id: 'u1', name: 'Ada' }, { readOnly: false, request })
  await openWithHost(bea, { id: 'u2', name: 'Bea' }, { readOnly: true, request })

  // Bea may only comment: her toolbar is Comment and Hand.
  await expect(bea.getByTestId(toolbarToolTestId('COMMENT'))).toBeVisible()
  await expect(bea.getByTestId(toolbarToolTestId('RECTANGLE'))).toHaveCount(0)
  await expect(bea.getByTestId(toolbarToolTestId('COMMENT'))).toHaveAttribute(
    'aria-pressed',
    'true'
  )

  // Ada pins a comment and mentions Bea through the autocomplete.
  await ada.getByTestId(toolbarToolTestId('COMMENT')).click()
  const box = await ada.locator('canvas').first().boundingBox()
  if (!box) throw new Error('no canvas')
  await ada.mouse.click(box.x + 200, box.y + 200)
  const composer = ada.getByRole('textbox', { name: 'Add a comment' })
  await composer.pressSequentially('hi @be')
  await expect(ada.locator('[data-slot="mention-list"] li')).toHaveCount(1)
  await composer.press('Enter')
  await composer.pressSequentially('see this')
  await composer.press('Enter')

  expect(ops[0]).toMatchObject({ type: 'create', mentions: ['u2'] })
  await expect(ada.locator('[data-slot="comment-pin"]:not([data-draft])')).toHaveCount(1)
  await expect(bea.locator('[data-slot="comment-pin"]:not([data-draft])')).toHaveCount(1)

  // Bea opens the card, sees the mention as text and reacts; Ada sees the chip.
  await bea.locator('[data-slot="comment-pin"]:not([data-draft])').click()
  await expect(bea.locator('[data-slot="comment-message"]').first()).toContainText('@Bea')
  await bea.locator('[data-slot="comment-react-add"]').click()
  await bea.locator('[data-pick="👍"]').click()
  await ada.locator('[data-slot="comment-pin"]:not([data-draft])').click()
  await expect(ada.locator('[data-reaction="👍"]')).toContainText('1')
  expect(threads[0]?.reactions[0]?.userIds).toEqual(['u2'])

  // Nothing went into either document's plugin data.
  for (const page of pages) {
    const stored = await page.evaluate(() => {
      const store = window.openPencil?.getStore?.()
      if (!store) return []
      return store.graph.getNode(store.graph.rootId)?.pluginData ?? []
    })
    expect(JSON.stringify(stored)).not.toContain('srv_1')
  }
})
