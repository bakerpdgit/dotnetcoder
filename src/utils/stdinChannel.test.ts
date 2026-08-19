import { describe, expect, it } from 'vitest'
import { SAB_TOTAL_BYTES, STDIN_BUFFER_BYTES } from '../constants'
import { consumeLine, createStdinChannel, markWaiting, publishEof, publishLine, truncateUtf8 } from './stdinChannel'

// jsdom does not run cross-origin isolated, so SharedArrayBuffer may be absent.
// The layout logic is identical over a plain ArrayBuffer.
const newChannel = () => createStdinChannel(new ArrayBuffer(SAB_TOTAL_BYTES))

describe('stdin channel', () => {
  it('round-trips a line from the UI thread to the worker', () => {
    const channel = newChannel()
    markWaiting(channel)
    publishLine(channel, 'Ada Lovelace')
    expect(consumeLine(channel)).toBe('Ada Lovelace')
  })

  it('round-trips an empty line as an empty string, not null', () => {
    const channel = newChannel()
    markWaiting(channel)
    publishLine(channel, '')
    expect(consumeLine(channel)).toBe('')
  })

  it('round-trips multi-byte characters', () => {
    const channel = newChannel()
    markWaiting(channel)
    publishLine(channel, 'héllo — 世界 🎉')
    expect(consumeLine(channel)).toBe('héllo — 世界 🎉')
  })

  it('reports end of input as null', () => {
    const channel = newChannel()
    markWaiting(channel)
    publishEof(channel)
    expect(consumeLine(channel)).toBeNull()
  })

  it('does not leave stale bytes from a longer previous line', () => {
    const channel = newChannel()
    markWaiting(channel)
    publishLine(channel, 'a very long first line')
    expect(consumeLine(channel)).toBe('a very long first line')
    markWaiting(channel)
    publishLine(channel, 'hi')
    expect(consumeLine(channel)).toBe('hi')
  })

  it('truncates an over-long line without splitting a character', () => {
    const channel = newChannel()
    markWaiting(channel)
    // '世' is three bytes, so this overflows on a character boundary that a
    // naive slice would cut in half.
    publishLine(channel, '世'.repeat(STDIN_BUFFER_BYTES))
    const received = consumeLine(channel)!
    expect(received).not.toContain('�')
    expect(received.startsWith('世世世')).toBe(true)
  })
})

describe('truncateUtf8', () => {
  it('leaves short input untouched', () => {
    const bytes = new TextEncoder().encode('short')
    expect(truncateUtf8(bytes, 100)).toBe(bytes)
  })

  it('cuts back to a character boundary', () => {
    const bytes = new TextEncoder().encode('ab世')  // 1 + 1 + 3 bytes
    expect(new TextDecoder().decode(truncateUtf8(bytes, 4))).toBe('ab')
    expect(new TextDecoder().decode(truncateUtf8(bytes, 5))).toBe('ab世')
  })
})
