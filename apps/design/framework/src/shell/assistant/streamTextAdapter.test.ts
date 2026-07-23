import { describe, expect, it } from 'vitest'
import { toCoreMessages } from './streamTextAdapter'

describe('toCoreMessages', () => {
  it('extracts and joins text parts per message', () => {
    const out = toCoreMessages([
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'hi' },
          { type: 'text', text: 'there' },
        ],
      },
    ])
    expect(out).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi\nthere' },
    ])
  })

  it('drops non-text parts and empty messages', () => {
    const out = toCoreMessages([
      { role: 'assistant', content: [{ type: 'tool-call', toolName: 'x' }] },
      { role: 'user', content: [{ type: 'text', text: 'q' }] },
    ])
    expect(out).toEqual([{ role: 'user', content: 'q' }])
  })
})
