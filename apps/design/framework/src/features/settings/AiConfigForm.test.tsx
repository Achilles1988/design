// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AiConfigForm } from './AiConfigForm'
import { clearAiConfig, readAiConfig } from '@/lib/ai/config'

afterEach(() => {
  cleanup()
  clearAiConfig()
})

describe('AiConfigForm', () => {
  it('renders empty defaults when no config stored', () => {
    render(<AiConfigForm />)
    expect((screen.getByLabelText(/API Key/i) as HTMLInputElement).value).toBe('')
  })

  it('disables baseURL for anthropic and enables for openai', () => {
    render(<AiConfigForm />)
    const baseUrl = screen.getByLabelText(/Base URL/i) as HTMLInputElement
    expect(baseUrl.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText(/OpenAI/i))
    expect(baseUrl.disabled).toBe(false)
  })

  it('saves valid config to localStorage', () => {
    render(<AiConfigForm />)
    fireEvent.click(screen.getByLabelText(/OpenAI/i))
    fireEvent.change(screen.getByLabelText(/Base URL/i), {
      target: { value: 'https://proxy.example/v1' },
    })
    fireEvent.change(screen.getByLabelText(/API Key/i), {
      target: { value: 'sk-x' },
    })
    fireEvent.change(screen.getByLabelText(/Model/i), {
      target: { value: 'gpt-4o-mini' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Save/i }))
    expect(readAiConfig()).toEqual({
      provider: 'openai',
      baseURL: 'https://proxy.example/v1',
      apiKey: 'sk-x',
      model: 'gpt-4o-mini',
    })
  })

  it('rejects save when required fields blank', () => {
    render(<AiConfigForm />)
    fireEvent.click(screen.getByRole('button', { name: /Save/i }))
    expect(readAiConfig()).toBeNull()
    expect(screen.getByText(/API Key and Model are required/i)).toBeTruthy()
  })
})
