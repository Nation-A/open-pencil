import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, test } from 'bun:test'

import { readComments, writeComments, type CommentThread } from '@open-pencil/scene-graph'

import {
  commentsHost,
  focusCommentThread as focusComment,
  hostThreads,
  setCommentsHost,
  toggleReaction,
  type CommentOp,
  type CommentsHost
} from '@/app/comments/host-provider'
import { mentionToken } from '@/app/comments/mentions'
import { useComments } from '@/app/comments/use'
import { setActiveEditorStore } from '@/app/editor/active-store'
import { createEditorStore } from '@/app/editor/session/create'
import { allowedTools, importLegacyComments } from '@/app/embedded-comments'

function thread(id: string, pageId: string, extra: Partial<CommentThread> = {}): CommentThread {
  return {
    id,
    pageId,
    x: 5,
    y: 6,
    author: 'Ada',
    text: id,
    createdAt: '2026-10-30T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
    resolved: false,
    replies: [],
    ...extra
  }
}

interface Mock {
  host: CommentsHost
  ops: CommentOp[]
  imports: CommentThread[][]
  push: (threads: CommentThread[]) => void
}

function mockHost(options: Partial<CommentsHost> = {}): Mock {
  const ops: CommentOp[] = []
  const imports: CommentThread[][] = []
  let listener: ((threads: CommentThread[], rev: number) => void) | null = null
  let rev = 0
  const host: CommentsHost = {
    me: { id: 'u1', name: 'Me' },
    capabilities: { comment: true, resolve: true, react: true },
    members: [
      { id: 'u2', name: 'Bea' },
      { id: 'u3', name: 'Cy' }
    ],
    subscribe: (callback) => {
      listener = callback
      callback([], rev)
      return () => {
        listener = null
      }
    },
    request: (op) => {
      ops.push(op)
      return Promise.resolve({ ok: true, threadId: 'srv_1' })
    },
    importLegacy: (threads) => {
      imports.push(threads)
    },
    ...options
  }
  return {
    host,
    ops,
    imports,
    push: (threads) => {
      rev += 1
      listener?.(threads, rev)
    }
  }
}

const stores: ReturnType<typeof createEditorStore>[] = []
function openDocument() {
  const store = createEditorStore()
  stores.push(store)
  setActiveEditorStore(store)
  return store
}

beforeEach(() => setCommentsHost(null))
afterEach(() => {
  setCommentsHost(null)
  for (const store of stores.splice(0)) store.dispose()
})

test('with a host, writes go to the host and never to the document plugin data', async () => {
  const store = openDocument()
  const mock = mockHost()
  setCommentsHost(mock.host)
  const comments = useComments()
  comments.startDraft({ pageId: store.state.currentPageId, x: 10, y: 20 })
  comments.addThread(`hello ${mentionToken({ id: 'u2', name: 'Bea' })}`)
  await Promise.resolve()
  await Promise.resolve()

  expect(mock.ops).toHaveLength(1)
  const op = mock.ops[0]
  if (op?.type !== 'create') throw new Error('expected create')
  expect(op.mentions).toEqual(['u2'])
  expect(op.anchor).toMatchObject({
    kind: 'canvas_point',
    pageId: store.state.currentPageId,
    x: 10,
    y: 20
  })
  expect(op.opId.length).toBeGreaterThan(4)
  expect(readComments(store.graph)).toEqual([])

  comments.reply('srv_1', 'ok')
  comments.setResolved('srv_1', true)
  comments.confirmDelete('srv_1')
  comments.deleteReply('srv_1', 'r1')
  expect(mock.ops.map((entry) => entry.type)).toEqual([
    'create',
    'reply',
    'resolve',
    'delete',
    'delete'
  ])
  expect(readComments(store.graph)).toEqual([])
  expect(commentsHost.value).toBe(mock.host)
})

test('threads come from the host subscription', () => {
  openDocument()
  const mock = mockHost()
  setCommentsHost(mock.host)
  mock.push([thread('t1', '0:1')])
  expect(hostThreads.value.map((entry) => entry.id)).toEqual(['t1'])
  expect(useComments().threads.value.map((entry) => entry.id)).toEqual(['t1'])
})

test('old plugin data comments are handed to the host once, then removed', async () => {
  const store = openDocument()
  writeComments(store.graph, [
    thread('old', store.state.currentPageId),
    thread('gone', '0:1', { deleted: true })
  ])
  const mock = mockHost()
  // The host is injected only after the first one is bound, as a host page does after the editor booted.
  commentsHost.value = mock.host
  expect(await importLegacyComments(mock.host, store.graph)).toBe(true)
  expect(mock.imports).toHaveLength(1)
  expect(mock.imports[0]?.map((entry) => entry.id)).toEqual(['old'])
  expect(readComments(store.graph)).toEqual([])
  expect(await importLegacyComments(mock.host, store.graph)).toBe(false)
  expect(mock.imports).toHaveLength(1)
})

test('legacy comments stay when the host cannot import or the import fails', async () => {
  const store = openDocument()
  writeComments(store.graph, [thread('old', store.state.currentPageId)])
  const cannot = mockHost({ importLegacy: undefined })
  commentsHost.value = cannot.host
  expect(await importLegacyComments(cannot.host, store.graph)).toBe(false)
  expect(readComments(store.graph)).toHaveLength(1)
  const failing = mockHost({
    importLegacy: () => {
      throw new Error('no')
    }
  })
  commentsHost.value = failing.host
  expect(await importLegacyComments(failing.host, store.graph)).toBe(false)
  expect(readComments(store.graph)).toHaveLength(1)
})

test('a commenter keeps Comment and Hand; a viewer only Hand; others everything', () => {
  expect(allowedTools(null)).toBeNull()
  expect(allowedTools(mockHost().host)).toBeNull()
  expect([...(allowedTools(mockHost({ readOnly: true }).host) ?? [])].sort()).toEqual([
    'COMMENT',
    'HAND'
  ])
  const viewer = mockHost({
    readOnly: true,
    capabilities: { comment: false, resolve: false, react: false }
  })
  expect([...(allowedTools(viewer.host) ?? [])]).toEqual(['HAND'])
})

test('a commenter who picks another tool lands on Comment', async () => {
  const store = openDocument()
  setCommentsHost(mockHost({ readOnly: true }).host)
  useComments()
  store.setTool('RECTANGLE')
  await Promise.resolve()
  expect(store.state.activeTool).toBe('COMMENT')
})

test('capabilities gate comment, resolve and react', async () => {
  const store = openDocument()
  const mock = mockHost({ capabilities: { comment: false, resolve: false, react: false } })
  setCommentsHost(mock.host)
  mock.push([thread('t1', store.state.currentPageId)])
  const comments = useComments()
  comments.startDraft({ pageId: store.state.currentPageId, x: 1, y: 1 })
  comments.addThread('nope')
  comments.reply('t1', 'nope')
  comments.setResolved('t1', true)
  comments.react('t1', null, '👍')
  expect(mock.ops).toEqual([])
})

test('a reaction toggles on and off for the signed-in person', async () => {
  const store = openDocument()
  const mock = mockHost()
  setCommentsHost(mock.host)
  mock.push([
    thread('t1', store.state.currentPageId, {
      reactions: [{ emoji: '👍', userIds: ['u1'] }],
      replies: [{ id: 'r1', author: 'Bea', text: 'x', createdAt: '2026-10-30T10:01:00.000Z' }]
    })
  ])
  const comments = useComments()
  comments.react('t1', null, '👍')
  comments.react('t1', null, '🎉')
  comments.react('t1', 'r1', '👍')
  expect(
    mock.ops.map((op) => (op.type === 'react' ? [op.replyId, op.emoji, op.on] : null))
  ).toEqual([
    [null, '👍', false],
    [null, '🎉', true],
    ['r1', '👍', true]
  ])
  expect(toggleReaction([{ emoji: '👍', userIds: ['u1'] }], '👍', 'u1')).toEqual({
    reactions: [],
    on: false
  })
})

test('focusComment switches to the thread page, opens its card, and waits for a late thread', async () => {
  const store = openDocument()
  const mock = mockHost()
  setCommentsHost(mock.host)
  const comments = useComments()
  store.preparationController.acknowledgePresentation(Number.MAX_SAFE_INTEGER)
  const second = store.graph.addPage('Second')
  mock.push([])
  const pending = focusComment('late')
  mock.push([thread('late', second.id, { x: 40, y: 50 })])
  expect(await pending).toBe(true)
  expect(store.state.currentPageId).toBe(second.id)
  expect(comments.activeThreadId.value).toBe('late')
}, 10000)
