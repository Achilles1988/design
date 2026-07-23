# assistant-ui 聊天 UI 重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 用 assistant-ui 构建业务无关、可复用的 Shell 级聊天助手内核，并把现有"资产筛选"场景迁移到该内核（客户端 LocalRuntime + 流式 + 工具调用 + 生成式 UI）。

**Architecture:** Shell 常驻 `AssistantProvider`（`useLocalRuntime` + 自定义 `ChatModelAdapter`，adapter 内用 ai-sdk `streamText` 直连 provider）。各页通过 `useAssistantInstructions` 注入系统提示、通过 `useAssistantTool` 注册工具；工具执行由 assistant-ui 运行时托管。header 放入口按钮，右侧覆盖面板承载用 headless 原语手写的 `AssistantThread`。可用性由 `AssistantAvailabilityContext` 门控——仅注册工具的页面点亮入口。

**Tech Stack:** React 19、TypeScript、Vite 6、Vitest（node 环境 + jsdom-compat shim）、`@assistant-ui/react@0.14.27`（**headless 原语 + runtime**）、ai-sdk v4（`ai`、`@ai-sdk/anthropic`、`@ai-sdk/openai`）、zod。

> **执行期决策（已确认，option 2）：** 该版本无开箱样式化 `Thread`，仅导出 headless 原语（`ThreadPrimitive`/`MessagePrimitive`/`ComposerPrimitive`）。因此**不引入 Tailwind/shadcn/lucide/markdown 依赖**，用原语手写 `AssistantThread`，纯项目 CSS + token 着色。运行时/工具 API（`useLocalRuntime`、`AssistantRuntimeProvider`、`ChatModelAdapter`、`useAssistantTool`、`makeAssistantTool`、`useAssistantInstructions`）已核对确实从 `@assistant-ui/react` 导出。

## Global Constraints

- 工作目录：所有 npm / vitest 命令在 `apps/design/` 下执行（含 `package.json`、`vite.config.ts`、`node_modules`）。
- 源码根：`apps/design/framework/src`；导入别名 `@` → `framework/src`（见 `tsconfig.app.json` paths）。
- 测试：`test.environment: 'node'`，`setupFiles: ['framework/src/setup-jsdom-compat.ts']`；测试 glob `framework/**/*.test.ts(x)`；组件/hook 测试用 `@testing-library/react`。
- style 规范强制遵守（`dashboard`）：主色 `#0C5CAB`、IBM Plex Sans、`--space:8px`、`--radius:8px`、150–250ms 过渡、完整 hover/focus-visible/disabled/loading 态；仅用 `framework/src/styles/tokens.css` 的 token，不引入 off-spec 颜色/字体。layout 仅优先复用，右侧助手面板作为瞬态浮层自然融合。
- 明暗主题跟随根节点 `[data-theme]`（token 已切换）。
- **不引入 Tailwind**：`AssistantThread` 用原语手写、纯 CSS。
- ai-sdk v4：`streamText` 的 `fullStream` part 形如 `{type:'text-delta', textDelta}`、`{type:'tool-call', toolCallId, toolName, args}`、`{type:'error', error}`。
- DRY / YAGNI / TDD / 频繁提交；Conventional Commits。
- 不做多线程、历史持久化、后端端点（YAGNI）。

---

### Task 1: 确认依赖基线（@assistant-ui/react，去 Tailwind）

**Files:** Modify: `apps/design/package.json`（依赖已由 npm 调整）

**Interfaces:** Produces: 可导入的 `@assistant-ui/react`；无 Tailwind。

- [ ] **Step 1: 确认依赖状态**

Run（在 `apps/design/`）:
```bash
node -e "const p=require('fs').readFileSync('package.json','utf8'); if(/tailwind/.test(p)) throw new Error('tailwind must be removed'); if(!/@assistant-ui\/react/.test(p)) throw new Error('assistant-ui missing'); console.log('deps ok')"
```
Expected: 打印 `deps ok`。（`@assistant-ui/react` 已装、Tailwind 已卸。）

- [ ] **Step 2: 基线构建 + 测试**

Run:
```bash
npx tsc -b && npm run test
```
Expected: 通过（现有测试不受影响）。

- [ ] **Step 3: Commit**

```bash
git add apps/design/package.json apps/design/package-lock.json
git commit -m "chore: add @assistant-ui/react dependency"
```

---

### Task 2: 抽取 provider 模型工厂与错误分类

**Files:**
- Modify: `apps/design/framework/src/lib/ai/client.ts`
- Test: `apps/design/framework/src/lib/ai/client.test.ts`

**Interfaces:**
- Consumes: `AiConfig`（`./config`）
- Produces: `createModel(config: AiConfig): LanguageModelV1`；`classify(err: unknown): AiClientError`（导出）；保留 `AiClientError`、`AiClientErrorKind`、`ChatMessage`、`runAssetSearchTurn`（内部改用 `createModel`；Task 10 移除）

- [ ] **Step 1: 写失败测试** —— Create `client.test.ts`：
```ts
import { describe, expect, it } from 'vitest'
import { AiClientError, classify, createModel } from './client'

describe('classify', () => {
  it('maps 401 to auth', () => { expect(classify(new Error('HTTP 401 unauthorized')).kind).toBe('auth') })
  it('maps rate limit', () => { expect(classify(new Error('429 rate limit')).kind).toBe('rate-limit') })
  it('passes through AiClientError', () => { const e = new AiClientError('network','x'); expect(classify(e)).toBe(e) })
})
describe('createModel', () => {
  it('builds anthropic model', () => { expect(createModel({ provider:'anthropic', apiKey:'k', model:'c' })).toBeTruthy() })
  it('builds openai model with baseURL', () => { expect(createModel({ provider:'openai', apiKey:'k', model:'g', baseURL:'https://x/v1' })).toBeTruthy() })
})
```

- [ ] **Step 2: 运行确认失败** —— `npx vitest run framework/src/lib/ai/client.test.ts` → FAIL（未导出）。

- [ ] **Step 3: 实现（重构 client.ts）** —— 导出 `classify`，新增 `createModel`，`runAssetSearchTurn` 复用：
```ts
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject, type LanguageModelV1 } from 'ai'
import type { AiConfig } from './config'
import { ReplySchema, type Reply } from './schema'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }
export type AiClientErrorKind = 'auth' | 'rate-limit' | 'network' | 'schema' | 'unknown'

export class AiClientError extends Error {
  readonly kind: AiClientErrorKind
  constructor(kind: AiClientErrorKind, message: string) { super(message); this.name = 'AiClientError'; this.kind = kind }
}

export function classify(err: unknown): AiClientError {
  if (err instanceof AiClientError) return err
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'AI request failed'
  const lower = message.toLowerCase()
  if (lower.includes('401') || lower.includes('403') || lower.includes('forbidden') || lower.includes('unauthor') || lower.includes('api key')) return new AiClientError('auth', message)
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('retry-after')) return new AiClientError('rate-limit', message)
  if (lower.includes('fetch') || lower.includes('network') || lower.includes('failed to fetch')) return new AiClientError('network', message)
  if (lower.includes('schema') || lower.includes('parse') || lower.includes('validation')) return new AiClientError('schema', message)
  return new AiClientError('unknown', message)
}

export function createModel(config: AiConfig): LanguageModelV1 {
  return config.provider === 'anthropic'
    ? createAnthropic({ apiKey: config.apiKey })(config.model)
    : createOpenAI({ apiKey: config.apiKey, baseURL: config.baseURL })(config.model)
}

export type RunAssetSearchTurnInput = { config: AiConfig; systemPrompt: string; messages: ChatMessage[] }

export async function runAssetSearchTurn(input: RunAssetSearchTurnInput): Promise<Reply> {
  try {
    const result = await generateObject({ model: createModel(input.config), system: input.systemPrompt, messages: input.messages, schema: ReplySchema })
    return result.object
  } catch (err) { throw classify(err) }
}
```

- [ ] **Step 4: 运行确认通过** —— `npx vitest run framework/src/lib/ai/client.test.ts` → PASS。

- [ ] **Step 5: Commit** —— `git commit -m "refactor: extract createModel and classify from ai client"`

---

### Task 3: 消息转换纯函数

**Files:** Create/Test: `apps/design/framework/src/shell/assistant/streamTextAdapter.ts` / `.test.ts`

**Interfaces:** Produces:
- `type SimpleThreadMessage = { role:'user'|'assistant'|'system'; content: Array<{ type:string; text?:string; [k:string]:unknown }> }`
- `toCoreMessages(messages: readonly SimpleThreadMessage[]): { role; content:string }[]`（仅取 text part 拼接，丢空消息）

- [ ] **Step 1: 写失败测试** —— Create `streamTextAdapter.test.ts`：
```ts
import { describe, expect, it } from 'vitest'
import { toCoreMessages } from './streamTextAdapter'

describe('toCoreMessages', () => {
  it('joins text parts', () => {
    expect(toCoreMessages([
      { role:'user', content:[{ type:'text', text:'hello' }] },
      { role:'assistant', content:[{ type:'text', text:'hi' },{ type:'text', text:'there' }] },
    ])).toEqual([{ role:'user', content:'hello' },{ role:'assistant', content:'hi\nthere' }])
  })
  it('drops non-text and empty', () => {
    expect(toCoreMessages([
      { role:'assistant', content:[{ type:'tool-call', toolName:'x' }] },
      { role:'user', content:[{ type:'text', text:'q' }] },
    ])).toEqual([{ role:'user', content:'q' }])
  })
})
```

- [ ] **Step 2: 运行确认失败** —— `npx vitest run framework/src/shell/assistant/streamTextAdapter.test.ts` → FAIL。

- [ ] **Step 3: 实现** —— Create `streamTextAdapter.ts`：
```ts
export type SimpleThreadMessage = { role:'user'|'assistant'|'system'; content: Array<{ type:string; text?:string; [k:string]:unknown }> }
export type CoreMessage = { role:'user'|'assistant'|'system'; content:string }

export function toCoreMessages(messages: readonly SimpleThreadMessage[]): CoreMessage[] {
  const out: CoreMessage[] = []
  for (const m of messages) {
    const text = m.content.filter((p) => p.type === 'text' && typeof p.text === 'string').map((p) => p.text as string).join('\n')
    if (text.length > 0) out.push({ role: m.role, content: text })
  }
  return out
}
```

- [ ] **Step 4: 运行确认通过** —— PASS。
- [ ] **Step 5: Commit** —— `git commit -m "feat: add thread-to-core message conversion"`

---

### Task 4: streamText 桥接 adapter（流式累积 + 工具 + 中断 + 错误）

**Files:** Modify: `streamTextAdapter.ts`；Test: `streamTextAdapter.test.ts`

**Interfaces:** Consumes `createModel`/`classify`（`@/lib/ai/client`）、`toCoreMessages`。Produces:
- `RunResultContent = Array<{type:'text';text:string} | {type:'tool-call';toolCallId:string;toolName:string;args:unknown;argsText:string}>`
- `AdapterDeps = { streamTextImpl:(o)=>{fullStream:AsyncIterable<any>}; createModelImpl?; readConfig? }`
- `createStreamTextAdapter(deps): { run(opts:{messages;abortSignal;context?:{system?;tools?}}): AsyncGenerator<{content:RunResultContent}> }`

adapter 把 `context.tools`（仅 description+parameters，**不带 execute**）转 `streamText` tools，只吐 text/tool-call；工具执行交给运行时（Task 10）。

- [ ] **Step 1: 追加失败测试**（在 `streamTextAdapter.test.ts`）：
```ts
import { createStreamTextAdapter } from './streamTextAdapter'
import { AiClientError } from '@/lib/ai/client'

function fakeStream(parts:any[]){ return { fullStream:(async function*(){ for(const p of parts) yield p })() } }
const baseCtx = { context:{ system:'s', tools:{} }, abortSignal:new AbortController().signal }

describe('createStreamTextAdapter.run', () => {
  it('yields cumulative text', async () => {
    const a = createStreamTextAdapter({ streamTextImpl:()=>fakeStream([{type:'text-delta',textDelta:'He'},{type:'text-delta',textDelta:'llo'}]), createModelImpl:()=>({} as any), readConfig:()=>({provider:'openai',apiKey:'k',model:'m'}) })
    const seen:string[]=[]
    for await (const r of a.run({ messages:[{role:'user',content:[{type:'text',text:'hi'}]}], ...baseCtx })){ const t=r.content.find((c:any)=>c.type==='text') as any; if(t) seen.push(t.text) }
    expect(seen).toEqual(['He','Hello'])
  })
  it('accumulates tool calls with text', async () => {
    const a = createStreamTextAdapter({ streamTextImpl:()=>fakeStream([{type:'text-delta',textDelta:'ok'},{type:'tool-call',toolCallId:'t1',toolName:'apply_filter',args:{add:[]}},{type:'text-delta',textDelta:'!'}]), createModelImpl:()=>({} as any), readConfig:()=>({provider:'openai',apiKey:'k',model:'m'}) })
    let last:any; for await (const r of a.run({ messages:[], ...baseCtx })) last=r
    const tcs=last.content.filter((c:any)=>c.type==='tool-call'); expect(tcs).toHaveLength(1); expect(tcs[0].toolName).toBe('apply_filter')
    expect((last.content.find((c:any)=>c.type==='text')).text).toBe('ok!')
  })
  it('throws AiClientError when config missing', async () => {
    const a = createStreamTextAdapter({ streamTextImpl:()=>fakeStream([]), readConfig:()=>null })
    await expect(async()=>{ for await (const _ of a.run({ messages:[], ...baseCtx })){} }).rejects.toBeInstanceOf(AiClientError)
  })
})
```

- [ ] **Step 2: 运行确认失败** —— FAIL。

- [ ] **Step 3: 实现**（追加，并在顶部 import）：
```ts
import { jsonSchema, tool as aiTool } from 'ai'
import { AiClientError, classify, createModel } from '@/lib/ai/client'
import { readAiConfig, type AiConfig } from '@/lib/ai/config'

export type RunResultContent = Array<
  | { type:'text'; text:string }
  | { type:'tool-call'; toolCallId:string; toolName:string; args:unknown; argsText:string }
>
export type AdapterContext = { system?:string; tools?: Record<string,{ description?:string; parameters?:unknown }> }
export type AdapterRunOptions = { messages: readonly SimpleThreadMessage[]; abortSignal: AbortSignal; context?: AdapterContext }
export type AdapterDeps = {
  streamTextImpl: (opts: Record<string, unknown>) => { fullStream: AsyncIterable<Record<string, any>> }
  createModelImpl?: (config: AiConfig) => unknown
  readConfig?: () => AiConfig | null
}

function buildTools(tools: AdapterContext['tools']) {
  if (!tools) return undefined
  const out: Record<string, unknown> = {}
  for (const [name, def] of Object.entries(tools)) {
    out[name] = aiTool({ description: def.description ?? '', parameters: jsonSchema((def.parameters ?? { type:'object', properties:{} }) as any) })
  }
  return out
}

export function createStreamTextAdapter(deps: AdapterDeps) {
  const makeModel = deps.createModelImpl ?? createModel
  const getConfig = deps.readConfig ?? readAiConfig
  return {
    async *run({ messages, abortSignal, context }: AdapterRunOptions): AsyncGenerator<{ content: RunResultContent }> {
      const config = getConfig()
      if (!config) throw new AiClientError('unknown', '请先在 Settings 配置 AI provider。')
      try {
        const stream = deps.streamTextImpl({ model: makeModel(config), system: context?.system, messages: toCoreMessages(messages), tools: buildTools(context?.tools), abortSignal })
        let text = ''
        const toolCalls = new Map<string, { toolName: string; args: unknown }>()
        const emit = (): { content: RunResultContent } => {
          const content: RunResultContent = []
          if (text.length > 0) content.push({ type:'text', text })
          for (const [id, tc] of toolCalls) content.push({ type:'tool-call', toolCallId:id, toolName:tc.toolName, args:tc.args, argsText:JSON.stringify(tc.args ?? {}) })
          return { content }
        }
        for await (const part of stream.fullStream) {
          if (part.type === 'text-delta') { text += part.textDelta ?? ''; yield emit() }
          else if (part.type === 'tool-call') { toolCalls.set(part.toolCallId, { toolName: part.toolName, args: part.args }); yield emit() }
          else if (part.type === 'error') { throw classify(part.error) }
        }
      } catch (err) { throw classify(err) }
    },
  }
}
```

- [ ] **Step 4: 运行确认通过** —— 3 用例 PASS。
- [ ] **Step 5: Commit** —— `git commit -m "feat: add streamText chat model adapter"`

---

### Task 5: 可用性 Context

**Files:** Create/Test: `apps/design/framework/src/shell/assistant/availability.tsx` / `.test.tsx`

**Interfaces:** `AssistantAvailabilityProvider`；`useAssistantAvailability(): { available:boolean; setAvailable:(v:boolean)=>void }`

- [ ] **Step 1: 写失败测试** —— Create `availability.test.tsx`：
```tsx
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AssistantAvailabilityProvider, useAssistantAvailability } from './availability'
function Probe(){ const { available, setAvailable } = useAssistantAvailability(); return (<div><span data-testid="v">{String(available)}</span><button onClick={()=>setAvailable(true)}>on</button></div>) }
describe('AssistantAvailability', () => {
  it('defaults false, flips true', () => {
    render(<AssistantAvailabilityProvider><Probe/></AssistantAvailabilityProvider>)
    expect(screen.getByTestId('v').textContent).toBe('false')
    act(()=>{ screen.getByText('on').click() })
    expect(screen.getByTestId('v').textContent).toBe('true')
  })
})
```

- [ ] **Step 2: 运行确认失败** —— FAIL。

- [ ] **Step 3: 实现** —— Create `availability.tsx`：
```tsx
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
type AvailabilityApi = { available: boolean; setAvailable: (v: boolean) => void }
const Ctx = createContext<AvailabilityApi | null>(null)
export function AssistantAvailabilityProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState(false)
  const value = useMemo(() => ({ available, setAvailable }), [available])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export function useAssistantAvailability(): AvailabilityApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAssistantAvailability must be used within AssistantAvailabilityProvider')
  return ctx
}
```

- [ ] **Step 4: 运行确认通过** —— PASS。
- [ ] **Step 5: Commit** —— `git commit -m "feat: add assistant availability context"`

---

### Task 6: `usePageAssistant`（instructions + 可用性生命周期）

**Files:** Create/Test: `apps/design/framework/src/shell/assistant/usePageAssistant.ts` / `.test.tsx`

**Interfaces:** Consumes `useAssistantInstructions`（`@assistant-ui/react`）、`useAssistantAvailability`。Produces `usePageAssistant({ instructions:string; available?:boolean }): void`。

> 实现级细化：工具不放本 hook（避免在可变数组循环调 `useAssistantTool` 违反 rules-of-hooks）。工具由各页独立工具组件注册（Task 10）。

- [ ] **Step 1: 写失败测试** —— Create `usePageAssistant.test.tsx`：
```tsx
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
const instructionsSpy = vi.fn()
vi.mock('@assistant-ui/react', () => ({ useAssistantInstructions: (v: string) => instructionsSpy(v) }))
import { AssistantAvailabilityProvider, useAssistantAvailability } from './availability'
import { usePageAssistant } from './usePageAssistant'
let observed = false
function Observer(){ observed = useAssistantAvailability().available; return null }
function Page(){ usePageAssistant({ instructions:'do filtering', available:true }); return null }
describe('usePageAssistant', () => {
  it('registers instructions and toggles availability', () => {
    render(<AssistantAvailabilityProvider><Observer/><Page/></AssistantAvailabilityProvider>)
    expect(instructionsSpy).toHaveBeenCalledWith('do filtering')
    expect(observed).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败** —— FAIL。

- [ ] **Step 3: 实现** —— Create `usePageAssistant.ts`：
```ts
import { useEffect } from 'react'
import { useAssistantInstructions } from '@assistant-ui/react'
import { useAssistantAvailability } from './availability'
export type UsePageAssistantOptions = { instructions: string; available?: boolean }
export function usePageAssistant({ instructions, available = true }: UsePageAssistantOptions): void {
  useAssistantInstructions(instructions)
  const { setAvailable } = useAssistantAvailability()
  useEffect(() => { setAvailable(available); return () => setAvailable(false) }, [available, setAvailable])
}
```

- [ ] **Step 4: 运行确认通过** —— PASS。
- [ ] **Step 5: Commit** —— `git commit -m "feat: add usePageAssistant hook"`

---

### Task 7: `AssistantProvider`（LocalRuntime 装配）

**Files:** Create: `apps/design/framework/src/shell/assistant/AssistantProvider.tsx`

**Interfaces:** Consumes `useLocalRuntime`/`AssistantRuntimeProvider`/`ChatModelAdapter`（`@assistant-ui/react`）、`createStreamTextAdapter`、`AssistantAvailabilityProvider`。Produces `AssistantProvider: FC<{ children }>`。

> 集成装配（无单测，由 Task 9 集成 + 手动验证覆盖）。若安装版本 `ChatModelAdapter` 的 `run` 选项字段（`messages`/`context`/`abortSignal`）与此不符，按真实类型微调；核心是 `async *run` + 累积 yield。

- [ ] **Step 1: 实现** —— Create `AssistantProvider.tsx`：
```tsx
import { type ReactNode } from 'react'
import { streamText } from 'ai'
import { AssistantRuntimeProvider, useLocalRuntime, type ChatModelAdapter } from '@assistant-ui/react'
import { AssistantAvailabilityProvider } from './availability'
import { createStreamTextAdapter } from './streamTextAdapter'

const adapter = createStreamTextAdapter({ streamTextImpl: (opts) => streamText(opts as Parameters<typeof streamText>[0]) })
const modelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal, context }) {
    yield* adapter.run({ messages: messages as never, abortSignal, context: context as never })
  },
}
export function AssistantProvider({ children }: { children: ReactNode }) {
  const runtime = useLocalRuntime(modelAdapter, { maxSteps: 2 })
  return (
    <AssistantAvailabilityProvider>
      <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
    </AssistantAvailabilityProvider>
  )
}
```

- [ ] **Step 2: 类型检查** —— `npx tsc -b` → 无错误（按真实类型微调断言）。
- [ ] **Step 3: Commit** —— `git commit -m "feat: wire LocalRuntime AssistantProvider"`

---

### Task 8: 用 headless 原语手写 `AssistantThread` + 面板/入口 UI（token 着色）

**Files:**
- Create: `apps/design/framework/src/shell/assistant/AssistantThread.tsx`
- Create: `apps/design/framework/src/shell/assistant/AssistantPanel.tsx`
- Create: `apps/design/framework/src/shell/assistant/AssistantLauncher.tsx`
- Create: `apps/design/framework/src/shell/assistant/assistant.css`

**Interfaces:** Consumes `ThreadPrimitive`/`MessagePrimitive`/`ComposerPrimitive`（`@assistant-ui/react`）、`useAssistantAvailability`、`hasValidConfig`（`@/lib/ai/config`）、`Link`。Produces:
- `AssistantThread: FC`（原语组合：viewport + messages + composer）
- `AssistantLauncher: FC<{ open; onToggle }>`（header 按钮，`available=false` 返回 null）
- `AssistantPanel: FC<{ open; onClose }>`（右侧覆盖层；未配置显示引导，否则渲染 `AssistantThread`）

> 原语 API 以安装版本类型为准：`ThreadPrimitive.Root/Viewport/Messages/Empty`、`MessagePrimitive.Root/Parts`、`ComposerPrimitive.Root/Input/Send`。若某原语子组件命名不同，按 `@assistant-ui/react` 类型微调（不改变结构）。类名用 `aui-*` 便于 CSS 命中。

- [ ] **Step 1: 样式（现有 token，符合 dashboard 规范）** —— Create `assistant.css`：
```css
.assistant-launcher { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border:1px solid var(--color-border); border-radius:var(--radius); background:transparent; color:var(--color-muted); cursor:pointer; transition:color 180ms ease, background 180ms ease, border-color 180ms ease; }
.assistant-launcher:hover { color:var(--color-text); background:var(--color-surface-2); }
.assistant-launcher:focus-visible { outline:2px solid var(--color-primary); outline-offset:2px; }
.assistant-launcher--active { color:var(--color-primary); border-color:var(--color-primary); }

.assistant-overlay { position:fixed; inset:0; z-index:60; display:flex; justify-content:flex-end; }
.assistant-overlay__scrim { position:absolute; inset:0; background:color-mix(in srgb, var(--color-text) 40%, transparent); backdrop-filter:blur(4px); }
.assistant-panel { position:relative; z-index:1; display:flex; flex-direction:column; width:min(440px,100%); height:100%; background:color-mix(in srgb, var(--color-surface) 92%, transparent); border-left:1px solid var(--color-border); box-shadow:-8px 0 24px color-mix(in srgb, var(--color-text) 12%, transparent); animation:assistant-slide-in 200ms ease; }
@keyframes assistant-slide-in { from { transform:translateX(16px); opacity:0 } to { transform:translateX(0); opacity:1 } }
.assistant-panel__header { display:flex; align-items:center; justify-content:space-between; padding:calc(var(--space)*1.5) calc(var(--space)*2); border-bottom:1px solid var(--color-border); font-weight:700; }
.assistant-panel__close { width:28px; height:28px; border:none; border-radius:var(--radius); background:transparent; color:var(--color-muted); font-size:18px; cursor:pointer; }
.assistant-panel__close:hover { color:var(--color-text); background:var(--color-surface-2); }
.assistant-panel__body { flex:1; min-height:0; display:flex; flex-direction:column; }
.assistant-panel__guidance { display:flex; flex-direction:column; gap:calc(var(--space)*1.5); padding:calc(var(--space)*2); color:var(--color-muted); }

.aui-thread { display:flex; flex-direction:column; height:100%; min-height:0; }
.aui-thread-viewport { flex:1; min-height:0; overflow-y:auto; padding:calc(var(--space)*2); display:flex; flex-direction:column; gap:calc(var(--space)*1.5); scroll-behavior:smooth; }
.aui-thread-empty { color:var(--color-muted); font-size:13px; margin:auto 0; text-align:center; }
.aui-message { border:1px solid var(--color-border); border-radius:calc(var(--radius)*1.25); padding:calc(var(--space)*1) calc(var(--space)*1.25); background:var(--color-surface-2); font-size:14px; line-height:1.55; white-space:pre-wrap; word-break:break-word; }
.aui-message--user { align-self:flex-end; max-width:85%; background:color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-2)); border-color:color-mix(in srgb, var(--color-primary) 30%, var(--color-border)); }
.aui-message--assistant { align-self:flex-start; max-width:92%; }
.aui-composer { display:flex; gap:calc(var(--space)*1); padding:calc(var(--space)*1.25) calc(var(--space)*2); border-top:1px solid var(--color-border); background:var(--color-surface); }
.aui-composer-input { flex:1; min-height:40px; max-height:160px; resize:none; padding:8px 12px; border:1px solid var(--color-border); border-radius:var(--radius); background:var(--color-surface-2); color:var(--color-text); font-family:inherit; font-size:14px; }
.aui-composer-input:focus-visible { outline:2px solid var(--color-primary); outline-offset:1px; }
.aui-composer-send { border:none; border-radius:var(--radius); background:var(--color-primary); color:#fff; padding:0 16px; font-weight:600; cursor:pointer; transition:opacity 150ms ease; }
.aui-composer-send:disabled { opacity:.5; cursor:not-allowed; }

.assistant-filter-card { display:inline-flex; gap:calc(var(--space)*1); align-items:center; padding:4px 10px; border:1px solid color-mix(in srgb, var(--color-primary) 30%, var(--color-border)); border-radius:var(--radius); background:color-mix(in srgb, var(--color-primary) 8%, transparent); font-size:12px; }
.assistant-filter-card__count { color:var(--color-muted); }
```

- [ ] **Step 2: AssistantThread（原语组合）** —— Create `AssistantThread.tsx`：
```tsx
import { ComposerPrimitive, MessagePrimitive, ThreadPrimitive } from '@assistant-ui/react'
import './assistant.css'

export function AssistantThread() {
  return (
    <ThreadPrimitive.Root className="aui-thread">
      <ThreadPrimitive.Viewport className="aui-thread-viewport">
        <ThreadPrimitive.Empty>
          <p className="aui-thread-empty">描述你想要的设计风格/布局，例如：“想做金融数据看板，冷色调，深色主题”。</p>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage: () => (
              <MessagePrimitive.Root className="aui-message aui-message--user">
                <MessagePrimitive.Parts />
              </MessagePrimitive.Root>
            ),
            AssistantMessage: () => (
              <MessagePrimitive.Root className="aui-message aui-message--assistant">
                <MessagePrimitive.Parts />
              </MessagePrimitive.Root>
            ),
          }}
        />
      </ThreadPrimitive.Viewport>
      <ComposerPrimitive.Root className="aui-composer">
        <ComposerPrimitive.Input className="aui-composer-input" placeholder="告诉我你在找什么…" rows={2} autoFocus />
        <ComposerPrimitive.Send className="aui-composer-send">发送</ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  )
}
```
> 若安装版本 `ThreadPrimitive.Messages` 的 `components` prop 形状或 `MessagePrimitive.Parts` 命名不同，按 `@assistant-ui/react` 类型微调（保持"user/assistant 各一个气泡 + Parts 渲染"结构）。

- [ ] **Step 3: Launcher** —— Create `AssistantLauncher.tsx`：
```tsx
import { useAssistantAvailability } from './availability'
import './assistant.css'
function SparkIcon(){ return (<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2z"/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14z"/></svg>) }
export function AssistantLauncher({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { available } = useAssistantAvailability()
  if (!available) return null
  return (
    <button type="button" className={open ? 'assistant-launcher assistant-launcher--active' : 'assistant-launcher'} onClick={onToggle} aria-label={open ? 'Close assistant' : 'Open assistant'} aria-pressed={open} title="AI 助手">
      <SparkIcon />
    </button>
  )
}
```

- [ ] **Step 4: Panel** —— Create `AssistantPanel.tsx`：
```tsx
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { hasValidConfig } from '@/lib/ai/config'
import { AssistantThread } from './AssistantThread'
import './assistant.css'
export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent){ if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  const configured = hasValidConfig()
  return (
    <div className="assistant-overlay" role="dialog" aria-modal="true" aria-label="AI 助手">
      <div className="assistant-overlay__scrim" onClick={onClose} />
      <aside className="assistant-panel">
        <header className="assistant-panel__header">
          <span>AI 助手</span>
          <button type="button" className="assistant-panel__close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="assistant-panel__body">
          {configured ? <AssistantThread /> : (
            <div className="assistant-panel__guidance"><p>请先配置 AI provider。</p><Link to="/settings">打开 Settings</Link></div>
          )}
        </div>
      </aside>
    </div>
  )
}
```

- [ ] **Step 5: 类型检查** —— `npx tsc -b` → 无错误（按真实原语类型微调）。
- [ ] **Step 6: Commit** —— `git commit -m "feat: add primitive-based assistant thread, panel and launcher"`

---

### Task 9: 接入 `SidebarShell`

**Files:** Modify: `apps/design/framework/src/shell/SidebarShell.tsx`

**Interfaces:** Consumes `AssistantProvider`、`AssistantLauncher`、`AssistantPanel`。

- [ ] **Step 1: 包裹 shell + 加入口与面板** —— 顶部 import 追加 `useState`（合并已有）、`AssistantProvider`/`AssistantLauncher`/`AssistantPanel`；组件体加 `const [assistantOpen,setAssistantOpen]=useState(false)`；最外层用 `<AssistantProvider>` 包裹 `<div className="sidebar-shell">`；在 `sidebar-shell__header-spacer` 之后、主题按钮之前插 `<AssistantLauncher open={assistantOpen} onToggle={()=>setAssistantOpen(v=>!v)} />`；在最外 `</div>` 前挂 `<AssistantPanel open={assistantOpen} onClose={()=>setAssistantOpen(false)} />`。导航区不动。

- [ ] **Step 2: 构建 + 测试** —— `npx tsc -b && npm run test` → 通过（launcher 因 `available=false` 全站隐藏）。
- [ ] **Step 3: 手动验证** —— `npm run dev`：现有页面正常，header 暂无助手图标。
- [ ] **Step 4: Commit** —— `git commit -m "feat: mount assistant provider, launcher and panel in shell"`

---

### Task 10: 迁移资产筛选（apply_filter 工具 + 生成式卡片），移除旧抽屉

**Files:**
- Create/Test: `apps/design/framework/src/features/assets/assistantFilterTool.tsx` / `.test.tsx`
- Modify: `apps/design/framework/src/features/assets/AssetBrowserPage.tsx`
- Delete: `AiFilterDrawer.tsx`、`AiFilterDrawer.test.tsx`、`useAssetSearchAgent.ts`、`useAssetSearchAgent.test.ts`

**Interfaces:** Consumes `useAssistantTool`（`@assistant-ui/react`）、`mergeFilterDelta`/`applyFilter`/`Filter`（`@/lib/ai/filterState`）、`FilterDeltaAddSchema`（`@/lib/ai/schema`）、`usePageAssistant`、`buildSystemPrompt`。Produces:
- `AssetFilterTool: FC<{ index:AssetMeta[]; filterRef:MutableRefObject<Filter>; onFilterChange:(f:Filter)=>void }>`
- `applyFilterExecute(args, ctx): { applied; matchCount }`（纯逻辑，供测试/工具复用）

- [ ] **Step 1: 写失败测试** —— Create `assistantFilterTool.test.tsx`：
```tsx
import { describe, expect, it, vi } from 'vitest'
import { applyFilterExecute } from './assistantFilterTool'
import { emptyFilter, type Filter } from '@/lib/ai/filterState'
import type { AssetMeta } from '@/lib/ai/assetIndex'
const index = [
  { id:'a', title:'Dark board', summary:'', tags:['dark'], origin:'x' },
  { id:'b', title:'Light board', summary:'', tags:['light'], origin:'x' },
] as unknown as AssetMeta[]
describe('applyFilterExecute', () => {
  it('merges delta, calls onFilterChange, returns matchCount', () => {
    let current: Filter = emptyFilter()
    const onFilterChange = vi.fn((f: Filter) => { current = f })
    const filterRef = { current }
    const res = applyFilterExecute({ add:[{ kind:'tag', label:'dark', value:'dark' }], remove:[] }, { index, filterRef, onFilterChange })
    expect(onFilterChange).toHaveBeenCalledTimes(1)
    expect(res.matchCount).toBe(1)
    expect(res.applied.add).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 运行确认失败** —— FAIL。

- [ ] **Step 3: 实现工具 + 卡片** —— Create `assistantFilterTool.tsx`：
```tsx
import { type MutableRefObject } from 'react'
import { z } from 'zod'
import { useAssistantTool } from '@assistant-ui/react'
import type { AssetMeta } from '@/lib/ai/assetIndex'
import { applyFilter, mergeFilterDelta, type Filter } from '@/lib/ai/filterState'
import { FilterDeltaAddSchema } from '@/lib/ai/schema'

export type ApplyFilterArgs = { add: Array<{ kind:'tag'|'origin'|'freeform'; label:string; value:string }>; remove: string[] }
export type ApplyFilterCtx = { index: AssetMeta[]; filterRef: MutableRefObject<Filter>; onFilterChange: (f: Filter) => void }

export function applyFilterExecute(args: ApplyFilterArgs, ctx: ApplyFilterCtx) {
  const next = mergeFilterDelta(ctx.filterRef.current, { add: args.add, remove: args.remove }, 'ai')
  ctx.onFilterChange(next)
  return { applied: { add: args.add, remove: args.remove }, matchCount: applyFilter(ctx.index, next).length }
}

const parameters = z.object({ add: z.array(FilterDeltaAddSchema).default([]), remove: z.array(z.string()).default([]) })

function FilterDeltaCard({ args, result }: { args: ApplyFilterArgs; result?: { matchCount: number } }) {
  const chips = [ ...(args.add ?? []).map((a) => `+${a.label}`), ...(args.remove ?? []).map((r) => `-${r}`) ]
  return (
    <div className="assistant-filter-card">
      <span>{chips.join(' · ') || '无变更'}</span>
      {result ? <span className="assistant-filter-card__count">{result.matchCount} 匹配</span> : null}
    </div>
  )
}

export function AssetFilterTool(ctx: ApplyFilterCtx) {
  useAssistantTool({
    toolName: 'apply_filter',
    description: '根据用户描述增删设计资产筛选条件（chips）。仅在与设计资产筛选相关时调用。',
    parameters,
    execute: async (args: ApplyFilterArgs) => applyFilterExecute(args, ctx),
    render: FilterDeltaCard as never,
  })
  return null
}
```
> `assistant-filter-card*` 样式已在 Task 8 的 `assistant.css` 内。

- [ ] **Step 4: 运行确认通过** —— PASS。

- [ ] **Step 5: 改造 AssetBrowserPage** —— 删除 `AiFilterDrawer` import、`drawerOpen` state、打开按钮、页尾 `<AiFilterDrawer/>`。新增 import：`useRef`、`usePageAssistant`（`@/shell/assistant/usePageAssistant`）、`AssetFilterTool`（`./assistantFilterTool`）、`buildSystemPrompt`（`@/lib/ai/promptBuild`）、`applyFilter as applyFilterFn`（`@/lib/ai/filterState`）。组件体内加：
```ts
const filterRef = useRef(filter); filterRef.current = filter
const candidates = applyFilterFn(assetIndex, filter)
usePageAssistant({ instructions: buildSystemPrompt({ basePrompt, kind, filter, candidates }) })
```
并在 JSX 顶层渲染 `<AssetFilterTool index={assetIndex} filterRef={filterRef} onFilterChange={setFilter} />`（必在 `AssistantProvider` 内——SidebarShell 已包裹全部路由页面）。

- [ ] **Step 6: 删除旧文件** —— `git rm framework/src/features/assets/AiFilterDrawer.tsx framework/src/features/assets/AiFilterDrawer.test.tsx framework/src/features/assets/useAssetSearchAgent.ts framework/src/features/assets/useAssetSearchAgent.test.ts`；清理 `assets.css` 中 `.ai-drawer*` 规则。

- [ ] **Step 7: 构建 + 测试** —— `npx tsc -b && npm run test` → 通过；无对已删符号的悬空引用。

- [ ] **Step 8: 手动端到端验证** —— `npm run dev` → `/assets/rule`|`/assets/layout`：header 出现助手图标；对话中模型调用 `apply_filter`，卡片显示 chip 变化与匹配数，页面筛选实时更新；离开资产页图标消失。

- [ ] **Step 9: Commit** —— `git commit -m "feat: migrate asset filter to assistant tool calling; remove legacy drawer"`

---

### Task 11: 文档（docs/dev/api）

**Files:** Create: `docs/dev/api/assistant-ui-chat.md`

- [ ] **Step 1: 写文档** —— 涵盖：内核概述（Shell 级、LocalRuntime + 客户端 streamText、原语手写 Thread）；`usePageAssistant({instructions,available?})` 语义与生命周期（必在 `AssistantProvider` 内）；工具注册约定（`useAssistantTool` 的 `toolName/description/parameters(zod)/execute/render`，执行由运行时托管，`execute` 出错返回 `{success:false,error}`）；adapter 契约（`async *run` 累积 yield、工具转发不带 execute、`AiClientError` 分类）；门控（`AssistantAvailabilityContext`）。

- [ ] **Step 2: Commit** —— `git commit -m "docs: document reusable assistant-ui chat kernel"`

---

## Self-Review

- **Spec 覆盖**：架构/模块 → T3–10；运行时/adapter → T4/T7；工具/注入/生成式 UI → T6/T10；落位/样式 → T8；可用性/错误边界 → T5/T8/T4；测试 → T2–6/T10 TDD；迁移清理 → T10；文档 → T11。✅（原 spec §6 的 Tailwind 主题桥接与 §Task11 preflight 回归已因 option 2 作废——不引入 Tailwind，无 preflight 风险。）
- **占位符**：无 TBD/TODO；代码步骤含完整代码；assistant-ui 版本相关不确定项标注为"按真实类型微调"。
- **类型一致**：`createStreamTextAdapter`/`AdapterDeps`（T4）↔ T7 一致；`applyFilterExecute(args,ctx)`+`ApplyFilterCtx`（T10）测试/工具一致；`usePageAssistant({instructions,available?})`（T6）↔ T10；`AssistantLauncher({open,onToggle})`/`AssistantPanel({open,onClose})`（T8）↔ T9。✅

> 遗留风险（相关任务已标注）：assistant-ui 0.14.27 的原语子组件命名（`ThreadPrimitive.Messages` 的 `components` 形状、`MessagePrimitive.Parts`、`ComposerPrimitive.*`）与 `ChatModelAdapter.run` 选项字段以安装版本 TypeScript 类型为准做等价微调，不改变架构与数据流。
