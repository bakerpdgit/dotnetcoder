import { describe, expect, it } from 'vitest'
import { toInputLines } from './storage'

describe('toInputLines', () => {
  it('is empty for empty input', () => {
    expect(toInputLines('')).toEqual([])
  })

  it('splits one line per Console.ReadLine call', () => {
    expect(toInputLines('Ada\n21')).toEqual(['Ada', '21'])
  })

  it('ignores a single trailing newline rather than inventing an empty read', () => {
    expect(toInputLines('Ada\n21\n')).toEqual(['Ada', '21'])
  })

  it('keeps a deliberate blank line in the middle — a program may read an empty answer', () => {
    expect(toInputLines('Ada\n\n21\n')).toEqual(['Ada', '', '21'])
  })

  it('keeps a deliberate trailing blank line when the user typed two newlines', () => {
    expect(toInputLines('Ada\n\n')).toEqual(['Ada', ''])
  })

  it('normalises Windows line endings, so a pasted file behaves the same', () => {
    expect(toInputLines('Ada\r\n21\r\n')).toEqual(['Ada', '21'])
  })
})
