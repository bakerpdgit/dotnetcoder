import { describe, expect, it } from 'vitest'
import { parseArgs } from './args'

describe('parseArgs', () => {
  it('splits on whitespace', () => {
    expect(parseArgs('one two three')).toEqual(['one', 'two', 'three'])
  })

  it('keeps quoted arguments together and strips the quotes', () => {
    expect(parseArgs('--name "Ada Lovelace" --age 36')).toEqual(['--name', 'Ada Lovelace', '--age', '36'])
  })

  it('returns nothing for blank input', () => {
    expect(parseArgs('')).toEqual([])
    expect(parseArgs('   ')).toEqual([])
  })
})
