import {
  Component,
  memo,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import {
  MarkdownTextPrimitive,
} from '@assistant-ui/react-markdown'
import { useMessagePartText } from '@assistant-ui/react'
import remarkGfm from 'remark-gfm'

type MarkdownErrorBoundaryProps = {
  children: ReactNode
  fallback: ReactNode
  resetKey: string
}

type MarkdownErrorBoundaryState = {
  failed: boolean
}

export class MarkdownErrorBoundary extends Component<
  MarkdownErrorBoundaryProps,
  MarkdownErrorBoundaryState
> {
  state: MarkdownErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): MarkdownErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  componentDidUpdate(previous: MarkdownErrorBoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false })
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function BlockedImage() {
  return null
}

function AssistantMarkdownImpl() {
  const part = useMessagePartText()

  return (
    <MarkdownErrorBoundary
      resetKey={part.text}
      fallback={<span className="aui-md-fallback">{part.text}</span>}
    >
      <MarkdownTextPrimitive
        className="aui-md"
        remarkPlugins={[remarkGfm]}
        components={{ img: BlockedImage }}
      />
    </MarkdownErrorBoundary>
  )
}

export const AssistantMarkdown = memo(AssistantMarkdownImpl)
