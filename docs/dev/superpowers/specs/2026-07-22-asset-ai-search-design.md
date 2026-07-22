---
id: asset-ai-search
title: 资产 AI 查询 —— 多轮对话式风格 / 布局筛选
date: 2026-07-22
status: design-approved
scope: apps/design/framework
depends_on:
  - docs/product/design-project.md
  - apps/design/framework/public/assets/designmd/INDEX.md
  - apps/design/framework/public/assets/layoutmd/INDEX.md
---

## Overview

在 `AssetBrowserPage`（Rule / Layout 两页）里引入 AI 对话式筛选：用户用自然语言描述想要的风格 / 布局，AI 通过多轮追问逐步收窄，将条件写成 chip 应用到瀑布列表。同时新增 `/settings` 页面让用户配置 LLM provider 与 key。

## Goals

- 用户在 224 个 style / 若干 layout 里，通过对话找到目标资产
- 无后端；所有 LLM 调用由浏览器直接发出
- AI 只做筛选，越界问题（无关闲聊 / 代码问题）自动拒绝
- 支持 Claude 与 OpenAI 两家 provider；OpenAI 允许自定义 baseURL（走用户自己的 LiteLLM proxy）

## Non-goals

- 向量检索 / embedding / RAG（v1 不做）
- 服务端代理 / 多用户 / 共享 key
- 复用 IDE Skill 与 App Prompt 内容（两份独立维护）
- Agent 框架（LangChain / LangGraph 等，不引）
- 会话持久化（drawer 关闭即清空对话历史；chip bar 状态保留）

## Constraints & Conventions

- 遵循 `docs/dev/conventions/coding-standards.md`、`docs/dev/conventions/mandatory.md`
- Shell UI 遵守 App 声明的 `style: dashboard` + `layouts: [sidebar-shell]`
  - dashboard：`#0C5CAB` 主色、`#09090B` Surface、`#FAFAFA` Text、IBM Plex Sans、8pt 栅格、glass-like 面板、圆角组件
  - sidebar-shell：左侧固定导航 + 顶栏 + 主区滚动
- 新增第三方依赖需在 spec 中列明并已获用户确认

## Architecture

无后端。Skill 内容与 asset 索引作为静态资源由 Vite dev server 提供。

```
┌───────────────────────────────────────────────────────────────┐
│  Browser                                                       │
│                                                                │
│  AssetBrowserPage ──► AiFilterDrawer ──► useAssetSearchAgent   │
│                                              │                 │
│                                              ▼                 │
│                                        Vercel AI SDK           │
│                                        generateObject()        │
│                                              │                 │
│               ┌──────────────────────────────┼───┐             │
│               ▼                              ▼   ▼             │
│         Anthropic API                  OpenAI / LiteLLM Proxy  │
└───────────────────────────────────────────────────────────────┘

Static resources (public/):
  /assets/designmd/INDEX.md          已有，224 风格 + frontmatter
  /assets/layoutmd/INDEX.md          已有
  /prompts/asset-search.md           新增，App 侧 system prompt

Config:
  localStorage['wn.ai.config'] = { provider, baseURL, apiKey, model }

IDE Skill（独立维护，不共享）:
  .claude/skills/asset-search/SKILL.md
```

### 关键决策

- **不引 Agent 框架**：单意图（收窄资产候选）+ 静态数据，`generateObject` 结构化输出即可
- **不做后端**：保持项目 "light project no backend" 定位；未来若要 scale，可在前端不改的情况下把 OpenAI baseURL 指向 LiteLLM proxy
- **两份 prompt 分开维护**：App 侧输出结构化 JSON，IDE 侧使用 Claude Code 工具链，用户与场景差异大，行业主流做法就是各写各的
- **AI 只输出结构化 chip，匹配在客户端**：AI 不参与打分，避免 hallucination；freeform chip 用 pipe 分隔关键词做 OR 匹配

## UI / Components

### 页面变化

**AssetBrowserPage（Rule / Layout 两页共用）**
- 移除现有 `assets-ai-slot`（顶部输入框占位）
- 顶部保留：`title / lead / contextAppId / count`
- 新增 chip 过滤条（在 `assets-page__header` 与 masonry 之间）
  - 展示所有过滤条件 chip（tags / origin / freeform 皆可）
  - 每 chip 可 × 删除；右侧"重置全部"
  - AI 抽屉未打开时仍可用（手动过滤入口）
- 右侧新增 "AI 筛选" 按钮，点击打开抽屉
- masonry 按 chip 组合结果客户端过滤，无分页

**AiFilterDrawer（新增，右侧抽屉，420px）**
- 从右侧滑入，遮罩层；ESC / 遮罩 / × 关闭；`body.overflow=hidden`
- 未配置 AI → 显示 "请先配置模型" + 跳 `/settings`
- 布局：
  ```
  ┌──────────────────────────────────────┐
  │ AI 筛选                          ×   │  ← header
  ├──────────────────────────────────────┤
  │  当前 3 / 224 匹配 · 重置             │  ← 状态条
  │  [chip] [chip] [chip]                │
  ├──────────────────────────────────────┤
  │  ┌ user ─────────────────────────┐  │  ← 消息流（正序，footer 固定）
  │  │ 想做金融数据看板，冷色调       │  │
  │  └───────────────────────────────┘  │
  │  ┌ ai ───────────────────────────┐  │
  │  │ 建议关注 dashboard / fintech   │  │
  │  │ 已应用: [enterprise] [cool]    │  │
  │  │ 追问：更偏 dark 还是 light？   │  │
  │  └───────────────────────────────┘  │
  ├──────────────────────────────────────┤
  │  [ 说说你想找什么风格... ]  [发送]   │
  └──────────────────────────────────────┘
  ```
- 每条 AI 消息底部显示当轮 chip diff（透明度低一档）
- 用户可以说 "去掉冷色调" 触发 remove
- relevance 拒绝的 AI 消息使用 muted 灰色样式，与正常消息可区分

**SettingsPage（新增 `/settings`）**
- 遵循 sidebar-shell 主区规范，页头 + 分区卡片
- Section **AI Provider**：
  - Provider 单选（radio card）：`anthropic` / `openai`
  - Base URL：仅 openai 启用，默认 `https://api.openai.com/v1`
  - API Key：masked 输入，附"测试连接"按钮
  - Model：文本输入，附推荐提示（Claude: `claude-sonnet-4-6`；OpenAI: `gpt-4o-mini` 或 proxy 上的任意 id）
  - 保存按钮：写入 `localStorage['wn.ai.config']`
- 顶部 sidebar 新增 "Settings" 入口，与 Rule / Layout 平级

### 组件清单

| 组件 | 路径（约） | 职责 |
|---|---|---|
| `AssetBrowserPage` | `features/assets/AssetBrowserPage.tsx` | 现有组件，改造：拆 filter state、接 chip bar、接 drawer |
| `AssetFilterChips` | `features/assets/AssetFilterChips.tsx` | 新增，展示当前 chip + 删除 |
| `AiFilterDrawer` | `features/assets/AiFilterDrawer.tsx` | 新增，AI 对话主体 |
| `useAssetSearchAgent` | `features/assets/useAssetSearchAgent.ts` | 管理 messages、调 `generateObject`、算 chip diff |
| `SettingsPage` | `features/settings/SettingsPage.tsx` | 新增，AI 配置入口 |
| `AiConfigForm` | `features/settings/AiConfigForm.tsx` | 新增，被 SettingsPage 使用 |
| `aiClient` | `lib/ai/client.ts` | Vercel AI SDK 包装：读 config + `generateObject(schema)` |
| `aiConfig` | `lib/ai/config.ts` | localStorage 读写 + 校验 |
| `assetIndex` | `lib/ai/assetIndex.ts` | 加载并解析 INDEX.md 为结构化对象 |
| `filterState` | `lib/ai/filterState.ts` | 过滤条件类型 + apply/diff 工具函数 |
| `promptBuild` | `lib/ai/promptBuild.ts` | 拼装 system prompt + 候选注入 |
| System prompt | `public/prompts/asset-search.md` | App 侧 prompt（含 relevance guard） |
| IDE Skill | `.claude/skills/asset-search/SKILL.md` | 独立维护 |

### Dashboard 风格落地

- 抽屉与 SettingsPage 使用 `Surface #09090B` 背景 + `Text #FAFAFA`
- 分区卡片使用 glass-like panel（半透明 + backdrop-filter blur）
- chip：`Primary #0C5CAB` 边框 + 半透明背景；× 悬停变 `Danger #EF4444`
- CTA 按钮（发送 / 保存）：`Primary #0C5CAB`
- 圆角 8-12px
- 字体 IBM Plex Sans（页面已加载 —— 抽屉 / 设置页复用）

## Data Flow

```
                          ┌─────────────────────────────┐
                          │  Vite public/               │
                          │   /assets/designmd/INDEX.md │
                          │   /assets/layoutmd/INDEX.md │
                          │   /prompts/asset-search.md  │
                          └───────────┬─────────────────┘
                                      │ fetch on mount
                                      ▼
   ┌─────────────────────┐   ┌─────────────────────┐
   │  AssetBrowserPage   │   │  useAssetSearchAgent│
   │  ─ filter: Filter   │◄──┤  ─ messages: []     │
   │  ─ items (designApi)│   │  ─ index: AssetMeta[]│
   │                     │   │  ─ config: AiConfig │
   └──────────┬──────────┘   └──────────┬──────────┘
              │ filter                   │ generateObject(SCHEMA)
              ▼                          ▼
        applyFilter()               Vercel AI SDK
              │                          │
              ▼                          ▼
       filtered items          { reply, filter_delta,
        → masonry                is_relevant, done }
                                     │
                                     ▼
                             mergeFilter(filter, delta)
                                     │
                                     └──► back to filter state
```

### 类型

```ts
// lib/ai/filterState.ts
export type FilterKind = 'tag' | 'origin' | 'freeform'

export type FilterChip = {
  id: string                // stable, e.g. "tag:enterprise" or "free:cool"
  kind: FilterKind
  label: string             // 显示文本
  value: string             // 用于匹配（freeform 时可 pipe 分隔 OR 关键词）
  addedBy: 'user' | 'ai'
}

export type Filter = { chips: FilterChip[] }

// lib/ai/assetIndex.ts
export type AssetMeta = {
  id: string
  title: string
  summary: string
  tags: string[]
  origin: string            // 'open-design' / 'awesome-design-md' / 'manual' ...
  hasPreview: boolean
  design_domain?: string[]  // 未来从 DESIGN.md frontmatter 惰性补充
  category?: string
}

// lib/ai/config.ts
export type AiConfig = {
  provider: 'anthropic' | 'openai'
  baseURL?: string          // openai only
  apiKey: string
  model: string
}
```

### 匹配语义

- `tag / origin` chip：精确匹配 `AssetMeta.tags` / `AssetMeta.origin`
- `freeform` chip：value 用 `|` 分隔关键词，任一命中 `title + summary + tags` 拼接文本即算命中（case-insensitive）
- 所有 chip 之间 AND 关系

```ts
function matchesChip(meta: AssetMeta, chip: FilterChip): boolean {
  const hay = `${meta.title} ${meta.summary} ${meta.tags.join(' ')}`.toLowerCase()
  switch (chip.kind) {
    case 'tag':    return meta.tags.includes(chip.value)
    case 'origin': return meta.origin === chip.value
    case 'freeform': {
      const alts = chip.value.toLowerCase().split('|')
      return alts.some(alt => hay.includes(alt))
    }
  }
}
```

### 输出 Schema（Zod）

```ts
const ReplySchema = z.object({
  is_relevant: z.boolean(),
  reply: z.string(),
  filter_delta: z.object({
    add: z.array(z.object({
      kind: z.enum(['tag', 'origin', 'freeform']),
      label: z.string(),
      value: z.string()
    })).default([]),
    remove: z.array(z.string()).default([])  // chip id list
  }).default({add: [], remove: []}),
  match_hint: z.number().int().optional()    // AI 自估，前端用真实值覆盖
})
```

### INDEX 投喂策略

- 启动 fetch 完整 INDEX.md，解析为 `AssetMeta[]`
- 传给 LLM 的是**压缩快照**：只保留 `id / title / tags / origin` + summary 截断到 60 字
- 每轮 system prompt 附**当前候选**（前端已过滤后的集合），AI 能看到"还剩什么"
- 若候选 > 80：只放前 40 + 一句 `"still N items match"`
- 压缩后约 15-20KB，Claude / OpenAI 均无压力

## System Prompt 骨架

`public/prompts/asset-search.md`：

```markdown
# Asset Search Assistant

You help a designer narrow down from a list of design system / layout packages
by asking questions and proposing filter chips.

## Scope guard (STRICT)
The ONLY task is: narrow the asset list by dialogue. If the user asks about
anything else (code, weather, general chat, personal questions, unrelated tools),
you MUST return `is_relevant: false` and `reply` politely declining, e.g.
"我只负责帮你在设计包里筛选风格 / 布局，别的问题帮不上。"

## Filter chip rules
- Prefer `tag` chips when the tag exists in the candidate list.
- Use `origin` chips when the user hints at source (e.g. "官方 open-design").
- Use `freeform` chips for anything else. Value MUST be a pipe-separated
  list of English keywords likely to appear in title/summary/tags
  (e.g. label="冷色调" value="cool|dark|blue|neon|cyber").
- Never add a chip whose value cannot plausibly match ANY item in the
  current candidate list.
- When removing, output the chip id from history.

## Dialogue rules
- Ask ONE question per turn (multiple choice preferred if useful).
- Stop asking when candidates <= 8 OR user says they're done.
- Keep replies under 3 short sentences plus optional bullet list.
- Always respond in the user's language (default Chinese).

## Current candidates
(injected at runtime)
```

## Error Handling

| 场景 | 处理 |
|---|---|
| 未配置 AI（config 为空） | 抽屉提示 "请先在 Settings 配置模型"，附跳转 |
| API 401 | 消息流红色 ai 消息："鉴权失败，请检查 API Key"，附 "打开设置" 链接 |
| API 429 / 网络失败 | 红色消息，"稍后重试"按钮 |
| Schema 解析失败 | Vercel AI SDK 内建重试；仍失败 → 红色 "AI 返回格式异常" |
| INDEX.md 加载失败 | 抽屉禁用 + 显示错误 |
| `is_relevant: false` | 灰色 muted ai 消息，不合并 filter_delta |
| AI 返回未知 chip id 的 remove | 静默忽略 |

## Testing Strategy

### 纯逻辑（vitest）
- `lib/ai/filterState.test.ts`：`matchesChip`（tag/origin/freeform pipe OR）、`mergeFilterDelta`（add 幂等、remove 未知 id 无副作用、AND 语义）
- `lib/ai/config.test.ts`：读写 localStorage、缺字段返回 null、baseURL 仅 openai 有效
- `lib/ai/assetIndex.test.ts`：INDEX.md 表格解析、空 / 缺列 / summary 换行的鲁棒性、`compactForPrompt(items, 40)` 截断
- `lib/ai/promptBuild.test.ts`：候选注入位置、language 提示、kind 差异
- `features/assets/useAssetSearchAgent.test.ts`（mock aiClient）：`is_relevant: false` 不合并 delta、未知 remove id 静默、网络失败进 error 但不清空 messages

### 组件（React Testing Library）
- `AssetFilterChips`：渲染、× 删除回调、reset 回调
- `AiFilterDrawer`：未配置 → 引导；有配置 → 消息流；ESC 关闭；relevance 拒绝 muted 样式
- `SettingsPage`：Provider 切换启用 / 禁用 baseURL、保存写 localStorage、model 校验

### 不测
- 真实 LLM 调用（进手动 smoke checklist）
- Vercel AI SDK 内部
- 视觉快照

### 手动 Smoke Checklist
- style 页开 drawer："想做金融数据看板，冷色调深色主题" → chip ≥ 2 个、候选收窄
- 用户 "去掉冷色调" → 对应 chip 被 remove
- 用户 "今天天气怎么样" → relevance 拒绝、chip 不变
- 切换到 layout 页 → drawer 复用、system prompt kind 变化
- Settings 切 openai → baseURL 改成 LiteLLM URL → 测试连接成功

## Implementation Order

1. 基础设施：`lib/ai/config.ts` + `lib/ai/filterState.ts`（含 test）
2. INDEX 解析：`lib/ai/assetIndex.ts` + `lib/ai/promptBuild.ts`（含 test）
3. 设置页：`SettingsPage` + `AiConfigForm` + 路由 `/settings` + sidebar 入口（form 保存生效但暂无消费者）
4. Vercel AI SDK 接线：装依赖，写 `lib/ai/client.ts`，devtools smoke 两家 provider
5. `useAssetSearchAgent` hook：组装 messages / filter / `generateObject` 循环（mock client 单测）
6. `AssetFilterChips` + AssetBrowserPage chip bar；移除 `assets-ai-slot`；手动加 chip 可用
7. `AiFilterDrawer`：AI 按钮 + drawer + streaming + relevance 灰色态 + 未配置引导 + dashboard 风格
8. 落地 prompt：`public/prompts/asset-search.md` + `.claude/skills/asset-search/SKILL.md`；跑 smoke checklist

## New Dependencies（已获用户确认）

- `ai`（Vercel AI SDK core）
- `@ai-sdk/openai`
- `@ai-sdk/anthropic`
- `zod`（`generateObject` schema，AI SDK peer 依赖）

## Open Questions（v1 已知局限，非阻塞）

- freeform 子串匹配对同义词不敏感，靠 AI 生成 pipe 关键词兜底；若命中率不够，v2 引入 embedding
- 会话不持久化，用户切页后 drawer 消息丢失（chip 保留）；如需持久化再迭代
- IDE Skill 与 App Prompt 手工对齐；未来若维护成本高再考虑抽 SHARED.md
