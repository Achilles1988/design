export type SimpleThreadMessage = {
  role: 'user' | 'assistant' | 'system'
  content: Array<{ type: string; text?: string; [k: string]: unknown }>
}

export type CoreMessage = { role: 'user' | 'assistant' | 'system'; content: string }

export function toCoreMessages(messages: readonly SimpleThreadMessage[]): CoreMessage[] {
  const out: CoreMessage[] = []
  for (const m of messages) {
    const text = m.content
      .filter((p) => p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text as string)
      .join('\n')
    if (text.length > 0) out.push({ role: m.role, content: text })
  }
  return out
}
