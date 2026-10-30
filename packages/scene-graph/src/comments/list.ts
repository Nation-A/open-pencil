import type { CommentThread } from '../types'
import { byCreatedAt, liveReplies, takesPartInThread } from './threads'

export const COMMENT_SORTS = ['newest', 'oldest', 'page'] as const
export const COMMENT_STATUSES = ['all', 'unresolved', 'resolved'] as const
export type CommentStatus = (typeof COMMENT_STATUSES)[number]
export type CommentSort = (typeof COMMENT_SORTS)[number]

export interface CommentListOptions {
  query: string
  showResolved: boolean
  /** Only threads on `pageId`. */
  onlyPage: boolean
  pageId: string
  /** Only threads `author` started or replied to. */
  onlyMine: boolean
  author: string
  sort: CommentSort
  /** workos: the host's actor id; with it, "mine" and "mentions" match by id rather than by name. */
  authorId?: string | null
  /** workos: all (default, follows `showResolved`), only open, or only resolved threads. */
  status?: CommentStatus
  /** workos: only threads whose text or replies @mention this person id. */
  mentionsId?: string | null
  /** workos: page ids in document order, for the `page` sort. */
  pageOrder?: readonly string[]
}

function matches(thread: CommentThread, query: string): boolean {
  const words = [thread.text, thread.author, thread.nodeName ?? '', thread.pageName ?? '']
  for (const entry of liveReplies(thread)) words.push(entry.text, entry.author)
  return words.some((word) => word.toLocaleLowerCase().includes(query))
}

function statusMatches(thread: CommentThread, status: CommentStatus, showResolved: boolean) {
  if (status === 'resolved') return thread.resolved
  if (status === 'unresolved') return !thread.resolved
  return showResolved || !thread.resolved
}

function takesPartAsId(thread: CommentThread, id: string): boolean {
  return thread.authorId === id || liveReplies(thread).some((entry) => entry.authorId === id)
}

/** Whether the thread or one of its live replies @mentions the person. */
export function mentionsPerson(thread: CommentThread, id: string): boolean {
  return (
    (thread.mentions ?? []).includes(id) ||
    liveReplies(thread).some((entry) => (entry.mentions ?? []).includes(id))
  )
}

/**
 * Each thread's number, counted in the order threads were started, as Figma numbers them in its
 * list. Deleted threads keep their place so the numbers people refer to do not shift.
 */
export function commentThreadNumbers(threads: readonly CommentThread[]): Map<string, number> {
  const started = threads.toSorted(byCreatedAt)
  return new Map(started.map((thread, index) => [thread.id, index + 1]))
}

/** The threads the comments list shows for its search, filters and order. */
export function listCommentThreads(
  threads: readonly CommentThread[],
  options: CommentListOptions
): CommentThread[] {
  const query = options.query.trim().toLocaleLowerCase()
  const author = options.author.trim()
  const status = options.status ?? 'all'
  const authorId = options.authorId ?? null
  const mentionsId = options.mentionsId ?? null
  const listed = threads.filter(
    (thread) =>
      !thread.deleted &&
      statusMatches(thread, status, options.showResolved) &&
      (!options.onlyPage || thread.pageId === options.pageId) &&
      (!options.onlyMine ||
        (authorId
          ? takesPartAsId(thread, authorId)
          : author !== '' && takesPartInThread(thread, author))) &&
      (mentionsId === null || mentionsPerson(thread, mentionsId)) &&
      (query === '' || matches(thread, query))
  )
  if (options.sort === 'page') {
    // Figma's "Sort by location": the document's page order, then the order started.
    const order = new Map((options.pageOrder ?? []).map((id, index) => [id, index]))
    const rank = (thread: CommentThread) => order.get(thread.pageId) ?? order.size
    return listed.sort((a, b) => rank(a) - rank(b) || byCreatedAt(a, b))
  }
  // Ordered by when each thread was started, as Figma's "Sort by date" is.
  const direction = options.sort === 'newest' ? -1 : 1
  return listed.sort((a, b) => direction * byCreatedAt(a, b))
}
