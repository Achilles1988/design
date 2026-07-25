import type { AttachmentAdapter } from '@assistant-ui/react'
import type { PersistedMessage } from './pageState'
import {
  attachmentUri,
  parseAttachmentUri,
  type VisualAttachmentStore,
} from './visualAttachmentStore'

export const VISUAL_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export const MAX_VISUAL_BYTES = 10 * 1024 * 1024

type VisualMimeType = (typeof VISUAL_MIME_TYPES)[number]
type VisualFileOrigin = {
  origin: 'clipboard' | 'url-capture'
  sourceUrl?: string
}

const fileOrigins = new WeakMap<File, VisualFileOrigin>()

export function registerVisualFileOrigin(
  file: File,
  metadata: VisualFileOrigin,
): void {
  fileOrigins.set(file, metadata)
}

function consumeVisualFileOrigin(file: File): VisualFileOrigin | undefined {
  const metadata = fileOrigins.get(file)
  fileOrigins.delete(file)
  return metadata
}

function isVisualMimeType(value: string): value is VisualMimeType {
  return (VISUAL_MIME_TYPES as readonly string[]).includes(value)
}

export function createVisualAttachmentAdapter(input: {
  getPageKey(): string
  store: VisualAttachmentStore
  originForFile(file: File): VisualFileOrigin
}): AttachmentAdapter {
  return {
    accept: VISUAL_MIME_TYPES.join(','),
    async add({ file }) {
      if (!isVisualMimeType(file.type)) {
        throw new Error('Only PNG, JPEG, and WebP images are supported.')
      }
      if (file.size > MAX_VISUAL_BYTES) {
        throw new Error('Each image must be 10 MiB or smaller.')
      }

      const pageKey = input.getPageKey()
      const bitmap = await createImageBitmap(file)
      const { width, height } = bitmap
      bitmap.close()
      if (input.getPageKey() !== pageKey) {
        throw new Error(
          'The Canvas changed before this image could be attached.',
        )
      }
      const id = crypto.randomUUID()
      await input.store.put({
        id,
        pageKey,
        blob: file,
        mimeType: file.type,
        width,
        height,
        ...consumeVisualFileOrigin(file) ?? input.originForFile(file),
        createdAt: new Date().toISOString(),
      })

      return {
        id,
        type: 'image',
        name: file.name,
        contentType: file.type,
        file,
        status: { type: 'requires-action', reason: 'composer-send' },
      }
    },
    async send(attachment) {
      return {
        ...attachment,
        status: { type: 'complete' },
        content: [{ type: 'image', image: attachmentUri(attachment.id) }],
      }
    },
    async remove(attachment) {
      await input.store.delete(attachment.id)
    },
  }
}

export function extractAttachmentIds(
  messages: readonly PersistedMessage[],
): Set<string> {
  const ids = new Set<string>()
  for (const message of messages) {
    if (message.role !== 'user' || !Array.isArray(message.content)) continue
    for (const part of message.content) {
      if (
        !part ||
        typeof part !== 'object' ||
        part.type !== 'image' ||
        typeof part.image !== 'string'
      ) continue
      const id = parseAttachmentUri(part.image)
      if (id) ids.add(id)
    }
  }
  return ids
}
