# Assistant UI Chat 内核（可复用聊天助手）

Shell 级、业务无关的聊天助手内核，基于 `@assistant-ui/react` 的 headless 原语 +
LocalRuntime，客户端直连 AI provider（`streamText`），支持流式、工具调用与生成式 UI。
不引入 Tailwind——`AssistantThread` 用原语手写、纯项目 CSS + token 着色。

代码位置：`apps/design/framework/src/shell/assistant/`。

## 组成

| 文件 | 职责 |
|------|------|
| `AssistantProvider.tsx` | `useLocalRuntime(adapter)` + 页面 epoch 门控 + Runtime/可用性 Provider，包裹整个 Shell |
| `pageSession.tsx` | 单 Runtime 的页面会话协调：切换保存/恢复、运行取消、页面状态命令与 epoch 隔离 |
| `streamTextAdapter.ts` | `ChatModelAdapter` 桥接：ai-sdk `streamText` → assistant-ui 消息 parts；消息转换、工具参数转发 |
| `usePageAssistant.ts` | 各页注入系统提示 + 切换可用性 |
| `availability.tsx` | `AssistantAvailabilityContext`：门控 header 入口 |
| `AssistantThread.tsx` | 原语组合的对话视图（viewport + messages + composer），仅 assistant 文本 part 使用 Markdown |
| `AssistantMarkdown.tsx` | `@assistant-ui/react-markdown` 项目封装；禁用外部图片，保留常用 Markdown |
| `AssistantPanel.tsx` / `AssistantLauncher.tsx` | Shell 右侧停靠区 / header 入口按钮 |

## `usePageAssistant(options)` 页面重置

```ts
usePageAssistant({
  instructions: string
  available?: boolean
  onResetPageState?: () => void
}): void
```

- 必须在 `AssistantProvider` 内使用（`SidebarShell` 已全局包裹所有路由页面）。
- `instructions`：本页系统提示，经 `useAssistantInstructions` 注册进共享 ModelContext。
- `available`（默认 `true`）：挂载时点亮 header 入口，**卸载自动置回 false**（离开页面即熄灭）。
- `onResetPageState`：可选的同步页面状态重置回调。hook 挂载时向当前页面会话注册，传入回调变更时替换，
  卸载时自动注销；当前页面执行 `startNewChat()` 且 Runtime 空闲后调用。页面应在此回调中将其自身的
  非聊天状态（例如筛选 chips）恢复为空状态。
- 生命周期语义：仅注册了工具/调用了该 hook 的页面会让助手可用；其余页面入口隐藏。
- 页面依赖异步 Prompt 或索引时，必须在资源完整成功后再传 `available:true`；失败时保持不可用，不能以空系统提示降级运行。

## 页面状态持久化（`pageState.ts`）

页面级助手状态存于浏览器 `localStorage` 的
`wn.assistant.page-state.v1` 键。它是独立的基础设施，不负责跨页面会话协调或 New chat UI。

### 页面键

`createAssistantPageKey(location)` 使用规范化后的 `pathname` 作为主体：除根路径外移除尾随
`/`。查询参数只保留白名单中的 `appId`，并与资产页的真实消费方式一致：只采用第一个值，
`trim()` 后为空则视为没有 App 上下文；后续同名值不参与页面键。其余参数不会参与键，因此不会把
视图类临时状态拆分为不同会话，也不会让实际目标不同的重复 `appId` 地址错误共享会话。

### V1 存储 envelope

存储值是下列 JSON envelope；每个页面键只拥有自身的状态，读写一个页面不会覆盖其他页面：

```ts
type AssistantPageStateEnvelopeV1 = {
  version: 1
  pages: Record<string, {
    version: 1
    messages: PersistedMessage[]
    filter?: Filter
    updatedAt: string
  }>
}
```

读取时会丢弃无法解析或版本不支持的 envelope。页面条目的 `messages` 按 role 深度校验 part：
system 仅允许单一文本，user 与 assistant 只允许各自支持的 part 类型且必填字段必须存在；
tool-call 的 `toolName`、可选 `toolCallId`、`args` 与 `result` 必须是安全的 JSON 形态。无效消息会
删除对应页面的持久条目，其他健康页面不受影响；`filter` 结构无效时仅忽略该筛选，保留有效消息。
已知工具还按自身 schema 深校验：`apply_filter.args` 必须满足共享的 filter delta schema，
`result` 必须满足成功/失败联合结构；因此旧缓存中的畸形 `add/remove` 不会进入 Tool Card。
`patchAssistantPageState` 合并目标页面的 `messages` 或 `filter`；`clearAssistantPageState` 删除
目标页面的整个 state，因而同时删除消息和筛选，不影响其他页面。

### 消息快照与写入失败

`serializeMessages` 只保存稳定且通过同一深度校验的消息：用户或 system 消息，以及 status 为
`complete` 的 assistant 消息。已完成且 JSON 安全的 tool-call 结果会一同恢复；进行中的 assistant
消息和含函数、循环引用或其他不可序列化值的消息不会写入快照。`restoreMessages` 将时间恢复为
`Date`，并把 assistant 消息恢复为 complete 状态。

若 `localStorage` 写入或删除失败，Store 返回 `ok:false`，同时保留字段级内存 overlay 或 clear
tombstone。partial patch 只记录实际触及的 `messages`/`filter`，不会把读取失败时未知的字段物化为
空值。通过隐式浏览器存储访问的 durable 与 volatile 路径共享同一张进程级逻辑 overlay，因此
`window.localStorage` getter 暂时不可用、Storage 对象身份变化或页面导航都不能让当前会话的
dirty patch/tombstone 暂时消失。显式注入的 Storage 仍按实例隔离。后续读取会优先把该回退合并到
当前可读 base，避免旧磁盘值在本次会话中回流。每次后续 patch/clear 都把相关逻辑存储的全部
dirty overlay 与 tombstone 合并进同一个 envelope；
durable 写入成功后只清除该次实际包含且未被更新的 dirty 项。因此 A 写失败后 B 写成功会同时
持久化 A 的最新状态，A clear 失败后 B 写成功也会同时持久化 A 的删除。

Store 明确区分“已读取但内容 invalid”和“Storage I/O unavailable”。只有前者会触发 repair；
`getItem` 抛错时绝不尝试写入空 envelope，patch/clear 也保留 dirty 状态并返回失败。真实 repair
与正常写入使用同一合并路径，必须包含该 Storage 的全部 dirty overlay 与 tombstone。
`readAssistantPageStateResult()` 返回 `{ state, authoritative }`：只有 durable envelope 可读且
必要的 dirty overlay/tombstone 已成功迁移时才是 authoritative；getter unavailable、durable
读取失败或 migration 写入失败时返回的 volatile/空视图均为 provisional
（`authoritative:false`）。`readAssistantPageState()` 继续提供仅 state 的便捷读取。

访问 `window.localStorage` 本身被浏览器拒绝时，Store 使用 volatile storage 保持当前内存可用，
但 patch/clear 固定返回 `ok:false` 与英文错误，绝不把内存写声称为 durable success。clear 写入
失败时 tombstone 仍让当前页面保持为空，并持续通过 session 暴露 persistence warning，直到后续
写入把全部 dirty 状态成功持久化。getter 后续恢复时，Store 会按字段依次合并 durable 与 volatile
的全部 overlay/tombstone；outage 期间的同页 partial patch 只覆盖自身字段，未触及字段与 durable
中的其他页面均保留。`setItem` 成功后，Store 直接从本次已合并并写入的 envelope 返回 state；
即使紧随其后的 Storage 读取瞬断，也不会返回 `ok:true` 与空 state 的矛盾结果。

## 视觉附件持久化

PNG、JPEG 与 WebP 的实际 Blob 存入版本化 IndexedDB
`wn.assistant.attachments.v1`，消息与 `localStorage` 页面快照只保存
`wn-attachment:<id>`，不保存 Base64 或对象 URL。旧的纯文本 V1 页面状态无需迁移，恢复与发送
行为保持不变；含有效 `wn-attachment:` 的新状态才会解析对应 Blob。

单张图片不超过 10 MiB，当前消息最多 8 张；Composer 对一次粘贴批次还执行 30 MiB 整批校验。
URL capture 成功后也经过同一附件 adapter 存储，并在 record 中保留 `sourceUrl`。预览和恢复时
创建的对象 URL 会在移除、页面切换或组件卸载时撤销。

稳定消息快照成功后，页面会用快照中的引用集合 reconcile 当前页面 IndexedDB records，删除已不再
引用的 Blob；接受 New chat 后删除该页面的全部 records。清理失败沿用视觉持久化英文错误，不能把
清理失败声称为成功，也不能恢复已从 Runtime 删除的消息。

## 页面级会话（`pageSession.tsx`）

`AssistantProvider` 继续只创建一个 LocalRuntime，并把它交给
`AssistantPageSessionProvider`；会话 `ready=true` 时，当前 Runtime 只装载当前 `pageKey` 的消息。
pending hydration 或等待旧 run idle 时，Runtime 内部可能暂时保留来源页内容，但 `AssistantPanel`
用 `ready` 门控，不暴露消息、工具结果或 composer。`pageKey` 由具体 pathname 和白名单查询参数
生成，当前查询参数白名单只有 `appId`。

协调器在首次挂载和页面键改变时增加共享 epoch。切换页面时，它先把 Runtime 的旧稳定消息写回
旧页面键；但若该页面由 provisional fallback hydration 且 Runtime 此后没有真实变化，则跳过这次
自动快照，不能用 `messages:[]` 覆盖尚不可读的 durable messages。用户在 outage 中真实新增消息
会把当前 Runtime 作为 messages overlay 写入；New Chat 仍写入 clear tombstone。随后协调器取消
旧运行并恢复目标页面消息。若旧 run 尚未完成取消收尾，则等待 `isRunning=false`
后才 reset 并恢复目标页面，因此旧 run 不会更新已替换的消息仓库，目标页也不会被切换瞬间的空
Runtime 快照覆盖。恢复消息或 `runtime.thread.reset()` 抛错时，会删除该页无效缓存、reset 空消息
并完成 hydration；页面进入 ready 而不会崩溃。只有已 hydration 的页面键与当前页面键相同时
`ready=true`，不会暴露“新页面键、旧页面状态且 ready=true”的不一致组合。

Runtime 消息变化会即时更新 `hasState`，筛选 chips 也会参与该状态判断；只有 Runtime 空闲且
hydration 完成后才触发消息快照。快照内容和写入失败语义以“消息快照与写入失败”一节为准。
LocalRuntime 的订阅通知不等同于消息变化：mount 时 `__internal_load()` 的 loading
true/false、能力更新等通知可能保持同一消息快照且 `isRunning=false`。session 必须以 hydration
完成后的序列化消息快照作为 baseline；只有后续序列化结果与 baseline 确实不同时，才写入消息并
claim provisional 页面。首条真实用户消息会在首次同步通知中形成不同快照，必须立即持久化；
纯 loading/能力通知不得把 provisional empty 物化为 overlay，从而覆盖暂时不可读的 durable 消息。
Store 写入失败时，`persistenceError` 暴露英文错误提示。
该提示只在持久层具有恢复证据时清除：hydration 的读取结果必须为 authoritative，即 durable
可读且 dirty overlay/tombstone 已成功写入。volatile/provisional fallback 即使 Runtime hydration
完成也继续显示 warning；getter 恢复并完成 migration 后的 authoritative hydration 才终止旧提示。

页面通过 `useAssistantPageSession()` 使用以下基础命令：

- `registerResetHandler(handler)` 注册当前页面的重置函数，并返回注销函数。
- `setPageFilter(owner, filter)` 要求 mutation 显式携带 `{ pageKey, generation }`。只有 pageKey
  与最新路由键一致、generation 也等于当前 session generation 才写入 Store；否则返回
  `accepted:false`，不修改任一页面且不制造 persistence warning。generation 在路由 hydration
  和每次 New chat 时推进，因此同页迟到工具和 A→B→A 的旧 A 工具也会被拒绝。接受的 mutation
  返回 `accepted:true` 加 Store 的 durable 结果。
- `startNewChat(owner)` 只接受与最新 `{ pageKey, generation }` 完全一致且已 hydration ready 的
  owner。接受后增加 epoch、取消运行，并捕获命令发起时的目标页。该页的 Store clear 不受后续
  hydration epoch 或导航影响，等待旧 run idle 后必须最终执行；导航保存旧快照时也会跳过正在清理
  的页面，不能复活旧消息。只有目标页届时仍是当前页，才清空共享 Runtime 并调用当前页面 reset
  handler。其他页面正常 hydration 且状态不受影响。资产页重置回调必须同时清空 React filter state
  和 `filterRef`。页面 reset handler 即使抛错，session 也必须通过 `finally` 恢复 ready、同步空
  page state 并删除 clearing 标记，避免永久 Loading 或后续快照一直被跳过。

## 资产筛选恢复与持久化

`usePersistentAssetFilter(index)` 是资产页对页面会话筛选状态的唯一适配层，返回
`{ filter, filterRef, owner, setFilter, resetFilter }`。它直接消费 `useAssistantPageSession()` 的
`pageKey`、`pageState`、`ready` 与 `setPageFilter()`，不会创建第二套页面键。

- 只有页面会话 `ready=true` 且资产索引已加载时才恢复筛选。筛选带有已 hydration 的页面键归属；
  pending navigation 期间，若归属键与当前 `pageKey` 不同，则 UI 与 `filterRef` 暴露稳定空筛选，
  普通 `setFilter` 调用直接忽略，不读取来源页 `pageState`，也不会把来源页操作写入目标页面。
  每次页面键完成 hydration 后只执行一次恢复。
- 恢复时，`tag` 必须仍存在于索引任一资产的 tags，`origin` 必须仍存在于索引任一资产的
  origin；失效项会被删除。`freeform` 不依赖索引枚举，始终保留。清理后的筛选会写回当前页面状态。
- `setFilter` 同时接受完整 `Filter` 和 functional update。它解析下一状态并调用带 owner 的
  `setPageFilter()`，mutation 被接受后同步更新 `filterRef` 与 React state；AI 工具、手动删除 chip
  与 `Reset all` 均使用此入口。工具执行会先同步更新 ref 以支持同一渲染周期的连续 delta。每个
  setter 与工具 execute 都携带创建时的 `{ pageKey, generation }` owner；New chat、页面切换、
  A→B→A 或 hook 卸载后旧 setter 失效，owner 被 session 拒绝时工具会回滚 `filterRef` 并返回
  结构化失败。
- `resetFilter` 仅同步清空 React state 与 `filterRef`，不自行写 Store。它只作为
  `usePageAssistant({ onResetPageState })` 的 New chat 重置回调使用；随后
  `startNewChat()` 删除整个当前页面状态。重置会以 session 提供的最新 `pageKey` 标记已清理页面；
  即使回调创建于旧页面，pending destination 恢复 ready 后也不会把空筛选重新写回，因而不会
  复活刚删除的页面条目。
- 用户点击 `Reset all` 不会删除整页会话，因此必须调用 `setFilter(emptyFilter())`，显式持久化
  空筛选并保留聊天消息。

## New chat UI

配置完成的 AI 面板标题栏提供 `New chat` 按钮。若当前页面会话有消息或筛选状态，点击后先通过
`confirmTip` 确认“清除本页会话与筛选”；确认请求捕获发起时 owner，导航或 generation 改变后
确认结果直接失效，不能清理新页。hydration pending（`ready=false`）时按钮禁用。用户取消时不执行
清除；空会话直接执行 `startNewChat(owner)`。命令被 session 接受后，composer 在下一帧重新获得
焦点。若会话状态的 localStorage 持久化失败，面板以
`role="status"` 提示：会话仍可在当前会话中使用，但无法保存。

`createPageScopedModelAdapter(adapter, getEpoch)` 在每次模型运行开始时捕获 epoch，并在转发每个
上游 chunk 前重新检查。页面切换或 `startNewChat()` 改变 epoch 后，旧运行即使迟到产出结果也会
停止 yield，不能写回新页面。adapter 还会包装每个前端工具：在调用底层 execute 前同时检查
run abort 与 epoch，并让底层 execute Promise 与 abort 竞速。即使工具忽略 signal，AI SDK/Runtime
也会及时 settle；工具稍后完成时，其页面副作用仍由 owner guard 拒绝。

## 工具注册约定

用 `@assistant-ui/react` 的 `useAssistantTool` 在页面内注册前端工具（每个工具一个组件、单次
调用，避免在数组上循环调 hook 违反 rules-of-hooks）：

```tsx
useAssistantTool({
  toolName: 'apply_filter',
  description: '……仅在相关时调用',
  parameters: zodSchema,                 // StandardSchema(zod) 或 JSONSchema7
  execute: async (args) => ({ /* 结果回传给模型 */ }),
  render: ToolCardComponent,             // 生成式 UI（内联渲染）
})
```

- 工具执行由 AI SDK 托管：adapter 把页面注册的 description、parameters 与 `execute`
  一并交给 `streamText`；模型发起 tool-call 后，AI SDK 在浏览器端调用 `execute`，adapter
  把 tool result 附回 assistant 消息，再由 LocalRuntime 按 `maxSteps` 发起后续模型步骤。
- adapter 会把同步或异步 execute 统一包装为 Promise；不支持 execute 上下文中的
  `human()` 交互，调用时会返回明确错误。需要人工确认的工具不应注册到此聊天内核。
- 若某工具的 `execute` 可能失败，应 catch 并作为结果返回（如 `{ success:false, error }`），
  让模型可解释。`apply_filter` 的 `execute` 通过 `applyFilterSafely` 调用
  `applyFilterExecute`；执行异常时返回既定的 `success:false` 联合成员，不把异常泄漏给 Runtime。
- 工具组件必须渲染在 `AssistantProvider` 内。

## adapter 契约（`createStreamTextAdapter`）

- `async *run({ messages, abortSignal, context })`：**每次 yield 累积全量内容**（非增量），
  文本累加、tool-call 用循环外 `Map` 累积，避免纯文本 chunk 冲掉工具调用。
- `toCoreMessages` 必须把已完成的 assistant tool-call 转成连续的 AI SDK `assistant` tool-call message 与 `tool` result message；不能丢弃 `result`，否则后续模型步骤看不到真实执行状态。
- adapter 把 `context.tools` 的 description、parameters 与 execute 转成 AI SDK tool；
  LocalRuntime 本身不会执行前端工具，不能从 adapter 丢弃 execute。
- `AssistantProvider` 使用 runtime `maxSteps: 2` 完成“模型选择工具 → 页面执行筛选 → 模型基于真实结果生成摘要”。
- 工具参数转发：`toAiToolParameters` 对 zod/StandardSchema 直接透传给 ai-sdk，纯 JSONSchema7
  用 `jsonSchema()` 包裹。
- 错误经 `@/lib/ai/client` 的 `AiClientError` 分类（auth/rate-limit/network/schema/unknown）。
- 依赖可注入（`streamTextImpl`/`createModelImpl`/`readConfig`）便于单测。

## 可用性门控

`AssistantAvailabilityContext`（`availability.tsx`）由 `AssistantProvider` 提供、header 的
`AssistantLauncher` 消费。`available=false` 时入口返回 `null`。第一版仅 `AssetBrowserPage`
（Rule / Layout）点亮。

## Markdown 文本契约

- 用户消息保持纯文本；仅 assistant 消息通过 `MessagePrimitive.Parts.components.Text` 注册 `AssistantMarkdown`，工具 part 继续由 assistant-ui 渲染。
- 支持标题、加粗、斜体、引用、列表、链接、行内代码、代码块与 GFM 表格；任务列表与语法高亮未专门支持或样式化。
- Markdown 外部图片被禁用，避免第三方请求和不可控图片尺寸；原始 HTML 不启用。
- Markdown 渲染异常由消息级错误边界捕获，并降级为当前 part 的安全纯文本。
- assistant 请求失败通过 `ErrorPrimitive.Message` 显示，并提供 `ActionBarPrimitive.Reload` 的英文 `Retry` 操作；已有对话和筛选不清空。
- 模型运行期间（`ThreadPrimitive.If running`），viewport 在消息列表下方显示英文 `Generating…`（`role="status"`、`aria-live="polite"`）；Composer 的 Send 保持 busy/disabled 态（`ComposerPrimitive.Send` + `.aui-composer-send:disabled`）。
- 渲染样式使用项目 token，代码块在面板内横向滚动，不扩张 Shell。

## `apply_filter` 增量契约

- 每次执行从 `filterRef.current` 读取最新筛选，并在 React state 更新前同步写回该 ref，确保同一渲染周期的连续调用可累积。
- `add` / `remove` 是对当前 chips 的增量；未指定的 chips 必须保留。
- `apply_filter` 工具结果是带 `success` 判别字段的公开联合：成功时为
  `{ success:true, applied:{ add, remove }, matchCount, changed }`，其中 `applied` 仅包含实际发生的 diff；
  `changed:false` 时不调用页面更新回调，也不能向用户声称筛选已改变。失败时为
  `{ success:false, applied:{ add:[], remove:[] }, matchCount, changed:false, error }`；失败结果的
  `applied` 始终为空，`matchCount` 基于当前保留的筛选重新计算。
- 页面收到真实变更后立即更新 chips、数量与可见资产；工具结果通过 adapter 回传模型，供下一步生成准确英文摘要。
- 以上筛选恢复与 setter 契约已有纯函数、hook 和工具层测试；它不替代
  composer → adapter → 工具执行 → 资产页重渲染的完整集成验收，该链路需由独立集成测试证明。

## 筛选集成验收

筛选 prompt 只有在 `apply_filter` 工具真实执行并返回成功结果后才算更新成功。验收必须同时观察
chips、匹配数量和可见资产三者变化；普通助手文本不得修改筛选。

## Canvas 页面 server adapter

Canvas 页面使用 `useCanvasAssistant({ appId, canvasId, ready })` 独占当前页面的模型 adapter。
`CanvasPreview` 会并行申请
`POST /__design_ai/canvas/preview-session`、加载隔离 Canvas preview 与调用
`POST /__design_ai/canvas/context`；只有 context 成功后才传 `ready:true`，注册
`createCanvasServerAdapter({ appId, canvasId })` 并点亮助手。Style、Layout 或其他 Canvas
context 加载失败时，Canvas 预览仍可显示，但助手保持不可用并显示英文状态。空白 Canvas 也走同一
context readiness 流程，不依赖已有页面内容。context 响应必须是 JSON
`{ ready:true }`；缺失 middleware、HTML fallback 或非预期 content type 统一显示
`Canvas Assistant is available only with npm run dev.`。

Canvas module 只在 `sandbox="allow-scripts"` 且不含 `allow-same-origin`
的 iframe 中执行，因此运行时 origin 为 opaque。Shell 继续持有 `designApi` 与 Canvas
Assistant API 权限。preview session 由同源 Shell 申请，服务端从 `appId + canvasId`
解析当前非 symlink 的普通 TSX 文件，并返回含 `moduleBase`、`componentFile`、
`expiresAt` 的 30 分钟有效不可猜 module capability；`CanvasPreview` 在到期前 1 分钟
重新申请 capability 并 remount iframe，避免后续 HMR/lazy import 使用过期 token，
同时按预览 remount 语义清空 Canvas 本地状态。iframe import map
把 Vite runtime、当前 Canvas/直接 CSS 与经 realpath 校验的共享组件请求改写到 capability
namespace。只有 `Origin:null + Sec-Fetch-Dest:script`、有效 token 和精确 allowlist
同时满足时才返回 `ACAO:null`；每个 App module GET 还会重新执行 `lstat + realpath`，
要求文件仍是普通非 symlink 文件且解析到签发时记录的真实路径，签发后的 symlink/路径
替换会立即 fail closed。普通 fetch、危险 Vite raw/url/worker query、另一
Canvas/App、`/@fs` 与 privileged `__*` 路由均拒绝。父页面只接受来自当前 iframe
`contentWindow` 且符合严格 `ready` / `error` type 的消息，该通道不提供任何文件或 API
mutation 能力。srcdoc bootstrap 自身捕获 runtime/frame module import 失败并发送同一严格
error 消息，不能永久停在空白 loading。

页面 adapter 的所有权由 `usePageModelAdapter` 管理：Canvas 路由挂载时替换默认浏览器 adapter，
`ready:false`、参数变化或卸载时写回 `null`。因此非 Canvas 页面不会请求
`/__design_ai/canvas/chat`，离开 Canvas 后也不会残留旧 `appId` / `canvasId`。server adapter
每次请求只发送最新 40 条稳定消息（以及已有 human tool result 的当前 assistant message）和读取
时的当前 AI config；缺少配置时沿用 Settings guidance。chat 使用浏览器生成 boundary 的
`multipart/form-data`：`request` 是不超过 512 KiB 的 JSON envelope，每个唯一引用 Blob 只发送
一次并命名为 `attachment:<id>`，不得显式设置 `Content-Type`。缺失引用在请求发出前以
`A referenced image is no longer available.` 失败。URL capture 的 `sourceUrl` 只在发送给模型的
消息副本中作为紧邻截图的 `Source URL: <url>` 文本出现，不改写 Runtime 快照。

服务端要求当前用户消息最多 8 张、单张最多 10 MiB、保留的 40 条消息中唯一 Blob 合计最多
30 MiB；超限时不裁剪旧消息或附件，而是要求开始新对话。通过校验后按消息 part 原顺序转换为 AI
SDK `Uint8Array` image parts。若 provider 不支持视觉输入，服务端返回固定英文错误
`The configured model does not support image input. Choose a vision-capable model or remove the images.`，
且不得 stage `propose_canvas_change`；LocalRuntime 中已提交的消息与 `wn-attachment:` 引用保持，
用户可更换模型或移除图片后再试。

chat/apply 成功响应必须声明
`application/x-ndjson`，否则使用同一 dev-only guidance。响应按 NDJSON 任意字节切分增量解码，
每条完整行都经 `CanvasRunEventSchema` 校验；`run-result` 逐条转交 LocalRuntime，
`error` 转成运行错误，LocalRuntime abort signal 原样传给 `fetch`。

### Canvas human tool UI 与恢复

`CanvasAssistantTools` 只用 `useAssistantToolUI` 注册 renderer，不在浏览器重复声明或执行服务端
工具定义。两项 UI 都使用 `display:'standalone'`：

- `recommend_canvas_layout`：展示推荐 Layout 与 `Not installed` 状态。确认后先调用
  `designApi.applyAsset('layoutmd', layoutId, appId)`；只有安装成功后才
  `addResult({ status:'installed', layoutId })`。安装失败会写入 `failed` result，不能声称已安装。
- `propose_canvas_change`：展示 Style、Layout、changed files、reused components 与 new shared
  components，并用英文 `<details>` 提供逐文件 path/source 的只读折叠审阅。确认时调用
  proposal apply endpoint，并按收到顺序显示全部 checking、writing、
  validating、repairing status。若成功结果包含 repairing history，UI 会从最后一条
  repairing status 的 attempt 派生 `Repaired · attempt N` 成功行并放在 `Applied` 前；这是
  UI 终态，不增加公共协议 phase，协议 status phase 仍仅允许 checking、writing、validating、
  repairing。按钮 pending 时全部禁用，且 proposal 只能 apply 一次。

两项工具的确认、拒绝和失败都必须在外部操作成功或失败后调用一次 `addResult`。由于
`AssistantProvider` 已把两项工具名放入 `unstable_humanToolNames`，该 human result 会恢复同一
LocalRuntime run，并由 Canvas server adapter 把结果续传服务端。proposal apply 在调用时重新读取
当前 AI config 供 repair 使用；apply NDJSON 会消费到 EOF，必须恰有一个 terminal
`complete`；重复 `complete`、`complete` 后事件/垃圾数据和 EOF 缺少 `complete` 都视为错误。
若失败结果为 `rolledBack:false`，UI 必须明确要求用户手动检查文件。

成功 apply 后，Vite 发出 `canvas-assistant:applied`。Canvas 页面只在事件的 `appId` 与
`canvasId` 同时匹配当前页面时增加 preview revision，以 `key` remount Canvas 并清理 Canvas
本地状态；不匹配事件不影响当前预览。订阅在页面卸载或目标变化时清理。

## 落位与样式

- 入口按钮位于 `sidebar-shell` 的 header；桌面端面板占用 Shell 右侧停靠列，打开时主工作区回流缩窄，不使用 overlay、scrim、背景 blur 或 body scroll lock。
- 空间不足时，面板替代主工作区网格区域；关闭后恢复内容。`Escape` 与关闭按钮均收起，焦点返回 launcher。
- `role="alertdialog"` 的 ConfirmTip 活跃时，Panel 的全局 `Escape` 监听忽略事件，由 ConfirmTip
  独占取消，不会同时收起 Panel。
- Settings 位于侧栏底部独立 `System` 导航；Workspace 树单独滚动。
- 样式仅用 `framework/src/styles/tokens.css` 的设计 token，遵循 `dashboard` 风格规范
  （主色 `#0C5CAB`、IBM Plex Sans、8pt 间距、`--radius`、150–250ms 过渡、完整交互态）。
- 明暗随根节点 `[data-theme]` 自动切换，并遵循 `prefers-reduced-motion`。

## 未覆盖（YAGNI）

多线程；资产页与 Canvas 页之外的页面场景实际接入（架构已预留：普通浏览器端工具页调用
`usePageAssistant` + `useAssistantTool`，需要服务端模型运行的页面再注册 page adapter）。
