// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { FC, PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessageLike,
} from '@assistant-ui/react'
import {
  AssistantMarkdown,
  MarkdownErrorBoundary,
} from './AssistantMarkdown'

const markdownText = [
  '## Heading',
  '',
  '**Bold** and *emphasis* with [a link](https://example.com) and `inline`.',
  '',
  '> Quoted',
  '',
  '- First',
  '- Second',
  '',
  '```ts',
  'const value = 1',
  '```',
  '',
  '![blocked](https://example.com/image.png)',
].join('\n')

const noOpAdapter: ChatModelAdapter = {
  async *run() {},
}

const messages: ThreadMessageLike[] = [
  {
    role: 'assistant',
    content: [{ type: 'text', text: markdownText }],
    status: { type: 'complete', reason: 'stop' },
  },
]

const RuntimeProvider: FC<PropsWithChildren> = ({ children }) => {
  const runtime = useLocalRuntime(noOpAdapter, { initialMessages: messages })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  )
}

function BrokenMarkdown(): never {
  throw new Error('Markdown failed')
}

describe('MarkdownErrorBoundary', () => {
  it('falls back to safe plain text when Markdown rendering fails', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <MarkdownErrorBoundary
        resetKey="**raw**"
        fallback={<span>**raw**</span>}
      >
        <BrokenMarkdown />
      </MarkdownErrorBoundary>,
    )

    expect(screen.getByText('**raw**')).toBeTruthy()
    errorSpy.mockRestore()
  })
})

describe('AssistantMarkdown', () => {
  it('renders common Markdown elements and blocks external images', async () => {
    render(
      <RuntimeProvider>
        <ThreadPrimitive.Messages
          components={{
            Message: () => (
              <MessagePrimitive.Parts components={{ Text: AssistantMarkdown }} />
            ),
          }}
        />
      </RuntimeProvider>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Heading', level: 2 }),
    ).toBeTruthy()
    expect(screen.getByText('Bold').tagName).toBe('STRONG')
    expect(screen.getByText('emphasis').tagName).toBe('EM')
    expect(screen.getByRole('link', { name: 'a link' }).getAttribute('href')).toBe(
      'https://example.com',
    )
    expect(document.querySelector('blockquote')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('inline').tagName).toBe('CODE')
    expect(document.querySelector('pre code')?.textContent).toContain(
      'const value = 1',
    )
    expect(document.querySelector('img')).toBeNull()
  })
})
