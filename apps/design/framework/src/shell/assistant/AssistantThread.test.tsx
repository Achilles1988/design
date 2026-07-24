// @vitest-environment jsdom
import type { ComponentType } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@assistant-ui/react-markdown', () => ({
  MarkdownTextPrimitive: (props: { className?: string }) => (
    <div data-testid="assistant-markdown" className={props.className} />
  ),
}))

vi.mock('@assistant-ui/react', () => ({
  useMessagePartText: () => ({ text: '**Assistant text**' }),
  ActionBarPrimitive: {
    Reload: (props: { children: unknown }) => (
      <button>{props.children as never}</button>
    ),
  },
  ErrorPrimitive: {
    Root: (props: { children: unknown }) => (
      <div role="alert">{props.children as never}</div>
    ),
    Message: () => <span>Request failed</span>,
  },
  ThreadPrimitive: {
    Root: (props: { children: unknown }) => <div>{props.children as never}</div>,
    Viewport: (props: { children: unknown }) => <div>{props.children as never}</div>,
    Empty: (props: { children: unknown }) => <>{props.children as never}</>,
    Messages: (props: { children: (value: { message: { role: string } }) => unknown }) => (
      <>{props.children({ message: { role: 'assistant' } }) as never}</>
    ),
  },
  MessagePrimitive: {
    Root: (props: { children: unknown }) => <div>{props.children as never}</div>,
    Error: (props: { children: unknown }) => <>{props.children as never}</>,
    Parts: (props: { components?: { Text?: ComponentType } }) => {
      const Text = props.components?.Text
      return Text ? <Text /> : null
    },
  },
  ComposerPrimitive: {
    Root: (props: { children: unknown }) => <form>{props.children as never}</form>,
    Input: (props: Record<string, unknown>) => <textarea {...props} />,
    Send: (props: { children: unknown }) => <button>{props.children as never}</button>,
  },
}))

import { AssistantThread } from './AssistantThread'

afterEach(cleanup)

describe('AssistantThread', () => {
  it('uses the Markdown text renderer and English composer copy', () => {
    render(<AssistantThread />)
    expect(screen.getByTestId('assistant-markdown')).toBeTruthy()
    expect(screen.getByText(/Describe the design style or layout/)).toBeTruthy()
    expect(screen.getByPlaceholderText('Describe what you need…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Request failed')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })
})
