// @vitest-environment jsdom
import { createRef, type ComponentType } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const assistantUi = vi.hoisted(() => ({
  addAttachment: vi.fn(),
  storeGet: vi.fn(),
  attachments: [] as Array<{
    id: string
    type: 'image'
    name: string
    contentType: string
    file: File
    status: { type: 'requires-action'; reason: 'composer-send' }
  }>,
  messageRole: 'assistant',
}))

vi.mock('./visualAttachmentStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./visualAttachmentStore')>()
  return {
    ...actual,
    getVisualAttachmentStore: async () => ({ get: assistantUi.storeGet }),
  }
})

vi.mock('@assistant-ui/react-markdown', () => ({
  MarkdownTextPrimitive: (props: { className?: string }) => (
    <div data-testid="assistant-markdown" className={props.className} />
  ),
}))

vi.mock('@assistant-ui/react', () => ({
  useMessagePartText: () => ({ text: '**Assistant text**' }),
  useComposerRuntime: () => ({
    addAttachment: assistantUi.addAttachment,
    getState: () => ({ attachments: assistantUi.attachments }),
  }),
  AttachmentPrimitive: {
    Root: (props: { children: unknown }) => <div>{props.children as never}</div>,
    Name: () => <>clipboard.png</>,
    Remove: (props: Record<string, unknown>) => <button {...props} />,
  },
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
      <>{props.children({ message: { role: assistantUi.messageRole } }) as never}</>
    ),
  },
  MessagePrimitive: {
    Root: (props: { children: unknown }) => <div>{props.children as never}</div>,
    Error: (props: { children: unknown }) => <>{props.children as never}</>,
    Parts: (props: { components?: {
      Text?: ComponentType
      Image?: ComponentType<{ image: string }>
    } }) => {
      const Text = props.components?.Text
      const Image = props.components?.Image
      if (Image) return <Image image="wn-attachment:image-1" />
      return Text ? <Text /> : null
    },
  },
  ComposerPrimitive: {
    Root: (props: { children: unknown }) => <form>{props.children as never}</form>,
    Input: ({
      addAttachmentOnPaste: _addAttachmentOnPaste,
      ...props
    }: Record<string, unknown>) => <textarea {...props} />,
    Attachments: (props: {
      children: (value: { attachment: typeof assistantUi.attachments[number] }) => unknown
    }) => (
      <>
        {assistantUi.attachments.map((attachment) => (
          <div key={attachment.id}>
            {props.children({ attachment }) as never}
          </div>
        ))}
      </>
    ),
    Send: (props: { children: unknown }) => <button>{props.children as never}</button>,
  },
}))

import { AssistantThread } from './AssistantThread'

function visualFile(name: string, type: string, size = 1): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { configurable: true, value: size })
  return file
}

function pasteEvent(items: Array<{
  kind: string
  getAsFile(): File | null
}>): ClipboardEvent {
  const event = new Event('paste', {
    bubbles: true,
    cancelable: true,
  }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: { items },
  })
  return event
}

beforeEach(() => {
  assistantUi.addAttachment.mockReset()
  assistantUi.addAttachment.mockResolvedValue(undefined)
  assistantUi.storeGet.mockReset()
  assistantUi.storeGet.mockResolvedValue({
    blob: new Blob(['image'], { type: 'image/png' }),
  })
  assistantUi.attachments = []
  assistantUi.messageRole = 'assistant'
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:restored-image'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

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

  it('forwards the composer input ref', () => {
    const composerInputRef = createRef<HTMLTextAreaElement>()

    render(<AssistantThread composerInputRef={composerInputRef} />)

    expect(composerInputRef.current).toBe(
      screen.getByPlaceholderText('Describe what you need…'),
    )
  })

  it('adds all pasted PNG/JPEG/WebP clipboard files', async () => {
    render(<AssistantThread />)
    const files = [
      visualFile('first.png', 'image/png'),
      visualFile('second.jpg', 'image/jpeg'),
      visualFile('third.webp', 'image/webp'),
    ]

    const event = pasteEvent(files.map((file) => ({
      kind: 'file',
      getAsFile: () => file,
    })))
    screen.getByPlaceholderText('Describe what you need…').dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    await waitFor(() => {
      expect(assistantUi.addAttachment).toHaveBeenCalledTimes(3)
    })
    expect(assistantUi.addAttachment.mock.calls.map(([file]) => file)).toEqual(files)
  })

  it('does not prevent a text-only paste', () => {
    render(<AssistantThread />)
    const event = pasteEvent([{
      kind: 'string',
      getAsFile: () => null,
    }])

    screen.getByPlaceholderText('Describe what you need…').dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(assistantUi.addAttachment).not.toHaveBeenCalled()
  })

  it('rejects a ninth visual reference without adding any of the batch', async () => {
    assistantUi.attachments = Array.from({ length: 8 }, (_, index) => ({
      id: `existing-${index}`,
      type: 'image' as const,
      name: `existing-${index}.png`,
      contentType: 'image/png',
      file: visualFile(`existing-${index}.png`, 'image/png'),
      status: { type: 'requires-action' as const, reason: 'composer-send' as const },
    }))
    render(<AssistantThread />)
    const event = pasteEvent([{
      kind: 'file',
      getAsFile: () => visualFile('ninth.png', 'image/png'),
    }])

    screen.getByPlaceholderText('Describe what you need…').dispatchEvent(event)

    expect(assistantUi.addAttachment).not.toHaveBeenCalled()
    expect((await screen.findByRole('status')).textContent).toBe(
      'You can attach up to 8 images and 30 MB per message.',
    )
  })

  it('rejects visual data above 30 MiB total without adding any of the batch', async () => {
    assistantUi.attachments = [{
      id: 'existing',
      type: 'image',
      name: 'existing.png',
      contentType: 'image/png',
      file: visualFile('existing.png', 'image/png', 30 * 1024 * 1024),
      status: { type: 'requires-action', reason: 'composer-send' },
    }]
    render(<AssistantThread />)
    const event = pasteEvent([{
      kind: 'file',
      getAsFile: () => visualFile('extra.png', 'image/png', 1),
    }])

    screen.getByPlaceholderText('Describe what you need…').dispatchEvent(event)

    expect(assistantUi.addAttachment).not.toHaveBeenCalled()
    expect(await screen.findByRole('status')).toBeTruthy()
  })

  it('renders restored wn-attachment message images', async () => {
    assistantUi.messageRole = 'user'

    render(<AssistantThread />)

    expect(await screen.findByRole('img', { name: 'Attached image' })).toBeTruthy()
  })

  it('does not render Add file or drag-and-drop controls', () => {
    render(<AssistantThread />)

    expect(screen.queryByRole('button', { name: /add file/i })).toBeNull()
    expect(screen.queryByText(/drag and drop/i)).toBeNull()
  })
})
