import { shallowRef } from 'vue'

import type { CommentReaction, CommentThread } from '@open-pencil/scene-graph'

/**
 * workos: where a comment lives when a host page owns the comment store. A host (the WorkOS
 * shell) injects one through `window.openPencil.setCommentsHost`; the editor then reads threads
 * from `subscribe`, sends every change through `request`, and writes nothing to the document's
 * plugin data. Without a host, the stock plugin-data provider in `document.ts` is used.
 */
export interface CommentsHostMember {
  id: string
  name: string
  /** Shown on the pin, the card and the @mention list; an image that fails to load falls back to initials. */
  avatarUrl?: string
}

export interface CommentsHostMe extends CommentsHostMember {
  color?: string
}

export interface CommentsHostCapabilities {
  comment: boolean
  resolve: boolean
  react: boolean
}

/** A pin's place: a point on a page, optionally on the top-level layer that carries it. The host adds the revision. */
export interface CommentAnchorInput {
  kind: 'canvas_point'
  pageId: string
  nodeId: string | null
  offsetX: number
  offsetY: number
  x: number
  y: number
}

export type CommentOp =
  | { type: 'create'; opId: string; anchor: CommentAnchorInput; text: string; mentions: string[] }
  | { type: 'reply'; opId: string; threadId: string; text: string; mentions: string[] }
  | {
      type: 'edit'
      opId: string
      threadId: string
      replyId: string | null
      text: string
      mentions: string[]
    }
  | { type: 'resolve'; opId: string; threadId: string; resolved: boolean }
  /**
   * The thread's author drags its pin elsewhere. `anchor` is the new place, computed like `create`'s: `nodeId`
   * is the top-level layer now under the pin (offsets are from its top-left corner), or null on bare canvas.
   * The editor shows the pin at the new place at once and puts it back if the result is not `ok`; the host
   * only moves pins of threads the caller started, and answers through `subscribe` like any other op.
   */
  | { type: 'move'; opId: string; threadId: string; anchor: CommentAnchorInput }
  | {
      type: 'react'
      opId: string
      threadId: string
      replyId: string | null
      emoji: string
      /** true adds the caller's reaction, false removes it. */
      on: boolean
    }
  | { type: 'delete'; opId: string; threadId: string; replyId: string | null }

export interface CommentOpResult {
  ok: boolean
  /** For `create`: the id the host gave the new thread. */
  threadId?: string
  error?: string
}

export interface CommentsHost {
  me: CommentsHostMe
  capabilities: CommentsHostCapabilities
  /**
   * The document is not editable: the tools are limited to Comment (and Hand), and keyboard shortcuts,
   * paste, cut and file drops that would change the design do nothing. Commenting stays on `capabilities.comment`.
   */
  readOnly?: boolean
  /** People with access, for @mention completion. */
  members: CommentsHostMember[]
  /** Calls back with every thread now and after each change; returns the unsubscribe. */
  subscribe: (callback: (threads: CommentThread[], rev: number) => void) => () => void
  request: (op: CommentOp) => Promise<CommentOpResult>
  /** Called once per document with the comments found in its plugin data; they are removed after it resolves. */
  importLegacy?: (threads: CommentThread[]) => unknown
}

export const commentsHost = shallowRef<CommentsHost | null>(null)
export const hostThreads = shallowRef<CommentThread[]>([])
export const hostRevision = shallowRef(0)

/** Pins moved by the signed-in person and not yet confirmed by the host: where each is shown meanwhile. */
export type PinMove = Pick<CommentAnchorInput, 'nodeId' | 'offsetX' | 'offsetY' | 'x' | 'y'> & {
  nodeName: string | null
}
export const pendingPinMoves = shallowRef<ReadonlyMap<string, PinMove>>(new Map())

export function setPendingPinMove(threadId: string, move: PinMove | null): void {
  const next = new Map(pendingPinMoves.value)
  if (move) next.set(threadId, move)
  else next.delete(threadId)
  pendingPinMoves.value = next
}

/** The threads with each unconfirmed pin move applied; a thread the host already reports there is left alone. */
export function applyPinMoves(
  threads: CommentThread[],
  moves: ReadonlyMap<string, PinMove>
): CommentThread[] {
  if (moves.size === 0) return threads
  return threads.map((thread) => {
    const move = moves.get(thread.id)
    return move ? { ...thread, ...move } : thread
  })
}

let unsubscribe: (() => void) | null = null

/** Injects (or with null, removes) the host's comment store. */
export function setCommentsHost(host: CommentsHost | null): void {
  unsubscribe?.()
  unsubscribe = null
  commentsHost.value = host
  hostThreads.value = []
  hostRevision.value = 0
  pendingPinMoves.value = new Map()
  if (!host) return
  unsubscribe = host.subscribe((threads, rev) => {
    if (commentsHost.value !== host) return
    hostThreads.value = threads
    // A move the host now reports is no longer pending.
    if (pendingPinMoves.value.size > 0) {
      const next = new Map(pendingPinMoves.value)
      for (const thread of threads) {
        const move = next.get(thread.id)
        if (
          move &&
          thread.x === move.x &&
          thread.y === move.y &&
          (thread.nodeId ?? null) === move.nodeId
        )
          next.delete(thread.id)
      }
      if (next.size !== pendingPinMoves.value.size) pendingPinMoves.value = next
    }
    hostRevision.value = rev
  })
}

/** What the signed-in person may do; everything when no host owns the store. */
export function commentCapabilities(host: CommentsHost | null): CommentsHostCapabilities {
  return host ? host.capabilities : { comment: true, resolve: true, react: true }
}

let opCounter = 0
export function newOpId(): string {
  opCounter += 1
  return `op_${Date.now().toString(36)}_${opCounter}_${crypto.randomUUID().slice(0, 8)}`
}

/** The reactions with the person's emoji switched on or off; for showing a toggle before the host answers. */
export function toggleReaction(
  reactions: readonly CommentReaction[] | undefined,
  emoji: string,
  userId: string
): { reactions: CommentReaction[]; on: boolean } {
  const list = (reactions ?? []).map((entry) => ({ ...entry, userIds: [...entry.userIds] }))
  const found = list.find((entry) => entry.emoji === emoji)
  if (!found) return { reactions: [...list, { emoji, userIds: [userId] }], on: true }
  const mine = found.userIds.includes(userId)
  found.userIds = mine ? found.userIds.filter((id) => id !== userId) : [...found.userIds, userId]
  return { reactions: list.filter((entry) => entry.userIds.length > 0), on: !mine }
}

let focusHandler: ((threadId: string) => Promise<boolean>) | null = null

/** The comments UI registers how a thread is opened; the window bridge calls it without importing the UI. */
export function setCommentFocusHandler(handler: (threadId: string) => Promise<boolean>): void {
  focusHandler = handler
}

/** Opens a thread (its page, pin and card); false when the thread never shows up or the UI is not loaded. */
export function focusCommentThread(threadId: string): Promise<boolean> {
  return focusHandler ? focusHandler(threadId) : Promise.resolve(false)
}
