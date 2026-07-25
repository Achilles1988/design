import {
  ActionBarPrimitive,
  type Attachment,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useComposerRuntime,
} from '@assistant-ui/react'
import { useState, type ClipboardEvent, type Ref } from 'react'
import { AssistantMarkdown } from './AssistantMarkdown'
import {
  RestoredVisualAttachment,
  VisualAttachment,
} from './VisualAttachment'
import { VISUAL_MIME_TYPES } from './visualAttachmentAdapter'
import './assistant.css'

export const MAX_VISUAL_REFERENCES = 8
export const MAX_VISUAL_TOTAL_BYTES = 30 * 1024 * 1024
const VISUAL_BATCH_ERROR = 'You can attach up to 8 images and 30 MB per message.'

export function validateVisualBatch(
  existing: readonly Attachment[],
  incoming: readonly File[],
): boolean {
  const existingVisuals = existing.filter((attachment) => attachment.type === 'image')
  const existingBytes = existingVisuals.reduce(
    (total, attachment) => total + (attachment.file?.size ?? 0),
    0,
  )
  const incomingBytes = incoming.reduce((total, file) => total + file.size, 0)
  return (
    existingVisuals.length + incoming.length <= MAX_VISUAL_REFERENCES
    && existingBytes + incomingBytes <= MAX_VISUAL_TOTAL_BYTES
  )
}

function UserBubble() {
  return (
    <MessagePrimitive.Root className="aui-message aui-message--user">
      <MessagePrimitive.Parts components={{ Image: RestoredVisualAttachment }} />
    </MessagePrimitive.Root>
  )
}

function AssistantBubble() {
  return (
    <MessagePrimitive.Root className="aui-message aui-message--assistant">
      <MessagePrimitive.Parts components={{ Text: AssistantMarkdown }} />
      <MessagePrimitive.Error>
        <ErrorPrimitive.Root className="aui-message-error">
          <ErrorPrimitive.Message />
          <ActionBarPrimitive.Reload className="aui-message-retry">
            Retry
          </ActionBarPrimitive.Reload>
        </ErrorPrimitive.Root>
      </MessagePrimitive.Error>
    </MessagePrimitive.Root>
  )
}

export function AssistantThread({
  composerInputRef,
}: {
  composerInputRef?: Ref<HTMLTextAreaElement>
}) {
  const composer = useComposerRuntime()
  const [visualStatus, setVisualStatus] = useState<string | null>(null)

  const addVisualFiles = async (files: readonly File[]) => {
    if (!validateVisualBatch(composer.getState().attachments, files)) {
      setVisualStatus(VISUAL_BATCH_ERROR)
      return
    }

    setVisualStatus(null)
    try {
      await Promise.all(files.map((file) => composer.addAttachment(file)))
    } catch {
      setVisualStatus('Unable to attach the pasted images.')
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
      .filter((file) => VISUAL_MIME_TYPES.includes(
        file.type as (typeof VISUAL_MIME_TYPES)[number],
      ))
    if (files.length === 0) return
    event.preventDefault()
    void addVisualFiles(files)
  }

  return (
    <ThreadPrimitive.Root className="aui-thread">
      <ThreadPrimitive.Viewport className="aui-thread-viewport">
        <ThreadPrimitive.Empty>
          <p className="aui-thread-empty">
            Describe the design style or layout you need, for example: “A dark finance dashboard with cool colors.”
          </p>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages>
          {({ message }) => (message.role === 'user' ? <UserBubble /> : <AssistantBubble />)}
        </ThreadPrimitive.Messages>
      </ThreadPrimitive.Viewport>
      <ComposerPrimitive.Root className="aui-composer">
        <div className="aui-composer-attachments">
          <ComposerPrimitive.Attachments>
            {({ attachment }) => <VisualAttachment attachment={attachment} />}
          </ComposerPrimitive.Attachments>
        </div>
        {visualStatus
          ? (
              <p className="aui-composer-status" role="status">
                {visualStatus}
              </p>
            )
          : null}
        <ComposerPrimitive.Input
          ref={composerInputRef}
          className="aui-composer-input"
          placeholder="Describe what you need…"
          rows={2}
          autoFocus
          addAttachmentOnPaste={false}
          onPaste={handlePaste}
        />
        <ComposerPrimitive.Send className="aui-composer-send">Send</ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  )
}
