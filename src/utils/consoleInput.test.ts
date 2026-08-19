import { describe, expect, it } from 'vitest'
import { splitPastedInput } from './consoleInput'

const atEndOf = (draft: string) => [draft.length, draft.length] as const

describe('splitPastedInput', () => {
  it('leaves a single-line paste at the prompt', () => {
    const [start, end] = atEndOf('')
    expect(splitPastedInput('Ada', '', start, end)).toEqual({ submit: [], draft: 'Ada' })
  })

  it('submits all but the last line when there is no trailing newline', () => {
    const [start, end] = atEndOf('')
    expect(splitPastedInput('Ada\n21', '', start, end))
      .toEqual({ submit: ['Ada'], draft: '21' })
  })

  it('submits every line when the paste ends with a newline', () => {
    const [start, end] = atEndOf('')
    expect(splitPastedInput('Ada\n21\n', '', start, end))
      .toEqual({ submit: ['Ada', '21'], draft: '' })
  })

  it('keeps deliberate blank lines, which answer a prompt with an empty string', () => {
    const [start, end] = atEndOf('')
    expect(splitPastedInput('Ada\n\n21\n', '', start, end))
      .toEqual({ submit: ['Ada', '', '21'], draft: '' })
  })

  it('normalises Windows and old-Mac line endings', () => {
    const [start, end] = atEndOf('')
    expect(splitPastedInput('Ada\r\n21\r\n', '', start, end).submit).toEqual(['Ada', '21'])
    expect(splitPastedInput('Ada\r21\r', '', start, end).submit).toEqual(['Ada', '21'])
  })

  it('joins the paste onto text already typed at the prompt', () => {
    expect(splitPastedInput('da\n21', 'A', 1, 1))
      .toEqual({ submit: ['Ada'], draft: '21' })
  })

  it('keeps text after the caret on the final line, as a terminal would', () => {
    // Prompt reads "AZ" with the caret between them; pasting "da\n2" gives
    // "Ada" submitted and "2Z" left behind.
    expect(splitPastedInput('da\n2', 'AZ', 1, 1))
      .toEqual({ submit: ['Ada'], draft: '2Z' })
  })

  it('replaces a selection rather than duplicating it', () => {
    expect(splitPastedInput('X\nY', 'abcd', 1, 3))
      .toEqual({ submit: ['aX'], draft: 'Yd' })
  })

  it('handles a paste that is only a newline', () => {
    expect(splitPastedInput('\n', 'Ada', 3, 3))
      .toEqual({ submit: ['Ada'], draft: '' })
  })
})
