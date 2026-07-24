import {
  ActionBarPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react'
import { AssistantMarkdown } from './AssistantMarkdown'
import './assistant.css'

function UserBubble() {
  return (
    <MessagePrimitive.Root className="aui-message aui-message--user">
      <MessagePrimitive.Parts />
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

export function AssistantThread() {
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
        <ComposerPrimitive.Input
          className="aui-composer-input"
          placeholder="Describe what you need…"
          rows={2}
          autoFocus
        />
        <ComposerPrimitive.Send className="aui-composer-send">Send</ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  )
}
