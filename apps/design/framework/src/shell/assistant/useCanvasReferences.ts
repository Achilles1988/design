import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  useComposerRuntime,
  type Attachment,
} from '@assistant-ui/react'
import { captureCanvasReferences } from '@/lib/canvasAssistantApi'
import { useAssistantPageSession } from './pageSession'
import { registerVisualFileOrigin } from './visualAttachmentAdapter'

export const MAX_VISUAL_REFERENCES = 8
export const MAX_VISUAL_TOTAL_BYTES = 30 * 1024 * 1024
export const VISUAL_BATCH_ERROR =
  'You can attach up to 8 images and 30 MB per message.'
export const MAX_URL_REFERENCE_ERROR =
  'You can include up to 4 URL references per message.'
export const URL_CAPTURE_FAILURE =
  'This page could not be captured. Paste a screenshot or remove this reference.'
export const URL_CAPTURE_LOGIN_GUIDANCE =
  'If this capture misses a signed-in state, paste a screenshot from your browser.'

const MAX_URL_REFERENCES = 4

export type UrlReferenceDraft = {
  url: string
  state: 'uncaptured' | 'capturing' | 'ready' | 'failed' | 'dismissed'
  attachmentId?: string
  error?: string
}

function trimUrlPunctuation(candidate: string): string {
  let url = candidate.replace(/[.,;:!?}\]]+$/u, '')
  while (url.endsWith(')')) {
    const opens = [...url].filter((character) => character === '(').length
    const closes = [...url].filter((character) => character === ')').length
    if (closes <= opens) break
    url = url.slice(0, -1)
  }
  return url
}

function extractAllHttpUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"']+/giu) ?? []
  const distinct = new Set<string>()
  for (const match of matches) {
    const url = trimUrlPunctuation(match)
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        distinct.add(url)
      }
    } catch {
      // Incomplete URLs remain ordinary Composer text.
    }
  }
  return [...distinct]
}

export function extractHttpUrls(text: string): string[] {
  return extractAllHttpUrls(text).slice(0, MAX_URL_REFERENCES)
}

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

function base64PngFile(base64: string, index: number): File {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let offset = 0; offset < binary.length; offset += 1) {
    bytes[offset] = binary.charCodeAt(offset)
  }
  return new File(
    [bytes],
    `url-reference-${index + 1}.png`,
    { type: 'image/png' },
  )
}

function draftUrlsKey(drafts: readonly UrlReferenceDraft[]): string {
  return drafts.map((draft) => draft.url).join('\n')
}

export function useCanvasReferences(): {
  references: UrlReferenceDraft[]
  referenceError: string | null
  prepareAndMaybeSend(): Promise<'sent' | 'review' | 'blocked'>
  dismiss(url: string): void
} {
  const composer = useComposerRuntime()
  const { owner } = useAssistantPageSession()
  const initialUrls = extractHttpUrls(composer.getState().text)
  const [references, setReferences] = useState<UrlReferenceDraft[]>(
    () => initialUrls.map((url) => ({ url, state: 'uncaptured' })),
  )
  const [referenceError, setReferenceError] = useState<string | null>(() =>
    extractAllHttpUrls(composer.getState().text).length > MAX_URL_REFERENCES
      ? MAX_URL_REFERENCE_ERROR
      : null,
  )
  const referencesRef = useRef(references)
  const urlsKeyRef = useRef(draftUrlsKey(references))
  const operationRef = useRef(0)
  const captureControllerRef = useRef<AbortController | null>(null)
  const pendingRemovalsRef = useRef(new Set<Promise<void>>())
  const ownerKey = `${owner.pageKey}\n${owner.generation}`
  const ownerKeyRef = useRef(ownerKey)

  const replaceReferences = useCallback((next: UrlReferenceDraft[]) => {
    referencesRef.current = next
    urlsKeyRef.current = draftUrlsKey(next)
    setReferences(next)
  }, [])

  const stopCapture = useCallback(() => {
    operationRef.current += 1
    captureControllerRef.current?.abort()
    captureControllerRef.current = null
  }, [])

  const removeAttachment = useCallback((attachmentId: string) => {
    const index = composer.getState().attachments.findIndex(
      (attachment) => attachment.id === attachmentId,
    )
    if (index < 0) return Promise.resolve()
    const removal = composer.getAttachmentByIndex(index).remove()
      .catch(() => undefined)
      .finally(() => {
        pendingRemovalsRef.current.delete(removal)
      })
    pendingRemovalsRef.current.add(removal)
    return removal
  }, [composer])

  const reconcileText = useCallback(() => {
    const allUrls = extractAllHttpUrls(composer.getState().text)
    const urls = allUrls.slice(0, MAX_URL_REFERENCES)
    setReferenceError(
      allUrls.length > MAX_URL_REFERENCES
        ? MAX_URL_REFERENCE_ERROR
        : null,
    )
    const nextKey = urls.join('\n')
    if (nextKey === urlsKeyRef.current) {
      return {
        tooMany: allUrls.length > MAX_URL_REFERENCES,
        references: referencesRef.current,
      }
    }

    stopCapture()
    const previousByUrl = new Map(
      referencesRef.current.map((reference) => [reference.url, reference]),
    )
    const retainedUrls = new Set(urls)
    for (const reference of referencesRef.current) {
      if (!retainedUrls.has(reference.url) && reference.attachmentId) {
        void removeAttachment(reference.attachmentId)
      }
    }
    const next = urls.map((url) =>
      previousByUrl.get(url) ?? { url, state: 'uncaptured' as const },
    )
    replaceReferences(next)
    return {
      tooMany: allUrls.length > MAX_URL_REFERENCES,
      references: next,
    }
  }, [composer, removeAttachment, replaceReferences, stopCapture])

  useEffect(() => composer.subscribe(() => {
    reconcileText()
  }), [composer, reconcileText])

  useEffect(() => {
    if (ownerKeyRef.current === ownerKey) return
    ownerKeyRef.current = ownerKey
    stopCapture()
    for (const reference of referencesRef.current) {
      if (reference.attachmentId) void removeAttachment(reference.attachmentId)
    }
    setReferenceError(null)
    replaceReferences([])
  }, [ownerKey, removeAttachment, replaceReferences, stopCapture])

  useEffect(() => () => {
    stopCapture()
  }, [stopCapture])

  const dismiss = useCallback((url: string) => {
    const dismissed = referencesRef.current.find(
      (reference) => reference.url === url,
    )
    if (dismissed?.attachmentId) {
      void removeAttachment(dismissed.attachmentId)
    }
    const next = referencesRef.current.map((reference) =>
      reference.url === url
        ? {
            url: reference.url,
            state: 'dismissed' as const,
          }
        : reference,
    )
    replaceReferences(next)
  }, [removeAttachment, replaceReferences])

  const prepareAndMaybeSend = useCallback(async (): Promise<
    'sent' | 'review' | 'blocked'
  > => {
    const current = reconcileText()
    if (current.tooMany) return 'blocked'
    if (current.references.some((reference) => reference.state === 'failed')) {
      return 'blocked'
    }
    if (current.references.some((reference) => reference.state === 'capturing')) {
      return 'blocked'
    }

    const uncaptured = current.references.filter(
      (reference) => reference.state === 'uncaptured',
    )
    if (uncaptured.length === 0) {
      await Promise.all([...pendingRemovalsRef.current])
      if (!validateVisualBatch(composer.getState().attachments, [])) {
        setReferenceError(VISUAL_BATCH_ERROR)
        return 'blocked'
      }
      composer.send()
      return 'sent'
    }

    const controller = new AbortController()
    captureControllerRef.current?.abort()
    captureControllerRef.current = controller
    const operation = operationRef.current + 1
    operationRef.current = operation
    const capturingUrls = new Set(uncaptured.map((reference) => reference.url))
    replaceReferences(current.references.map((reference) =>
      capturingUrls.has(reference.url)
        ? { url: reference.url, state: 'capturing' }
        : reference,
    ))

    try {
      const response = await captureCanvasReferences(
        uncaptured.map((reference) => reference.url),
        controller.signal,
      )
      if (
        controller.signal.aborted
        || operationRef.current !== operation
        || ownerKeyRef.current !== ownerKey
      ) return 'blocked'

      const filesByUrl = new Map<string, File>()
      response.results.forEach((result, index) => {
        if (
          result.ok
          && result.mimeType === 'image/png'
          && typeof result.base64 === 'string'
        ) {
          try {
            filesByUrl.set(result.url, base64PngFile(result.base64, index))
          } catch {
            // Invalid image payloads follow the same recoverable capture path.
          }
        }
      })
      const files = uncaptured.flatMap((reference) => {
        const currentReference = referencesRef.current.find(
          (candidate) => candidate.url === reference.url,
        )
        if (currentReference?.state !== 'capturing') return []
        const file = filesByUrl.get(reference.url)
        return file ? [file] : []
      })
      if (!validateVisualBatch(composer.getState().attachments, files)) {
        setReferenceError(VISUAL_BATCH_ERROR)
        replaceReferences(referencesRef.current.map((reference) =>
          capturingUrls.has(reference.url) && reference.state === 'capturing'
            ? {
                url: reference.url,
                state: 'failed',
                error: VISUAL_BATCH_ERROR,
              }
            : reference,
        ))
        return 'blocked'
      }

      const completed = new Map<string, string>()
      for (const reference of uncaptured) {
        const currentReference = referencesRef.current.find(
          (candidate) => candidate.url === reference.url,
        )
        if (currentReference?.state !== 'capturing') continue
        const file = filesByUrl.get(reference.url)
        if (!file) continue
        if (
          controller.signal.aborted
          || operationRef.current !== operation
          || ownerKeyRef.current !== ownerKey
        ) return 'blocked'
        const previousIds = new Set(
          composer.getState().attachments.map((attachment) => attachment.id),
        )
        registerVisualFileOrigin(file, {
          origin: 'url-capture',
          sourceUrl: reference.url,
        })
        try {
          await composer.addAttachment(file)
        } catch {
          continue
        }
        const attachment = composer.getState().attachments.find(
          (candidate) => !previousIds.has(candidate.id),
        )
        if (
          controller.signal.aborted
          || operationRef.current !== operation
          || ownerKeyRef.current !== ownerKey
        ) {
          if (attachment) await removeAttachment(attachment.id)
          return 'blocked'
        }
        const latestReference = referencesRef.current.find(
          (candidate) => candidate.url === reference.url,
        )
        if (latestReference?.state !== 'capturing') {
          if (attachment) await removeAttachment(attachment.id)
          continue
        }
        if (attachment) completed.set(reference.url, attachment.id)
      }

      if (
        controller.signal.aborted
        || operationRef.current !== operation
        || ownerKeyRef.current !== ownerKey
      ) return 'blocked'
      replaceReferences(referencesRef.current.map((reference) => {
        if (
          !capturingUrls.has(reference.url)
          || reference.state !== 'capturing'
        ) return reference
        const attachmentId = completed.get(reference.url)
        return attachmentId
          ? {
              url: reference.url,
              state: 'ready',
              attachmentId,
            }
          : {
              url: reference.url,
              state: 'failed',
              error: URL_CAPTURE_FAILURE,
            }
      }))
      return 'review'
    } catch {
      if (
        controller.signal.aborted
        || operationRef.current !== operation
        || ownerKeyRef.current !== ownerKey
      ) return 'blocked'
      replaceReferences(referencesRef.current.map((reference) =>
        capturingUrls.has(reference.url) && reference.state === 'capturing'
          ? {
              url: reference.url,
              state: 'failed',
              error: URL_CAPTURE_FAILURE,
            }
          : reference,
      ))
      return 'review'
    } finally {
      if (captureControllerRef.current === controller) {
        captureControllerRef.current = null
      }
    }
  }, [
    composer,
    ownerKey,
    reconcileText,
    removeAttachment,
    replaceReferences,
  ])

  return {
    references,
    referenceError,
    prepareAndMaybeSend,
    dismiss,
  }
}
