# Assistant UI Chat 内核（可复用聊天助手）

Shell 级、业务无关的聊天助手内核，基于 `@assistant-ui/react` 的 headless 原语 +
LocalRuntime，客户端直连 AI provider（`streamText`），支持流式、工具调用与生成式 UI。
不引入 Tailwind——`AssistantThread` 用原语手写、纯项目 CSS + token 着色。

代码位置：`apps/design/framework/src/shell/assistant/`。

## 组成

| 文件 | 职责 |
|------|------|
| `AssistantProvider.tsx` | `useLocalRuntime(adapter)` + `AssistantRuntimeProvider` + 可用性 Provider，包裹整个 Shell |
| `streamTextAdapter.ts` | `ChatModelAdapter` 桥接：ai-sdk `streamText` → assistant-ui 消息 parts；消息转换、工具参数转发 |
| `usePageAssistant.ts` | 各页注入系统提示 + 切换可用性 |
| `availability.tsx` | `AssistantAvailabilityContext`：门控 header 入口 |
| `AssistantThread.tsx` | 原语组合的对话视图（viewport + messages + composer），仅 assistant 文本 part 使用 Markdown |
| `AssistantMarkdown.tsx` | `@assistant-ui/react-markdown` 项目封装；禁用外部图片，保留常用 Markdown |
| `AssistantPanel.tsx` / `AssistantLauncher.tsx` | Shell 右侧停靠区 / header 入口按钮 |

## `usePageAssistant(options)`

```ts
usePageAssistant({ instructions: string; available?: boolean }): void
```

- 必须在 `AssistantProvider` 内使用（`SidebarShell` 已全局包裹所有路由页面）。
- `instructions`：本页系统提示，经 `useAssistantInstructions` 注册进共享 ModelContext。
- `available`（默认 `true`）：挂载时点亮 header 入口，**卸载自动置回 false**（离开页面即熄灭）。
- 生命周期语义：仅注册了工具/调用了该 hook 的页面会让助手可用；其余页面入口隐藏。
- 页面依赖异步 Prompt 或索引时，必须在资源完整成功后再传 `available:true`；失败时保持不可用，不能以空系统提示降级运行。

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
- 若某工具的 `execute` **可能失败**（网络、外部调用等），应 catch 并**作为结果返回**（如
  `{ success:false, error }`），让模型可解释；对纯粹、参数已由 `parameters` 校验的确定性
  `execute`（如 `apply_filter`），无需额外防御分支。
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

## 落位与样式

- 入口按钮位于 `sidebar-shell` 的 header；桌面端面板占用 Shell 右侧停靠列，打开时主工作区回流缩窄，不使用 overlay、scrim、背景 blur 或 body scroll lock。
- 空间不足时，面板替代主工作区网格区域；关闭后恢复内容。`Escape` 与关闭按钮均收起，焦点返回 launcher。
- Settings 位于侧栏底部独立 `System` 导航；Workspace 树单独滚动。
- 样式仅用 `framework/src/styles/tokens.css` 的设计 token，遵循 `dashboard` 风格规范
  （主色 `#0C5CAB`、IBM Plex Sans、8pt 间距、`--radius`、150–250ms 过渡、完整交互态）。
- 明暗随根节点 `[data-theme]` 自动切换，并遵循 `prefers-reduced-motion`。

## 未覆盖（YAGNI）

多线程 / 历史持久化 / 跨刷新恢复；其他页面场景的实际接入（架构已预留：新页面调
`usePageAssistant` + `useAssistantTool` 即接入）；独立后端聊天端点。
