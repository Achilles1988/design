import { useCallback, useMemo, useRef, useState } from 'react'
import type { AssetMeta } from '@/lib/ai/assetIndex'
import { AiClientError, runAssetSearchTurn, type ChatMessage, type RunAssetSearchTurnInput } from '@/lib/ai/client'
import { readAiConfig } from '@/lib/ai/config'
import {
  applyFilter,
  mergeFilterDelta,
  type Filter,
} from '@/lib/ai/filterState'
import { buildSystemPrompt } from '@/lib/ai/promptBuild'
import type { Reply } from '@/lib/ai/schema'
import type { AssetKind } from '@/lib/types'

export type ChatEntryKind = 'normal' | 'relevance-rejected' | 'error'

export type ChatEntry = {
  id: string
  role: 'user' | 'assistant'
  content: string
  kind?: ChatEntryKind
  deltaSummary?: string
}

export type UseAssetSearchAgentOptions = {
  kind: AssetKind
  index: AssetMeta[]
  filter: Filter
  onFilterChange: (next: Filter) => void
  basePrompt: string
  sendTurn?: (input: RunAssetSearchTurnInput) => Promise<Reply>
}

export type UseAssetSearchAgentApi = {
  entries: ChatEntry[]
  sending: boolean
  error: string | null
  ask: (text: string) => Promise<void>
  clear: () => void
}

function summarizeDelta(reply: Reply): string | undefined {
  const { add, remove } = reply.filter_delta
  const parts: string[] = []
  if (add.length > 0) parts.push(`+${add.map((a) => a.label).join(', ')}`)
  if (remove.length > 0) parts.push(`-${remove.join(', ')}`)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function nextEntryId(prev: ChatEntry[]): string {
  return `e${prev.length + 1}`
}

export function useAssetSearchAgent(options: UseAssetSearchAgentOptions): UseAssetSearchAgentApi {
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const send = options.sendTurn ?? runAssetSearchTurn

  const candidates = useMemo(
    () => applyFilter(options.index, options.filter),
    [options.index, options.filter],
  )

  const ask = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || inFlight.current) return
      inFlight.current = true
      setSending(true)
      setError(null)

      const userEntry: ChatEntry = {
        id: nextEntryId(entries),
        role: 'user',
        content: trimmed,
      }
      const nextEntries = [...entries, userEntry]
      setEntries(nextEntries)

      const config = readAiConfig()
      // When a DI sendTurn is injected (tests), skip the missing-config guard —
      // the injected function does not need a real AiConfig.
      if (!config && !options.sendTurn) {
        const errEntry: ChatEntry = {
          id: nextEntryId(nextEntries),
          role: 'assistant',
          content: '请先在 Settings 配置 AI provider。',
          kind: 'error',
        }
        setEntries([...nextEntries, errEntry])
        setError('missing-config')
        setSending(false)
        inFlight.current = false
        return
      }

      const systemPrompt = buildSystemPrompt({
        basePrompt: options.basePrompt,
        kind: options.kind,
        filter: options.filter,
        candidates,
      })
      const messages: ChatMessage[] = nextEntries
        .filter((e) => e.role === 'user' || (e.role === 'assistant' && e.kind !== 'error'))
        .map((e) => ({
          role: e.role,
          content: e.content,
        }))

      try {
        // config may be null here only when sendTurn is injected (DI path)
        const reply = await send({ config: config as NonNullable<typeof config>, systemPrompt, messages })
        const assistant: ChatEntry = {
          id: nextEntryId(nextEntries),
          role: 'assistant',
          content: reply.reply,
          kind: reply.is_relevant ? 'normal' : 'relevance-rejected',
          deltaSummary: reply.is_relevant ? summarizeDelta(reply) : undefined,
        }
        setEntries([...nextEntries, assistant])
        if (reply.is_relevant) {
          const nextFilter = mergeFilterDelta(options.filter, reply.filter_delta, 'ai')
          if (nextFilter !== options.filter) options.onFilterChange(nextFilter)
        }
      } catch (err) {
        const message =
          err instanceof AiClientError
            ? err.kind === 'auth'
              ? '鉴权失败，请检查 API Key。'
              : err.kind === 'network'
                ? '网络请求失败，稍后重试。'
                : err.kind === 'schema'
                  ? 'AI 返回格式异常，请重试。'
                  : err.message
            : err instanceof Error
              ? err.message
              : 'Unknown error'
        const errEntry: ChatEntry = {
          id: nextEntryId(nextEntries),
          role: 'assistant',
          content: message,
          kind: 'error',
        }
        setEntries([...nextEntries, errEntry])
        setError(message)
      } finally {
        setSending(false)
        inFlight.current = false
      }
    },
    [entries, candidates, options, send],
  )

  const clear = useCallback(() => {
    setEntries([])
    setError(null)
  }, [])

  return { entries, sending, error, ask, clear }
}
