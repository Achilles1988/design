import {
  AttachmentPrimitive,
  type Attachment,
  type ImageMessagePart,
} from '@assistant-ui/react'
import { useEffect, useState } from 'react'
import {
  getVisualAttachmentStore,
  parseAttachmentUri,
} from './visualAttachmentStore'

function useVisualObjectUrl(attachmentId: string | null): string | null {
  const [source, setSource] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    let objectUrl: string | null = null
    setSource(null)
    if (!attachmentId) return undefined

    void getVisualAttachmentStore()
      .then((store) => store.get(attachmentId))
      .then((record) => {
        if (!record) return
        objectUrl = URL.createObjectURL(record.blob)
        if (disposed) {
          URL.revokeObjectURL(objectUrl)
          objectUrl = null
          return
        }
        setSource(objectUrl)
      })
      .catch(() => {
        if (!disposed) setSource(null)
      })

    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachmentId])

  return source
}

export function VisualAttachment({
  attachment,
}: {
  attachment: Attachment
}) {
  const source = useVisualObjectUrl(attachment.id)

  return (
    <AttachmentPrimitive.Root className="aui-visual-attachment">
      <div className="aui-visual-attachment__thumbnail">
        {source
          ? (
              <img
                src={source}
                alt={`Preview of ${attachment.name}`}
              />
            )
          : (
              <span
                className="aui-visual-attachment__placeholder"
                role="img"
                aria-label={`Preview of ${attachment.name}`}
              />
            )}
      </div>
      <span className="aui-visual-attachment__name">
        <AttachmentPrimitive.Name />
      </span>
      <AttachmentPrimitive.Remove
        className="aui-visual-attachment__remove"
        type="button"
        aria-label="Remove image"
      >
        ×
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  )
}

export function RestoredVisualAttachment({
  image,
}: Pick<ImageMessagePart, 'image'>) {
  const attachmentId = parseAttachmentUri(image)
  const storedSource = useVisualObjectUrl(attachmentId)
  const source = attachmentId ? storedSource : image

  if (!source) return null
  return (
    <img
      className="aui-message-image"
      src={source}
      alt="Attached image"
    />
  )
}
