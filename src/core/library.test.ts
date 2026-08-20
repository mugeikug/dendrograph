import { describe, expect, it } from 'vitest'
import { createEntry, LibraryParseError, parseLibrary, serializeLibrary } from './library'

describe('library', () => {
  it('round-trips serialize/parse', () => {
    const entry = createEntry('例文1', '[S [NP the] [VP runs]]')
    entry.adjustments = { '0-0': { dx: 10, dy: -5 } }
    const json = serializeLibrary({ version: 1, entries: [entry] })
    const parsed = parseLibrary(json)
    expect(parsed.entries).toHaveLength(1)
    expect(parsed.entries[0]).toEqual(entry)
  })

  it('rejects JSON without an entries array', () => {
    expect(() => parseLibrary(JSON.stringify({ foo: 'bar' }))).toThrow(LibraryParseError)
  })

  it('rejects malformed JSON', () => {
    expect(() => parseLibrary('{not json')).toThrow(LibraryParseError)
  })

  it('rejects an entry with no input field', () => {
    expect(() => parseLibrary(JSON.stringify({ entries: [{ name: 'x' }] }))).toThrow(LibraryParseError)
  })

  it('fills in defaults for missing optional fields', () => {
    const parsed = parseLibrary(JSON.stringify({ entries: [{ input: '[S x]' }] }))
    expect(parsed.entries[0].name).toBe('無題1')
    expect(parsed.entries[0].adjustments).toEqual({})
    expect(typeof parsed.entries[0].id).toBe('string')
  })
})
