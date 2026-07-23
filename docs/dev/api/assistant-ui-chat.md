# Assistant UI Chat 内核（可复用聊天助手）

Shell 级、业务无关的聊天助手内核，基于 `@assistant-ui/react` 的 headless 原语 +
LocalRuntime，客户端直连 AI provider（`streamText`），支持流式、工具调用与生成式 UI。
不引入 Tailwind——`AssistantThread` 用原语手写、纯项目 CSS + token 着色。

代码位置：`apps/design/framework/src/shell/assistant/`。

## 组成

| 文件 | 职责 |
|------|------|
| `AssistantProvider.tsx` | `useLocalRuntime(adapter,{maxSteps:2})` + `AssistantRuntimeProvider` + 可用性 Provider，包裹整个 Shell |
| `streamTextAdapter.ts` | `ChatModelAdapter` 桥接：ai-sdk `streamText` → assistant-ui 消息 parts；消息转换、工具参数转发 |
| `usePageAssistant.ts` | 各页注入系统提示 + 切换可用性 |
| `availability.tsx` | `AssistantAvailabilityContext`：门控 header 入口 |
| `AssistantThread.tsx` | 原语组合的对话视图（viewport + messages + composer） |
| `AssistantPanel.tsx` / `AssistantLauncher.tsx` | 右侧覆盖面板 / header 入口按钮 |

## `usePageAssistant(options)`

```ts
usePageAssistant({ instructions: string; available?: boolean }): void
```

- 必须在 `AssistantProvider` 内使用（`SidebarShell` 已全局包裹所有路由页面）。
- `instructions`：本页系统提示，经 `useAssistantInstructions` 注册进共享 ModelContext。
- `available`（默认 `true`）：挂载时点亮 header 入口，**卸载自动置回 false**（离开页面即熄灭）。
- 生命周期语义：仅注册了工具/调用了该 hook 的页面会让助手可用；其余页面入口隐藏。

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

- 工具**执行由运行时托管**：模型发起 tool-call → 运行时按 `parameters` 校验 → 调 `execute`
  （浏览器端）→ 结果回传模型 → 受 `maxSteps` 约束继续。
- 若某工具的 `execute` **可能失败**（网络、外部调用等），应 catch 并**作为结果返回**（如
  `{ success:false, error }`），让模型可解释；对纯粹、参数已由 `parameters` 校验的确定性
  `execute`（如 `apply_filter`），无需额外防御分支。
- 工具组件必须渲染在 `AssistantProvider` 内。

## adapter 契约（`createStreamTextAdapter`）

- `async *run({ messages, abortSignal, context })`：**每次 yield 累积全量内容**（非增量），
  文本累加、tool-call 用循环外 `Map` 累积，避免纯文本 chunk 冲掉工具调用。
- 只负责"调模型 + 流式产出"：把 `context.tools`（description + parameters，**不带 execute**）
  转成 `streamText` 的 tool 定义；工具执行交给运行时。
- 工具参数转发：`toAiToolParameters` 对 zod/StandardSchema 直接透传给 ai-sdk，纯 JSONSchema7
  用 `jsonSchema()` 包裹。
- 错误经 `@/lib/ai/client` 的 `AiClientError` 分类（auth/rate-limit/network/schema/unknown）。
- 依赖可注入（`streamTextImpl`/`createModelImpl`/`readConfig`）便于单测。

## 可用性门控

`AssistantAvailabilityContext`（`availability.tsx`）由 `AssistantProvider` 提供、header 的
`AssistantLauncher` 消费。`available=false` 时入口返回 `null`。第一版仅 `AssetBrowserPage`
（Rule / Layout）点亮。

## 落位与样式

- 入口按钮位于 `sidebar-shell` 的 header；面板为右侧覆盖层（瞬态浮层，不新增持久网格列）。
- 样式仅用 `framework/src/styles/tokens.css` 的设计 token，遵循 `dashboard` 风格规范
  （主色 `#0C5CAB`、IBM Plex Sans、8pt 间距、`--radius`、150–250ms 过渡、完整交互态）。
- 明暗随根节点 `[data-theme]` 自动切换。

## 未覆盖（YAGNI）

多线程 / 历史持久化 / 跨刷新恢复；其他页面场景的实际接入（架构已预留：新页面调
`usePageAssistant` + `useAssistantTool` 即接入）；独立后端聊天端点。
