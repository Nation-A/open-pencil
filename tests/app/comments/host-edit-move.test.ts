import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, test } from 'bun:test'

import { readComments, writeComments, type CommentThread } from '@open-pencil/scene-graph'

import { safeAvatarSource } from '@/app/comments/avatar'
import {
  pendingPinMoves,
  setCommentsHost,
  type CommentOp,
  type CommentOpResult,
  type CommentsHost
} from '@/app/comments/host-provider'
import { documentLocked, LOCKED_SHORTCUT_IDS } from '@/app/comments/read-only'
import { useComments } from '@/app/comments/use'
import { setActiveEditorStore } from '@/app/editor/active-store'
import { createEditorStore } from '@/app/editor/session/create'

function thread(id: string, pageId: string, extra: Partial<CommentThread> = {}): CommentThread {
  return {
    id,
    pageId,
    x: 5,
    y: 6,
    author: 'Me',
    authorId: 'u1',
    text: id,
    createdAt: '2026-10-30T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
    resolved: false,
    replies: [],
    ...extra
  }
}

function mockHost(options: { result?: CommentOpResult; readOnly?: boolean } = {}) {
  const ops: CommentOp[] = []
  let listener: ((threads: CommentThread[], rev: number) => void) | null = null
  const host: CommentsHost = {
    me: { id: 'u1', name: 'Me' },
    capabilities: { comment: true, resolve: true, react: true },
    readOnly: options.readOnly,
    members: [],
    subscribe: (callback) => {
      listener = callback
      callback([], 0)
      return () => undefined
    },
    request: (op) => {
      ops.push(op)
      return Promise.resolve(options.result ?? { ok: true })
    }
  }
  return { host, ops, push: (threads: CommentThread[]) => listener?.(threads, 1) }
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

const tick = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

test('a host edit is a request for the thread or the reply, mentions included, own messages only', async () => {
  const store = openDocument()
  const mock = mockHost()
  setCommentsHost(mock.host)
  const page = store.state.currentPageId
  mock.push([
    thread('t1', page, {
      replies: [
        {
          id: 'r1',
          author: 'Me',
          authorId: 'u1',
          text: 'mine',
          createdAt: '2026-10-30T11:00:00.000Z'
        },
        {
          id: 'r2',
          author: 'Bea',
          authorId: 'u2',
          text: 'hers',
          createdAt: '2026-10-30T12:00:00.000Z'
        }
      ]
    }),
    thread('t2', page, { author: 'Bea', authorId: 'u2' })
  ])
  const comments = useComments()
  const [t1, t2] = comments.threads.value
  if (!t1 || !t2) throw new Error('threads missing')
  expect(comments.canEdit(t1, null)).toBe(true)
  expect(comments.canEdit(t1, 'r1')).toBe(true)
  expect(comments.canEdit(t1, 'r2')).toBe(false)
  expect(comments.canEdit(t2, null)).toBe(false)

  await comments.startEdit('t2', null)
  expect(comments.editing.value).toBeNull()
  await comments.startEdit('t1', 'r1')
  expect(comments.editing.value).toEqual({ threadId: 't1', replyId: 'r1' })
  comments.saveEdit('  fixed @[Bea](mention:u2) ')
  expect(comments.editing.value).toBeNull()
  expect(mock.ops).toHaveLength(1)
  expect(mock.ops[0]).toMatchObject({
    type: 'edit',
    threadId: 't1',
    replyId: 'r1',
    text: 'fixed @[Bea](mention:u2)',
    mentions: ['u2']
  })
})

test('a viewer without the comment capability cannot edit even their own comment', async () => {
  const store = openDocument()
  const mock = mockHost()
  mock.host.capabilities = { comment: false, resolve: false, react: false }
  setCommentsHost(mock.host)
  mock.push([thread('t1', store.state.currentPageId)])
  const t1 = useComments().threads.value[0]
  if (!t1) throw new Error('thread missing')
  expect(useComments().canEdit(t1, null)).toBe(false)
  expect(useComments().canMovePin(t1)).toBe(false)
})

test('without a host an edit changes the document comments and only for the same author', async () => {
  const store = openDocument()
  const page = store.state.currentPageId
  writeComments(store.graph, [
    thread('mine', page, { author: 'Me', authorId: undefined }),
    thread('theirs', page, { author: 'Bea', authorId: undefined })
  ])
  const comments = useComments()
  // The stock author is the collaboration identity's name.
  const me = comments.author.value
  writeComments(store.graph, [
    thread('mine', page, { author: me, authorId: undefined }),
    thread('theirs', page, { author: 'Someone else', authorId: undefined })
  ])
  await tick()
  const live = comments.threads.value
  const ownThread = live.find((entry) => entry.id === 'mine')
  const otherThread = live.find((entry) => entry.id === 'theirs')
  if (!ownThread || !otherThread) throw new Error('threads missing')
  expect(comments.canEdit(otherThread, null)).toBe(false)
  expect(comments.canEdit(ownThread, null)).toBe(true)
  await comments.startEdit('mine', null)
  comments.saveEdit('changed')
  expect(readComments(store.graph).find((entry) => entry.id === 'mine')?.text).toBe('changed')
})

test('moving the own pin shows it at once, sends a move op, and the host confirms', async () => {
  const store = openDocument()
  const mock = mockHost()
  setCommentsHost(mock.host)
  const page = store.state.currentPageId
  mock.push([thread('t1', page), thread('t2', page, { author: 'Bea', authorId: 'u2' })])
  const comments = useComments()

  comments.movePin('t2', { x: 50, y: 60 })
  await tick()
  expect(mock.ops).toHaveLength(0)

  comments.movePin('t1', { x: 50, y: 60 })
  expect(pendingPinMoves.value.get('t1')).toMatchObject({ x: 50, y: 60, nodeId: null })
  expect(comments.threads.value.find((entry) => entry.id === 't1')).toMatchObject({ x: 50, y: 60 })
  await tick()
  expect(mock.ops[0]).toMatchObject({
    type: 'move',
    threadId: 't1',
    anchor: {
      kind: 'canvas_point',
      pageId: page,
      nodeId: null,
      offsetX: 0,
      offsetY: 0,
      x: 50,
      y: 60
    }
  })
  // The host reports the pin there: nothing is pending any more.
  mock.push([thread('t1', page, { x: 50, y: 60 })])
  expect(pendingPinMoves.value.size).toBe(0)
})

test('dropping a pin on a layer attaches it with an offset from that layer', async () => {
  const store = openDocument()
  const mock = mockHost()
  setCommentsHost(mock.host)
  const page = store.state.currentPageId
  const frame = store.graph.createNode('RECTANGLE', page, {
    name: 'Card',
    x: 100,
    y: 100,
    width: 200,
    height: 100
  })
  mock.push([thread('t1', page)])
  useComments().movePin('t1', { x: 130, y: 120 })
  await tick()
  expect(mock.ops[0]).toMatchObject({
    type: 'move',
    anchor: { nodeId: frame.id, offsetX: 30, offsetY: 20, x: 130, y: 120 }
  })
})

test('a refused move puts the pin back', async () => {
  const store = openDocument()
  const mock = mockHost({ result: { ok: false, error: 'forbidden' } })
  setCommentsHost(mock.host)
  mock.push([thread('t1', store.state.currentPageId)])
  const comments = useComments()
  comments.movePin('t1', { x: 50, y: 60 })
  expect(comments.threads.value[0]).toMatchObject({ x: 50, y: 60 })
  await tick()
  expect(pendingPinMoves.value.size).toBe(0)
  expect(comments.threads.value[0]).toMatchObject({ x: 5, y: 6 })
})

test('avatar URLs: only images load', () => {
  expect(safeAvatarSource('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
  expect(safeAvatarSource('data:image/png;base64,AAAA')).toBeDefined()
  expect(safeAvatarSource(`${'java'}script:alert(1)`)).toBeUndefined()
  expect(safeAvatarSource('/relative.png')).toBeUndefined()
  expect(safeAvatarSource('')).toBeUndefined()
  expect(safeAvatarSource(undefined)).toBeUndefined()
})

test('the document is locked only while a host says read-only', () => {
  expect(documentLocked.value).toBe(false)
  setCommentsHost(mockHost().host)
  expect(documentLocked.value).toBe(false)
  setCommentsHost(mockHost({ readOnly: true }).host)
  expect(documentLocked.value).toBe(true)
  setCommentsHost(null)
  expect(documentLocked.value).toBe(false)
  // Nothing that edits is on the list of keys a locked document answers.
  for (const id of LOCKED_SHORTCUT_IDS)
    expect(id).not.toMatch(/delete|paste|group|duplicate|undo|redo|save/u)
})
