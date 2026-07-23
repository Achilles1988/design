import { ComposerPrimitive, MessagePrimitive, ThreadPrimitive } from '@assistant-ui/react'
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
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  )
}

export function AssistantThread() {
  return (
    <ThreadPrimitive.Root className="aui-thread">
      <ThreadPrimitive.Viewport className="aui-thread-viewport">
        <ThreadPrimitive.Empty>
          <p className="aui-thread-empty">
            描述你想要的设计风格 / 布局，例如：“想做金融数据看板，冷色调，深色主题”。
          </p>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages>
          {({ message }) => (message.role === 'user' ? <UserBubble /> : <AssistantBubble />)}
        </ThreadPrimitive.Messages>
      </ThreadPrimitive.Viewport>
      <ComposerPrimitive.Root className="aui-composer">
        <ComposerPrimitive.Input
          className="aui-composer-input"
          placeholder="告诉我你在找什么…"
          rows={2}
          autoFocus
        />
        <ComposerPrimitive.Send className="aui-composer-send">发送</ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  )
}
