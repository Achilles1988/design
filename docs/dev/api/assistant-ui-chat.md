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
`/`。查询参数只保留白名单中的 `appId`；同名的多个值和键均按字典序排序。其余参数不会参与键，
因此不会把视图类临时状态拆分为不同会话。

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

读取时会丢弃无法解析或版本不支持的 envelope。页面条目的 `messages` 结构无效时会丢弃该条目；
`filter` 结构无效时仅忽略该筛选，保留有效消息。`patchAssistantPageState` 合并目标页面的 `messages` 或 `filter`；
`clearAssistantPageState` 删除目标页面的整个 state，因而同时删除消息和筛选，不影响其他页面。

### 消息快照与写入失败

`serializeMessages` 只保存稳定消息：用户或 system 消息，以及 status 为 `complete` 的 assistant
消息。消息 content 原样保留，因此已完成 tool-call 的结果会一同恢复；进行中的 assistant 消息
不会写入快照。`restoreMessages` 将时间恢复为 `Date`，并把 assistant 消息恢复为 complete 状态。

若 `localStorage` 写入或删除失败，Store 返回 `ok:false`，同时按 Storage 实例和页面键保留内存
回退状态。后续读取会优先使用该回退，避免旧的磁盘值在本次会话中回流。

## 页面级会话（`pageSession.tsx`）

`AssistantProvider` 继续只创建一个 LocalRuntime，并把它交给
`AssistantPageSessionProvider`；会话 `ready=true` 时，当前 Runtime 只装载当前 `pageKey` 的消息。
pending hydration 或等待旧 run idle 时，Runtime 内部可能暂时保留来源页内容，但 `AssistantPanel`
用 `ready` 门控，不暴露消息、工具结果或 composer。`pageKey` 由具体 pathname 和白名单查询参数
生成，当前查询参数白名单只有 `appId`。

协调器在首次挂载和页面键改变时增加共享 epoch。切换页面时，它先把 Runtime 的旧稳定消息写回
旧页面键、取消旧运行，再恢复目标页面消息。若旧 run 尚未完成取消收尾，则等待 `isRunning=false`
后才 reset 并恢复目标页面，因此旧 run 不会更新已替换的消息仓库，目标页也不会被切换瞬间的空
Runtime 快照覆盖。只有已 hydration 的页面键与当前页面键相同时 `ready=true`，不会暴露
“新页面键、旧页面状态且 ready=true”的不一致组合。

Runtime 消息变化会即时更新 `hasState`，筛选 chips 也会参与该状态判断；只有 Runtime 空闲且
hydration 完成后才触发消息快照。快照内容和写入失败语义以“消息快照与写入失败”一节为准。
Store 写入失败时，`persistenceError` 暴露英文错误提示。

页面通过 `useAssistantPageSession()` 使用以下基础命令：

- `registerResetHandler(handler)` 注册当前页面的重置函数，并返回注销函数。
- `setPageFilter(filter)` 按调用时的最新路由键更新当前页面筛选，返回 `StoreWriteResult`；即使目标页
  仍在等待 Runtime hydration，也不会误写旧 active 页面。
- `startNewChat()` 增加 epoch、取消运行、清空 Runtime 消息、同步调用页面重置函数，并删除当前页面
  的持久化消息与筛选；命令回调即使创建于旧页面，也按调用时的最新路由键执行，其他页面状态保持不变。
  资产页重置回调必须同时清空 React filter state 和 `filterRef`。

## 资产筛选恢复与持久化

`usePersistentAssetFilter(index)` 是资产页对页面会话筛选状态的唯一适配层，返回
`{ filter, filterRef, setFilter, resetFilter }`。它直接消费 `useAssistantPageSession()` 的
`pageKey`、`pageState`、`ready` 与 `setPageFilter()`，不会创建第二套页面键。

- 只有页面会话 `ready=true` 且资产索引已加载时才恢复筛选。筛选带有已 hydration 的页面键归属；
  pending navigation 期间，若归属键与当前 `pageKey` 不同，则 UI 与 `filterRef` 暴露稳定空筛选，
  普通 `setFilter` 调用直接忽略，不读取来源页 `pageState`，也不会把来源页操作写入目标页面。
  每次页面键完成 hydration 后只执行一次恢复。
- 恢复时，`tag` 必须仍存在于索引任一资产的 tags，`origin` 必须仍存在于索引任一资产的
  origin；失效项会被删除。`freeform` 不依赖索引枚举，始终保留。清理后的筛选会写回当前页面状态。
- `setFilter` 同时接受完整 `Filter` 和 functional update。它先同步更新 `filterRef`，再更新
  React state 并调用 `setPageFilter()`；AI 工具、手动删除 chip 与 `Reset all` 均使用此入口。
  因此连续 AI delta 能读取最新 ref，手动操作也持久化到同一页面状态。
- `resetFilter` 仅同步清空 React state 与 `filterRef`，不自行写 Store。它只作为
  `usePageAssistant({ onResetPageState })` 的 New chat 重置回调使用；随后
  `startNewChat()` 删除整个当前页面状态。重置会以 session 提供的最新 `pageKey` 标记已清理页面；
  即使回调创建于旧页面，pending destination 恢复 ready 后也不会把空筛选重新写回，因而不会
  复活刚删除的页面条目。
- 用户点击 `Reset all` 不会删除整页会话，因此必须调用 `setFilter(emptyFilter())`，显式持久化
  空筛选并保留聊天消息。

## New chat UI

配置完成的 AI 面板标题栏提供 `New chat` 按钮。若当前页面会话有消息或筛选状态，点击后先通过
`confirmTip` 确认“清除本页会话与筛选”；用户取消时不执行清除。空会话直接执行 `startNewChat()`。
命令已经发起后，composer 在下一帧重新获得焦点。若会话状态的 localStorage 持久化失败，面板以
`role="status"` 提示：会话仍可在当前会话中使用，但无法保存。

`createPageScopedModelAdapter(adapter, getEpoch)` 在每次模型运行开始时捕获 epoch，并在转发每个
上游 chunk 前重新检查。页面切换或 `startNewChat()` 改变 epoch 后，旧运行即使迟到产出结果也会
停止 yield，不能写回新页面。

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
- 支持标题、加粗、斜体、引用、列表、链接、行内代码与代码块；不启用 GFM 表格、任务列表或语法高亮。
- Markdown 外部图片被禁用，避免第三方请求和不可控图片尺寸；原始 HTML 不启用。
- Markdown 渲染异常由消息级错误边界捕获，并降级为当前 part 的安全纯文本。
- assistant 请求失败通过 `ErrorPrimitive.Message` 显示，并提供 `ActionBarPrimitive.Reload` 的英文 `Retry` 操作；已有对话和筛选不清空。
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

## 落位与样式

- 入口按钮位于 `sidebar-shell` 的 header；桌面端面板占用 Shell 右侧停靠列，打开时主工作区回流缩窄，不使用 overlay、scrim、背景 blur 或 body scroll lock。
- 空间不足时，面板替代主工作区网格区域；关闭后恢复内容。`Escape` 与关闭按钮均收起，焦点返回 launcher。
- Settings 位于侧栏底部独立 `System` 导航；Workspace 树单独滚动。
- 样式仅用 `framework/src/styles/tokens.css` 的设计 token，遵循 `dashboard` 风格规范
  （主色 `#0C5CAB`、IBM Plex Sans、8pt 间距、`--radius`、150–250ms 过渡、完整交互态）。
- 明暗随根节点 `[data-theme]` 自动切换，并遵循 `prefers-reduced-motion`。

## 未覆盖（YAGNI）

多线程；其他页面场景的实际接入（架构已预留：新页面调
`usePageAssistant` + `useAssistantTool` 即接入）；独立后端聊天端点。
