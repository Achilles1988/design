# 设计：用 assistant-ui 重做聊天 UI（可复用聊天内核 + 资产筛选场景）

- 日期：2026-07-23
- 状态：待评审
- 范围：`apps/design/framework`

## 1. 背景与目标

当前的"聊天 UI"是 `features/assets/AiFilterDrawer.tsx`——资产库（Asset Browser）里从右侧滑出的 **AI 筛选**抽屉。用户抱怨其"丑、交互不便"。

目标：引入 [assistant-ui](https://github.com/assistant-ui/assistant-ui) 作为聊天前端，构建一个**业务无关、可复用的聊天内核**，并以现有的"资产筛选"作为第一个接入场景验证整套模式；架构预留扩展点，后续 App 详情、画布编辑等场景可低成本接入。

## 2. 已确认的关键决策

| # | 决策 | 选择 |
|---|------|------|
| 1 | 改造范围 | 通用、可复用的聊天助手（不止筛选） |
| 2 | 交互模式 | 对话 + 工具调用（Tool Calling / 生成式 UI） |
| 3 | 运行时 | LocalRuntime + 自定义 `ChatModelAdapter`（客户端直连，key 留 localStorage，无后端） |
| 4 | 第一版范围 | 仅迁移现有"资产筛选"场景到新架构，打磨可复用内核 |
| 5 | 样式 | 用 assistant-ui 预制组件（Tailwind），通过主题变量映射适配项目风格 |
| 6 | 呈现位置 | Shell 级常驻助手：header 入口 + 右侧覆盖面板；各页通过 context 注入工具 |
| 7 | 无工具页 | 上下文感知：仅在注册了工具的页面可用，其他页面入口隐藏/置灰 |
| 8 | 历史 | 单会话、仅内存；刷新即清空（不做多线程/持久化） |
| — | 集成方案 | 方案 A：LocalRuntime + streamText 桥接 + assistant-ui 原生工具上下文 |

**布局/风格约束（见 `.wn-ai/lessons/lesson.md`）**：`dashboard` **style 规范强制遵守**；`sidebar-shell` **layout 仅优先复用**，无合适区域时可自然融合新表面（右侧助手面板即属此类）。

## 3. 架构与模块划分

聊天内核（业务无关）与资产筛选场景（业务）彻底分离。

```
framework/src/
├─ shell/
│  ├─ SidebarShell.tsx            # 挂载 AssistantProvider + header 入口 + 面板
│  └─ assistant/                  # 【新】可复用聊天内核
│     ├─ AssistantProvider.tsx    # useLocalRuntime(adapter) + AssistantRuntimeProvider + availability
│     ├─ AssistantPanel.tsx       # 右侧覆盖面板（开合/关闭键）+ assistant-ui <Thread/>
│     ├─ AssistantLauncher.tsx    # header 入口按钮（受 availability 门控）
│     ├─ streamTextAdapter.ts     # ai-sdk streamText → assistant-ui parts 桥接 + 消息转换
│     ├─ usePageAssistant.ts      # 各页注入 instructions + tools + availability 的统一 hook
│     └─ availability.ts          # AssistantAvailabilityContext
└─ features/assets/
   ├─ AssetBrowserPage.tsx        # 改：用 usePageAssistant 注册 apply_filter 工具
   └─ assistantFilterTool.tsx     # 【新】apply_filter 工具定义 + FilterDeltaCard 生成式 UI
```

**数据流**：
1. Shell 常驻 `AssistantProvider`（LocalRuntime）+ header `AssistantLauncher` + `AssistantPanel`。
2. `AssetBrowserPage` 挂载调 `usePageAssistant({ instructions, tools:[apply_filter], available:true })`，注册系统提示 + 工具进 assistant-ui 共享 ModelContext，并点亮入口；卸载自动清理。
3. 用户发消息 → LocalRuntime → `streamTextAdapter.run({ messages, context:{ tools } })` → 浏览器直连 provider 流式返回。
4. 模型发起 `apply_filter` 工具调用 → assistant-ui 运行时自动执行页面注册的 `execute`（合并 delta、`onFilterChange`）→ 追加 tool-result → 续跑（受 `maxSteps` 约束）→ `render` 渲染 chip 变化卡片。
5. 其他页面未注册工具 → 入口隐藏/置灰。

**保留复用**：`lib/ai/client.ts`（provider 构造 + 错误分类抽出）、`config.ts`、`filterState.ts`（`mergeFilterDelta`/`applyFilter`）、`promptBuild.ts`、`schema.ts`（`FilterDeltaAddSchema` 作工具参数）、`assetIndex.ts`。

## 4. 运行时与 streamText 桥接

- 装配：`useLocalRuntime(streamTextAdapter, { maxSteps: 2 })` → `<AssistantRuntimeProvider>`，挂在 `SidebarShell`。
- 职责切分：
  - **adapter 只调模型 + 流式产出**：把 `context.tools` 转成 `streamText` 的 tool 定义（**不带 execute**），只吐 text 与 tool-call part。
  - **工具执行交给 assistant-ui 运行时**：模型 tool-call → 运行时自动调页面注册的 `execute` → tool-result → 回调 adapter 续跑。
- `streamTextAdapter.run`（`async *run`）：
  - 用 `readAiConfig()` + `createAnthropic/createOpenAI`（复用 `client.ts`）。
  - `streamText({ model, system: <来自 useAssistantInstructions 的 ModelContext instructions>, messages, tools })`，遍历 `fullStream`。
  - **每次 yield 累积全量内容**（非增量）：文本累计成 `text`，tool-call 用**循环外的 `Map`** 累积，`yield { content: [ {type:'text',text}, {type:'tool-call', ...} ] }`，避免纯文本 chunk 冲掉工具调用。
  - 传 `abortSignal` 支持中断；错误经 `AiClientError` 分类转助手错误态。
- 消息转换：`ThreadMessage` ↔ ai-sdk `CoreMessage` 的纯函数（可单测）。

> 说明：`system` 具体如何进入 adapter（`context` 字段 vs. 注入 messages）以实现时按安装版本的真实 API 落地；本设计约定"系统提示来自各页 `useAssistantInstructions` 注册的 ModelContext"。

## 5. 工具注册、页面注入与生成式 UI

**统一注入 hook `usePageAssistant`**：
```ts
usePageAssistant({
  instructions: string,   // → useAssistantInstructions(...)
  tools: PageTool[],      // → 每个走 useAssistantTool(...)
  available: boolean,     // → 切换 AssistantAvailabilityContext
})
```
挂载注册、卸载清理，保证"离开页面即熄灭"。

**`apply_filter` 工具**（`AssetBrowserPage` 构造）：
```ts
useAssistantTool({
  toolName: 'apply_filter',
  parameters: z.object({
    add: z.array(FilterDeltaAddSchema).default([]),
    remove: z.array(z.string()).default([]),
  }),
  execute: async ({ add, remove }) => {
    const next = mergeFilterDelta(filterRef.current, { add, remove }, 'ai')
    onFilterChange(next)
    return { applied: { add, remove }, matchCount: applyFilter(index, next).length }
  },
  render: FilterDeltaCard,
})
```
- `filterRef` 存最新 filter 避免闭包过期；返回 `matchCount` 让模型"看到"结果。
- 关联性判断改由模型决定是否调用工具（instructions 内约束"只处理设计资产筛选、无关则礼貌拒绝且不调工具"），**取代旧 `is_relevant` 字段**。

**生成式 UI `FilterDeltaCard`**：内联小卡片，展示 `+dark · +finance · -grid` 变化 + 当前匹配数，含 running/complete 两态，替代旧 `deltaSummary`。

**错误/拒绝**：不再是特殊 message kind，而是普通助手文本气泡 + adapter 层错误态。

## 6. 面板落位与样式适配

**落位**（style 强制、layout 优先复用）：
- **入口按钮放 header**（契约允许"全局操作按钮/通知"），紧邻主题切换。
- **面板为右侧覆盖层**（overlay/drawer over `main`），瞬态表面，与现有抽屉形态一致，不新增持久网格列。

**dashboard 风格适配**：主色交互信号 `#0C5CAB`、玻璃感面板、统一 `--radius`、8pt 间距、IBM Plex Sans、150–250ms 过渡、完整 hover/focus-visible/disabled/loading 态；面板外壳用现有 CSS + token 手写。

**assistant-ui 主题桥接**：引入 Tailwind + 预制 `<Thread/>`，在面板根作用域把 shadcn 主题变量映射到项目 token：
```
.wn-assistant {
  --background: var(--color-surface);
  --foreground: var(--color-text);
  --primary: var(--color-primary);
  --border: var(--color-border);
  --muted: var(--color-surface-2);
  --muted-foreground: var(--color-muted);
  --radius: var(--radius);
  /* … 其余 shadcn 变量按需补齐 */
}
```
明暗跟随现有 `[data-theme]`（token 已切换，映射变量自动继承）。

**⚠️ 集成风险**：项目当前无 Tailwind。Tailwind v4 的 preflight 全局重置可能影响现有纯 CSS 页面。缓解：作用域化引入 / 按需关闭 preflight，并在接入后回归验证现有页面。这是本次最大技术风险，实现计划里单列验证步骤。

## 7. 可用性门控 / 错误边界

- **门控**：`AssistantAvailabilityContext` 由 `AssistantProvider` 提供，header 消费；`usePageAssistant` 挂载置 true、卸载置 false；`available=false` 时入口隐藏/置灰，打开中变 false 则自动关闭。第一版仅 `AssetBrowserPage`（Rule/Layout）点亮。
- **未配置 provider**：入口可点，打开显示"去 Settings 配置"引导（复用 `hasValidConfig` + 跳转），不发请求。
- **请求错误**：`AiClientError` 分类（auth/rate-limit/network/schema/unknown）→ 错误气泡 + 重试。
- **中断**：`abortSignal` 支持停止。
- **maxSteps 到顶**：正常收尾不死循环。
- **工具 execute 出错**：catch 后作为结果返回模型（`{ success:false, error }`）。

## 8. 测试策略

沿用 vitest + testing-library，保持 DI 可注入：
- `streamTextAdapter`：mock `fullStream` → 断言累积 yield、tool-call 累积、错误分类、消息转换纯函数。
- `apply_filter.execute`：断言 `mergeFilterDelta` + `onFilterChange` + 返回 `matchCount`。
- `usePageAssistant`：挂载注册 / 卸载清理 / availability 切换。
- 面板组件：未配置引导、错误态、可用性隐藏渲染。
- 迁移旧测试断言意图（`AiFilterDrawer.test.tsx`、`useAssetSearchAgent.test.ts`）到新结构。

## 9. 迁移与清理

- 删除 `AiFilterDrawer.tsx`、`useAssetSearchAgent.ts` 及旧测试；移除 `AssetBrowserPage` 内 `drawerOpen` 相关状态与旧抽屉挂载。
- `client.ts`：抽出 provider 构造 + 错误分类复用，新增 streamText 路径；`generateObject`/`runAssetSearchTurn` 退役。
- `schema.ts`：`FilterDeltaAddSchema` 复用为工具参数；`is_relevant`/`match_hint` 废弃。
- `promptBuild.buildSystemPrompt` 输出改由 `useAssistantInstructions` 注入。
- 新增依赖：`@assistant-ui/react`、Tailwind v4（`@tailwindcss/vite`）、assistant-ui 预制组件。

## 10. 文档产出（CODEBUDDY.md 强制）

改动公共面需在 `docs/dev/api/` 补说明：
- `usePageAssistant` 复用契约（入参、生命周期、清理语义）。
- 工具注册约定（`toolName`/`parameters`/`execute`/`render`、执行由运行时托管）。
- assistant-ui 主题变量 → 项目 token 的映射表。

## 11. 非目标（YAGNI）

- 多线程 / 历史持久化 / 跨刷新恢复。
- App 详情、画布编辑等其他场景的实际接入（仅预留扩展点）。
- 独立后端聊天端点。
