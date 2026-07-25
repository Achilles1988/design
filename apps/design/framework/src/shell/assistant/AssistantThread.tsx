import {
  ActionBarPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useComposerRuntime,
} from '@assistant-ui/react'
import {
  useState,
  type ClipboardEvent,
  type FormEvent,
  type MouseEvent,
  type Ref,
} from 'react'
import { AssistantMarkdown } from './AssistantMarkdown'
import {
  RestoredVisualAttachment,
  VisualAttachment,
} from './VisualAttachment'
import { VISUAL_MIME_TYPES } from './visualAttachmentAdapter'
import {
  MAX_VISUAL_REFERENCES,
  MAX_VISUAL_TOTAL_BYTES,
  URL_CAPTURE_LOGIN_GUIDANCE,
  useCanvasReferences,
  validateVisualBatch,
  VISUAL_BATCH_ERROR,
} from './useCanvasReferences'
import './assistant.css'

export {
  MAX_VISUAL_REFERENCES,
  MAX_VISUAL_TOTAL_BYTES,
  validateVisualBatch,
}

function UserBubble() {
  return (
    <MessagePrimitive.Root className="aui-message aui-message--user">
      <MessagePrimitive.Parts components={{ Image: RestoredVisualAttachment }} />
      <MessagePrimitive.Attachments>
        {({ attachment }) => attachment.content.map((part, index) =>
          part.type === 'image'
            ? (
                <RestoredVisualAttachment
                  key={`${attachment.id}-${index}`}
                  image={part.image}
                />
              )
            : null)}
      </MessagePrimitive.Attachments>
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
  const {
    references,
    referenceError,
    prepareAndMaybeSend,
    dismiss,
  } = useCanvasReferences()

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void prepareAndMaybeSend()
  }

  const handleSendClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    void prepareAndMaybeSend()
  }

  const visibleReferences = references.filter(
    (reference) => reference.state !== 'dismissed',
  )
  const hasCapturedReview = visibleReferences.some(
    (reference) =>
      reference.state === 'ready' || reference.state === 'failed',
  )

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
        <ThreadPrimitive.If running>
          <p className="aui-thread-generating" role="status" aria-live="polite">
            Generating…
          </p>
        </ThreadPrimitive.If>
      </ThreadPrimitive.Viewport>
      <ComposerPrimitive.Root
        className="aui-composer"
        onSubmit={handleSubmit}
      >
        <div className="aui-composer-attachments">
          <ComposerPrimitive.Attachments>
            {({ attachment }) => <VisualAttachment attachment={attachment} />}
          </ComposerPrimitive.Attachments>
        </div>
        {visibleReferences.length > 0
          ? (
              <ul
                className="aui-url-references"
                aria-label="URL references"
              >
                {visibleReferences.map((reference) => (
                  <li
                    key={reference.url}
                    className="aui-url-reference"
                  >
                    <span className="aui-url-reference__url">
                      {reference.url}
                    </span>
                    <span className="aui-url-reference__state">
                      {reference.state === 'capturing'
                        ? 'Capturing reference…'
                        : reference.state === 'ready'
                          ? 'Captured'
                          : reference.state === 'failed'
                            ? reference.error
                            : 'Ready to capture'}
                    </span>
                    <span className="aui-url-reference__guidance">
                      {URL_CAPTURE_LOGIN_GUIDANCE}
                    </span>
                    <button
                      type="button"
                      className="aui-url-reference__remove"
                      onClick={() => dismiss(reference.url)}
                    >
                      Remove reference
                    </button>
                  </li>
                ))}
              </ul>
            )
          : null}
        {hasCapturedReview
          ? (
              <p className="aui-composer-review" role="status">
                Review the captured references, then send again.
              </p>
            )
          : null}
        {referenceError
          ? (
              <p className="aui-composer-status" role="alert">
                {referenceError}
              </p>
            )
          : null}
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
        <ComposerPrimitive.Send
          className="aui-composer-send"
          onClick={handleSendClick}
        >
          Send
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  )
}
