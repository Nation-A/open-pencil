import { expect, test } from 'bun:test'

import {
  activeMentionQuery,
  applyMention,
  filterMembers,
  mentionsToMarkdown,
  mentionsToPlain,
  mentionToken,
  parseMentions
} from '@/app/comments/mentions'

const members = [
  { id: 'p1', name: 'Ada Lovelace' },
  { id: 'p2', name: 'Alan Turing' },
  { id: 'p3', name: 'Grace Hopper' }
]

test('a mention is a token whose person id is read back out of the text', () => {
  const text = `hi ${mentionToken(members[0])} and ${mentionToken(members[2])} and ${mentionToken(members[0])}`
  expect(parseMentions(text)).toEqual(['p1', 'p3'])
  expect(mentionsToPlain(text)).toBe('hi @Ada Lovelace and @Grace Hopper and @Ada Lovelace')
  expect(mentionsToMarkdown(mentionToken(members[1]))).toBe('**@Alan Turing**')
  expect(parseMentions('no @one here')).toEqual([])
})

test('the open @query is found only at a word start', () => {
  expect(activeMentionQuery('hello @ad', 9)).toEqual({ start: 6, query: 'ad' })
  expect(activeMentionQuery('@', 1)).toEqual({ start: 0, query: '' })
  expect(activeMentionQuery('mail a@b', 8)).toBeNull()
  expect(activeMentionQuery('@ada lovelace\nnext', 18)).toBeNull()
  expect(activeMentionQuery('no mention', 5)).toBeNull()
})

test('candidates are only the given members, prefix matches first', () => {
  expect(filterMembers(members, 'ce').map((m) => m.id)).toEqual(['p1', 'p3'])
  expect(filterMembers([{ id: 'z', name: 'Zed Ada' }, members[0]], 'ada').map((m) => m.id)).toEqual(
    ['p1', 'z']
  )
  expect(filterMembers(members, '').length).toBe(3)
  expect(filterMembers(members, 'zzz')).toEqual([])
  expect(filterMembers(members, '', 2).length).toBe(2)
})

test('picking a candidate swaps the query for the token and leaves the caret after it', () => {
  const value = 'cc @gr please'
  const open = activeMentionQuery(value, 6)
  if (!open) throw new Error('no query')
  const next = applyMention(value, 6, open, members[2])
  expect(next.value).toBe(`cc ${mentionToken(members[2])}  please`)
  expect(next.value.slice(0, next.caret).endsWith('(mention:p3) ')).toBe(true)
})
