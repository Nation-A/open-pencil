import type { CommentsHostMember } from './host-provider'

/**
 * workos: @mentions in a comment. A mention is stored in the text as `@[Name](mention:personId)`, so the
 * text stays plain Markdown for any reader, and the ids are read back out of it for the host's
 * `mentions` list. Candidates are only the members a host hands over (people with access).
 */
export type MentionMember = CommentsHostMember

const TOKEN = /@\[([^\]]*)\]\(mention:([^)\s]+)\)/gu

export function mentionToken(member: MentionMember): string {
  return `@[${member.name.replace(/[[\]]/gu, '')}](mention:${member.id})`
}

/** The person ids mentioned in `text`, in order, without repeats. */
export function parseMentions(text: string): string[] {
  const ids: string[] = []
  for (const match of text.matchAll(TOKEN)) {
    const id = match[2]
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/** `@Name` in place of each token, for previews and plain text. */
export function mentionsToPlain(text: string): string {
  return text.replace(TOKEN, '@$1')
}

/** `**@Name**` in place of each token, so the Markdown view shows a mention emphasized. */
export function mentionsToMarkdown(text: string): string {
  return text.replace(TOKEN, '**@$1**')
}

export interface MentionQuery {
  /** Index of the `@` that opened the query. */
  start: number
  query: string
}

/** The `@query` being typed at `caret`, or null when the caret is not in one. */
export function activeMentionQuery(value: string, caret: number): MentionQuery | null {
  const before = value.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at === -1) return null
  if (at > 0 && !/\s/u.test(before.charAt(at - 1))) return null
  const query = before.slice(at + 1)
  if (/[\n[\]()]/u.test(query) || query.length > 30) return null
  return { start: at, query }
}

/** Members whose name contains the query, name-prefix matches first; at most `limit`. */
export function filterMembers(
  members: readonly MentionMember[],
  query: string,
  limit = 6
): MentionMember[] {
  const needle = query.trim().toLowerCase()
  const matches = members.filter((member) => member.name.toLowerCase().includes(needle))
  matches.sort((a, b) => {
    const first = Number(b.name.toLowerCase().startsWith(needle))
    const second = Number(a.name.toLowerCase().startsWith(needle))
    return first - second
  })
  return matches.slice(0, limit)
}

/** The text with the open `@query` replaced by the member's token and a space; where the caret lands. */
export function applyMention(
  value: string,
  caret: number,
  open: MentionQuery,
  member: MentionMember
): { value: string; caret: number } {
  const token = `${mentionToken(member)} `
  const next = value.slice(0, open.start) + token + value.slice(caret)
  return { value: next, caret: open.start + token.length }
}
