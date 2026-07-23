import { describe, expect, it } from 'vitest'
import { AiClientError, classify, createModel } from './client'

describe('classify', () => {
  it('maps 401 to auth', () => {
    expect(classify(new Error('HTTP 401 unauthorized')).kind).toBe('auth')
  })
  it('maps rate limit to rate-limit', () => {
    expect(classify(new Error('429 rate limit')).kind).toBe('rate-limit')
  })
  it('passes through AiClientError unchanged', () => {
    const e = new AiClientError('network', 'x')
    expect(classify(e)).toBe(e)
  })
})

describe('createModel', () => {
  it('builds an anthropic model without throwing', () => {
    const model = createModel({ provider: 'anthropic', apiKey: 'k', model: 'claude-x' })
    expect(model).toBeTruthy()
  })
  it('builds an openai model with baseURL', () => {
    const model = createModel({
      provider: 'openai',
      apiKey: 'k',
      model: 'gpt-x',
      baseURL: 'https://x/v1',
    })
    expect(model).toBeTruthy()
  })
})
