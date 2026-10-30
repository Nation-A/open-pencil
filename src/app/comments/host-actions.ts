import { computed, type Ref } from 'vue'

import { commentAnchor, type CommentThread, type SceneGraph } from '@open-pencil/scene-graph'

import {
  commentCapabilities,
  commentsHost,
  newOpId,
  toggleReaction,
  type CommentOp,
  type CommentOpResult
} from './host-provider'
import { parseMentions } from './mentions'

/**
 * workos: the comment actions while a host owns the store. Each one is a request to the host; the new
 * state comes back through the host's subscription, so nothing here changes a thread directly.
 */
export function createHostActions(options: {
  threads: Readonly<Ref<CommentThread[]>>
  activeThreadId: Ref<string | null>
}) {
  const { threads, activeThreadId } = options
  const host = commentsHost
  const can = computed(() => commentCapabilities(host.value))
  const members = computed(() => host.value?.members ?? [])
  const meId = computed(() => host.value?.me.id ?? null)

  async function send(op: CommentOp): Promise<CommentOpResult | null> {
    const current = host.value
    if (!current) return null
    try {
      return await current.request(op)
    } catch {
      return { ok: false, error: 'request failed' }
    }
  }

  async function create(
    graph: SceneGraph,
    place: { pageId: string; x: number; y: number },
    text: string
  ) {
    if (!can.value.comment) return
    const { nodeId, offsetX, offsetY, x, y } = commentAnchor(graph, place.pageId, place)
    const result = await send({
      type: 'create',
      opId: newOpId(),
      anchor: { kind: 'canvas_point', pageId: place.pageId, nodeId, offsetX, offsetY, x, y },
      text,
      mentions: parseMentions(text)
    })
    if (result?.ok && result.threadId) activeThreadId.value = result.threadId
  }

  function reply(threadId: string, text: string) {
    if (!can.value.comment) return
    void send({ type: 'reply', opId: newOpId(), threadId, text, mentions: parseMentions(text) })
  }

  function resolve(threadId: string, resolved: boolean) {
    if (!can.value.resolve) return
    void send({ type: 'resolve', opId: newOpId(), threadId, resolved })
  }

  function remove(threadId: string, replyId: string | null) {
    void send({ type: 'delete', opId: newOpId(), threadId, replyId })
  }

  /** Edits a thread's own text (replyId null) or one reply's. */
  function edit(threadId: string, replyId: string | null, text: string) {
    const body = text.trim()
    if (!body || !can.value.comment) return
    void send({
      type: 'edit',
      opId: newOpId(),
      threadId,
      replyId,
      text: body,
      mentions: parseMentions(body)
    })
  }

  /** Toggles the signed-in person's emoji on a thread (replyId null) or a reply. */
  function react(threadId: string, replyId: string | null, emoji: string) {
    const id = meId.value
    const thread = threads.value.find((entry) => entry.id === threadId)
    if (!id || !thread || !can.value.react) return
    const target = replyId ? thread.replies.find((entry) => entry.id === replyId) : thread
    if (!target) return
    const { on } = toggleReaction(target.reactions, emoji, id)
    void send({ type: 'react', opId: newOpId(), threadId, replyId, emoji, on })
  }

  return { can, members, meId, create, reply, resolve, remove, edit, react }
}
