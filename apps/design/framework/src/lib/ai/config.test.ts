// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearAiConfig,
  hasValidConfig,
  readAiConfig,
  writeAiConfig,
} from './config'

afterEach(() => {
  globalThis.localStorage.clear()
})

describe('aiConfig', () => {
  it('returns null when storage is empty', () => {
    expect(readAiConfig()).toBeNull()
    expect(hasValidConfig()).toBe(false)
  })

  it('round-trips a valid anthropic config', () => {
    writeAiConfig({
      provider: 'anthropic',
      apiKey: 'sk-a',
      model: 'claude-sonnet-4-6',
    })
    expect(readAiConfig()).toEqual({
      provider: 'anthropic',
      apiKey: 'sk-a',
      model: 'claude-sonnet-4-6',
    })
    expect(hasValidConfig()).toBe(true)
  })

  it('keeps baseURL only for openai', () => {
    writeAiConfig({
      provider: 'openai',
      apiKey: 'sk-o',
      model: 'gpt-4o-mini',
      baseURL: 'https://proxy.example/v1',
    })
    expect(readAiConfig()?.baseURL).toBe('https://proxy.example/v1')

    writeAiConfig({
      provider: 'anthropic',
      apiKey: 'sk-a',
      model: 'claude-sonnet-4-6',
      baseURL: 'https://ignored',
    })
    expect(readAiConfig()?.baseURL).toBeUndefined()
  })

  it('returns null for malformed provider', () => {
    globalThis.localStorage.setItem(
      'wn.ai.config',
      JSON.stringify({ provider: 'bogus', apiKey: 'x', model: 'y' }),
    )
    expect(readAiConfig()).toBeNull()
  })

  it('returns null when required field missing', () => {
    globalThis.localStorage.setItem(
      'wn.ai.config',
      JSON.stringify({ provider: 'openai', apiKey: '', model: 'gpt-4o' }),
    )
    expect(readAiConfig()).toBeNull()
  })

  it('clears storage', () => {
    writeAiConfig({ provider: 'anthropic', apiKey: 'sk', model: 'm' })
    clearAiConfig()
    expect(readAiConfig()).toBeNull()
  })
})
