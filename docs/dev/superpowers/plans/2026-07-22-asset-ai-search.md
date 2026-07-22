# 资产 AI 查询 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `AssetBrowserPage`（Rule / Layout）里通过右侧抽屉与 LLM 多轮对话，把用户描述转成 chip 过滤 masonry 列表；新增 `/settings` 页面配置 provider / key。

**Architecture:** 浏览器直连 Claude / OpenAI，无后端；Vercel AI SDK `generateObject` + Zod schema 每轮返回 `{is_relevant, reply, filter_delta}`；chip 状态在客户端合并并 AND 过滤 asset 索引；INDEX.md / prompt 走 `public/` 静态资源。

**Tech Stack:** React 19 / TypeScript 5.7 / Vite 6 / react-router-dom 7 / Vitest 3 / Vercel AI SDK (`ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic`) / Zod / 组件测试用 `@testing-library/react` + `jsdom`（按文件启用）。

## Global Constraints

- 遵循 `docs/dev/conventions/coding-standards.md`：注释只描述客观事实、共享逻辑抽单元、内部调用无需向后兼容、修改文件内不留 warning
- 遵循 `docs/dev/conventions/mandatory.md`：不猜测需求；bug 从根因修；新依赖需已获用户确认
- 遵循 `docs/dev/conventions/glossary.md` 与 `docs/product/` 现有术语
- Shell UI 遵守 App 声明的 `style: dashboard` + `layouts: [sidebar-shell]`
- 所有新 CSS 使用现有 `--color-primary` / `--color-surface` / `--color-surface-2` / `--color-text` / `--color-muted` / `--color-border` / `--color-danger` / `--space` / `--radius` tokens；不硬编码色值
- localStorage key 命名前缀：`wn.ai.` （避免与既有 `design-engineering-theme` 冲突）
- 新增依赖已获用户确认：`ai` / `@ai-sdk/openai` / `@ai-sdk/anthropic` / `zod`
- 组件测试新增 dev 依赖：`@testing-library/react` / `@testing-library/dom` / `jsdom`（此计划中一并加入，由用户在 Task 1 复核）
- 每个 Task 结束提交一次 git commit（conventional commits 风格：`feat` / `test` / `docs`）
- Test 路径规范：与被测文件同目录，`*.test.ts` 或 `*.test.tsx`；组件测试文件顶部加 `// @vitest-environment jsdom`

## File Structure

**新增文件**
- `apps/design/framework/src/lib/ai/config.ts` — AiConfig 类型 + localStorage 读写
- `apps/design/framework/src/lib/ai/config.test.ts`
- `apps/design/framework/src/lib/ai/filterState.ts` — FilterChip / Filter 类型 + `matchesChip` / `mergeFilterDelta` / `applyFilter` / `chipId`
- `apps/design/framework/src/lib/ai/filterState.test.ts`
- `apps/design/framework/src/lib/ai/assetIndex.ts` — 解析 INDEX.md 表格 → `AssetMeta[]` + `compactForPrompt`
- `apps/design/framework/src/lib/ai/assetIndex.test.ts`
- `apps/design/framework/src/lib/ai/promptBuild.ts` — 组装 system prompt
- `apps/design/framework/src/lib/ai/promptBuild.test.ts`
- `apps/design/framework/src/lib/ai/schema.ts` — Zod `ReplySchema` + 派生 TS 类型
- `apps/design/framework/src/lib/ai/client.ts` — `runAssetSearchTurn(config, systemPrompt, messages)` → `Promise<Reply>`
- `apps/design/framework/src/features/settings/SettingsPage.tsx`
- `apps/design/framework/src/features/settings/AiConfigForm.tsx`
- `apps/design/framework/src/features/settings/settings.css`
- `apps/design/framework/src/features/settings/AiConfigForm.test.tsx`
- `apps/design/framework/src/features/assets/useAssetSearchAgent.ts`
- `apps/design/framework/src/features/assets/useAssetSearchAgent.test.ts`
- `apps/design/framework/src/features/assets/AssetFilterChips.tsx`
- `apps/design/framework/src/features/assets/AssetFilterChips.test.tsx`
- `apps/design/framework/src/features/assets/AiFilterDrawer.tsx`
- `apps/design/framework/src/features/assets/AiFilterDrawer.test.tsx`
- `apps/design/framework/public/prompts/asset-search.md` — App 侧 system prompt
- `.claude/skills/asset-search/SKILL.md` — IDE 侧独立版

**修改文件**
- `apps/design/package.json` — 依赖
- `apps/design/vite.config.ts` — vitest `test.include` 扩到 `**/*.test.tsx`
- `apps/design/framework/src/App.tsx` — 加 `/settings` 路由
- `apps/design/framework/src/shell/SidebarShell.tsx` — 加 "Settings" nav 入口 + `SettingsIcon`
- `apps/design/framework/src/features/assets/AssetBrowserPage.tsx` — 拆 filter state、接 chip bar、接 drawer、移除 `assets-ai-slot`
- `apps/design/framework/src/features/assets/assets.css` — 移除 `.assets-ai-slot*`、追加 chip bar 样式

---

### Task 1: 装依赖 + 单元测试基座

**Files:**
- Modify: `apps/design/package.json`
- Modify: `apps/design/vite.config.ts:24-26`

**Interfaces:**
- Consumes: 无
- Produces: 项目可 `npm install` 并 `npm run test` 通过；vitest 支持 `**/*.test.tsx` 且允许 per-file `@vitest-environment jsdom`

- [ ] **Step 1: 从项目 `apps/design/` 目录安装运行时依赖**

Run:
```bash
cd apps/design && npm install ai@^4 @ai-sdk/openai@^1 @ai-sdk/anthropic@^1 zod@^3
```
Expected: package.json `dependencies` 追加 4 项；无 peer dep 警告或仅 zod 版本提示（zod v3 是 AI SDK 官方 peer）。

- [ ] **Step 2: 安装组件测试 dev 依赖**

Run:
```bash
cd apps/design && npm install --save-dev @testing-library/react@^16 @testing-library/dom@^10 jsdom@^25
```
Expected: package.json `devDependencies` 追加 3 项。

- [ ] **Step 3: 扩展 vitest include 到 tsx**

修改 `apps/design/vite.config.ts` 的 `test` 块：

```ts
  test: {
    environment: 'node',
    include: ['framework/**/*.test.ts', 'framework/**/*.test.tsx'],
  },
```

- [ ] **Step 4: 冒烟测试**

Run:
```bash
cd apps/design && npm run test
```
Expected: 现有测试全部 PASS，无新增失败。

- [ ] **Step 5: Commit**

```bash
git add apps/design/package.json apps/design/package-lock.json apps/design/vite.config.ts
git commit -m "chore(design): add Vercel AI SDK, Zod, testing-library deps"
```

---

### Task 2: `lib/ai/config.ts` — AiConfig localStorage 读写

**Files:**
- Create: `apps/design/framework/src/lib/ai/config.ts`
- Create: `apps/design/framework/src/lib/ai/config.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `type AiConfig = { provider: 'anthropic' | 'openai'; baseURL?: string; apiKey: string; model: string }`
  - `readAiConfig(): AiConfig | null` — 从 localStorage 读；缺任一必填字段返回 `null`；provider 非法返回 `null`
  - `writeAiConfig(config: AiConfig): void`
  - `clearAiConfig(): void`
  - `hasValidConfig(): boolean`
  - Storage key: `'wn.ai.config'`

- [ ] **Step 1: 写测试**

Create `apps/design/framework/src/lib/ai/config.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearAiConfig,
  hasValidConfig,
  readAiConfig,
  writeAiConfig,
} from './config'

afterEach(() => {
  globalThis.localStorage.clear()
})

describe('aiConfig', () => {
  it('returns null when storage is empty', () => {
    expect(readAiConfig()).toBeNull()
    expect(hasValidConfig()).toBe(false)
  })

  it('round-trips a valid anthropic config', () => {
    writeAiConfig({
      provider: 'anthropic',
      apiKey: 'sk-a',
      model: 'claude-sonnet-4-6',
    })
    expect(readAiConfig()).toEqual({
      provider: 'anthropic',
      apiKey: 'sk-a',
      model: 'claude-sonnet-4-6',
    })
    expect(hasValidConfig()).toBe(true)
  })

  it('keeps baseURL only for openai', () => {
    writeAiConfig({
      provider: 'openai',
      apiKey: 'sk-o',
      model: 'gpt-4o-mini',
      baseURL: 'https://proxy.example/v1',
    })
    expect(readAiConfig()?.baseURL).toBe('https://proxy.example/v1')

    writeAiConfig({
      provider: 'anthropic',
      apiKey: 'sk-a',
      model: 'claude-sonnet-4-6',
      baseURL: 'https://ignored',
    })
    expect(readAiConfig()?.baseURL).toBeUndefined()
  })

  it('returns null for malformed provider', () => {
    globalThis.localStorage.setItem(
      'wn.ai.config',
      JSON.stringify({ provider: 'bogus', apiKey: 'x', model: 'y' }),
    )
    expect(readAiConfig()).toBeNull()
  })

  it('returns null when required field missing', () => {
    globalThis.localStorage.setItem(
      'wn.ai.config',
      JSON.stringify({ provider: 'openai', apiKey: '', model: 'gpt-4o' }),
    )
    expect(readAiConfig()).toBeNull()
  })

  it('clears storage', () => {
    writeAiConfig({ provider: 'anthropic', apiKey: 'sk', model: 'm' })
    clearAiConfig()
    expect(readAiConfig()).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/design && npx vitest run framework/src/lib/ai/config.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: 实现**

Create `apps/design/framework/src/lib/ai/config.ts`:

```ts
export type AiProvider = 'anthropic' | 'openai'

export type AiConfig = {
  provider: AiProvider
  baseURL?: string
  apiKey: string
  model: string
}

const STORAGE_KEY = 'wn.ai.config'

function isProvider(value: unknown): value is AiProvider {
  return value === 'anthropic' || value === 'openai'
}

export function readAiConfig(): AiConfig | null {
  let raw: string | null
  try {
    raw = globalThis.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as Record<string, unknown>
  if (!isProvider(record.provider)) return null
  if (typeof record.apiKey !== 'string' || record.apiKey.length === 0) return null
  if (typeof record.model !== 'string' || record.model.length === 0) return null
  const baseURL =
    record.provider === 'openai' &&
    typeof record.baseURL === 'string' &&
    record.baseURL.length > 0
      ? record.baseURL
      : undefined
  return {
    provider: record.provider,
    apiKey: record.apiKey,
    model: record.model,
    ...(baseURL ? { baseURL } : {}),
  }
}

export function writeAiConfig(config: AiConfig): void {
  const payload: AiConfig = {
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    ...(config.provider === 'openai' && config.baseURL
      ? { baseURL: config.baseURL }
      : {}),
  }
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore quota / private-mode failures
  }
}

export function clearAiConfig(): void {
  try {
    globalThis.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function hasValidConfig(): boolean {
  return readAiConfig() !== null
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/design && npx vitest run framework/src/lib/ai/config.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/design/framework/src/lib/ai/config.ts apps/design/framework/src/lib/ai/config.test.ts
git commit -m "feat(design/ai): add AiConfig localStorage helpers"
```

---

### Task 3: `lib/ai/filterState.ts` — Chip / Filter 数据结构

**Files:**
- Create: `apps/design/framework/src/lib/ai/filterState.ts`
- Create: `apps/design/framework/src/lib/ai/filterState.test.ts`

**Interfaces:**
- Consumes: `AssetMeta` 类型（前置声明，实现在 Task 4）—— 本 Task 内使用最小结构 `{ id, title, summary, tags, origin }`
- Produces:
  - `type FilterKind = 'tag' | 'origin' | 'freeform'`
  - `type FilterChip = { id: string; kind: FilterKind; label: string; value: string; addedBy: 'user' | 'ai' }`
  - `type Filter = { chips: FilterChip[] }`
  - `type FilterDelta = { add: Array<Omit<FilterChip, 'id' | 'addedBy'>>; remove: string[] }`
  - `chipId(kind, value): string` — 稳定 id，如 `"tag:enterprise"` `"free:cool"` `"origin:manual"`
  - `matchesChip(meta, chip): boolean`
  - `applyFilter(items, filter): T[]` （T extends AssetMetaLike）
  - `mergeFilterDelta(filter, delta, addedBy): Filter` — add 幂等，remove 未知 id 无副作用
  - `emptyFilter(): Filter`

- [ ] **Step 1: 写测试**

Create `apps/design/framework/src/lib/ai/filterState.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  applyFilter,
  chipId,
  emptyFilter,
  matchesChip,
  mergeFilterDelta,
  type FilterChip,
} from './filterState'

const NEON = {
  id: 'neon',
  title: 'Design System Inspired by Neon',
  summary: 'Electric neon glow high-contrast dark interfaces',
  tags: ['spec'],
  origin: 'open-design',
}
const APPLE = {
  id: 'apple',
  title: 'Apple-design-analysis',
  summary: 'Photography-first premium white space',
  tags: ['spec'],
  origin: 'awesome-design-md',
}
const SHELL = {
  id: 'sidebar-shell',
  title: 'Sidebar Shell',
  summary: '左侧固定导航 + 顶栏 + 主内容区滚动',
  tags: ['layout'],
  origin: 'manual',
}

function chip(input: {
  kind: FilterChip['kind']
  value: string
  label?: string
  addedBy?: 'user' | 'ai'
}): FilterChip {
  return {
    id: chipId(input.kind, input.value),
    kind: input.kind,
    value: input.value,
    label: input.label ?? input.value,
    addedBy: input.addedBy ?? 'user',
  }
}

describe('chipId', () => {
  it('returns stable ids per kind + value', () => {
    expect(chipId('tag', 'enterprise')).toBe('tag:enterprise')
    expect(chipId('freeform', 'cool|dark')).toBe('free:cool|dark')
    expect(chipId('origin', 'manual')).toBe('origin:manual')
  })
})

describe('matchesChip', () => {
  it('matches tag chip on exact tag list membership', () => {
    expect(matchesChip(SHELL, chip({ kind: 'tag', value: 'layout' }))).toBe(true)
    expect(matchesChip(SHELL, chip({ kind: 'tag', value: 'spec' }))).toBe(false)
  })

  it('matches origin chip exactly', () => {
    expect(matchesChip(APPLE, chip({ kind: 'origin', value: 'awesome-design-md' }))).toBe(true)
    expect(matchesChip(APPLE, chip({ kind: 'origin', value: 'open-design' }))).toBe(false)
  })

  it('matches freeform via pipe-separated OR keywords, case-insensitive', () => {
    expect(matchesChip(NEON, chip({ kind: 'freeform', value: 'cool|dark|neon' }))).toBe(true)
    expect(matchesChip(NEON, chip({ kind: 'freeform', value: 'PHOTOGRAPHY' }))).toBe(false)
    expect(matchesChip(APPLE, chip({ kind: 'freeform', value: 'photography' }))).toBe(true)
  })
})

describe('applyFilter', () => {
  const items = [NEON, APPLE, SHELL]

  it('returns all items on empty filter', () => {
    expect(applyFilter(items, emptyFilter())).toEqual(items)
  })

  it('ANDs multiple chips across kinds', () => {
    const filter = {
      chips: [
        chip({ kind: 'tag', value: 'spec' }),
        chip({ kind: 'freeform', value: 'dark|neon' }),
      ],
    }
    expect(applyFilter(items, filter)).toEqual([NEON])
  })
})

describe('mergeFilterDelta', () => {
  it('adds new chips and marks author', () => {
    const next = mergeFilterDelta(
      emptyFilter(),
      { add: [{ kind: 'tag', label: 'spec', value: 'spec' }], remove: [] },
      'ai',
    )
    expect(next.chips).toHaveLength(1)
    expect(next.chips[0]).toMatchObject({
      id: 'tag:spec',
      addedBy: 'ai',
      value: 'spec',
    })
  })

  it('is idempotent on duplicate add', () => {
    const base = mergeFilterDelta(
      emptyFilter(),
      { add: [{ kind: 'tag', label: 'spec', value: 'spec' }], remove: [] },
      'user',
    )
    const again = mergeFilterDelta(
      base,
      { add: [{ kind: 'tag', label: 'spec', value: 'spec' }], remove: [] },
      'ai',
    )
    expect(again.chips).toHaveLength(1)
    expect(again.chips[0]!.addedBy).toBe('user') // 保留原作者
  })

  it('removes by id and silently ignores unknown ids', () => {
    const base = mergeFilterDelta(
      emptyFilter(),
      { add: [{ kind: 'tag', label: 'spec', value: 'spec' }], remove: [] },
      'user',
    )
    const next = mergeFilterDelta(
      base,
      { add: [], remove: ['tag:spec', 'tag:unknown'] },
      'ai',
    )
    expect(next.chips).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/design && npx vitest run framework/src/lib/ai/filterState.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

Create `apps/design/framework/src/lib/ai/filterState.ts`:

```ts
export type FilterKind = 'tag' | 'origin' | 'freeform'

export type FilterChip = {
  id: string
  kind: FilterKind
  label: string
  value: string
  addedBy: 'user' | 'ai'
}

export type Filter = { chips: FilterChip[] }

export type FilterDeltaAdd = {
  kind: FilterKind
  label: string
  value: string
}

export type FilterDelta = {
  add: FilterDeltaAdd[]
  remove: string[]
}

export type AssetMetaLike = {
  id: string
  title: string
  summary: string
  tags: string[]
  origin: string
}

export function chipId(kind: FilterKind, value: string): string {
  const prefix = kind === 'freeform' ? 'free' : kind
  return `${prefix}:${value}`
}

export function emptyFilter(): Filter {
  return { chips: [] }
}

export function matchesChip(meta: AssetMetaLike, chip: FilterChip): boolean {
  switch (chip.kind) {
    case 'tag':
      return meta.tags.includes(chip.value)
    case 'origin':
      return meta.origin === chip.value
    case 'freeform': {
      const hay = `${meta.title} ${meta.summary} ${meta.tags.join(' ')}`.toLowerCase()
      const alts = chip.value.toLowerCase().split('|').filter(Boolean)
      return alts.some((alt) => hay.includes(alt))
    }
  }
}

export function applyFilter<T extends AssetMetaLike>(items: T[], filter: Filter): T[] {
  if (filter.chips.length === 0) return items
  return items.filter((meta) => filter.chips.every((chip) => matchesChip(meta, chip)))
}

export function mergeFilterDelta(
  filter: Filter,
  delta: FilterDelta,
  addedBy: 'user' | 'ai',
): Filter {
  const byId = new Map(filter.chips.map((c) => [c.id, c]))
  for (const id of delta.remove) {
    byId.delete(id)
  }
  for (const add of delta.add) {
    const id = chipId(add.kind, add.value)
    if (byId.has(id)) continue
    byId.set(id, {
      id,
      kind: add.kind,
      label: add.label,
      value: add.value,
      addedBy,
    })
  }
  return { chips: Array.from(byId.values()) }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/design && npx vitest run framework/src/lib/ai/filterState.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/design/framework/src/lib/ai/filterState.ts apps/design/framework/src/lib/ai/filterState.test.ts
git commit -m "feat(design/ai): add FilterChip state + apply/merge helpers"
```

---

### Task 4: `lib/ai/assetIndex.ts` — INDEX.md 解析 + prompt 压缩

**Files:**
- Create: `apps/design/framework/src/lib/ai/assetIndex.ts`
- Create: `apps/design/framework/src/lib/ai/assetIndex.test.ts`

**Interfaces:**
- Consumes: `AssetKind` from `@/lib/types`（已存在：`'designmd' | 'layoutmd'`）
- Produces:
  - `type AssetMeta = { id: string; title: string; summary: string; tags: string[]; origin: string; hasPreview: boolean }`
  - `parseIndexMarkdown(source: string): AssetMeta[]` — 解析已有 INDEX.md 表格格式
  - `fetchAssetIndex(kind: AssetKind): Promise<AssetMeta[]>` — `fetch('/assets/<kind>/INDEX.md').text()` → `parseIndexMarkdown`
  - `compactForPrompt(items: AssetMeta[], limit?: number): string` — 输出多行 `id | title | tags | origin | short_summary`；默认 40 条，超限追加 `still N items match`

- [ ] **Step 1: 写测试**

Create `apps/design/framework/src/lib/ai/assetIndex.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { compactForPrompt, parseIndexMarkdown, type AssetMeta } from './assetIndex'

const SAMPLE = `# 设计风格索引（自动生成，勿手改）

> 由脚本生成

共 3 个风格。列：目录 | 标题 | 摘要 | 标签 | 来源 | 预览。

| dir | title | summary | tags | origin | preview |
| --- | --- | --- | --- | --- | --- |
| \`neon\` | Design System Inspired by Neon | Electric neon glow effects. | spec | open-design | Y |
| \`apple\` | Apple-design-analysis | Photography-first premium white space… | spec | awesome-design-md |  |
| \`sidebar-shell\` | Sidebar Shell | 左侧固定导航 + 顶栏 + 主内容区滚动 | layout | manual | Y |
`

describe('parseIndexMarkdown', () => {
  it('parses id/title/summary/tags/origin/hasPreview', () => {
    const items = parseIndexMarkdown(SAMPLE)
    expect(items).toHaveLength(3)
    expect(items[0]).toEqual<AssetMeta>({
      id: 'neon',
      title: 'Design System Inspired by Neon',
      summary: 'Electric neon glow effects.',
      tags: ['spec'],
      origin: 'open-design',
      hasPreview: true,
    })
    expect(items[1]!.hasPreview).toBe(false)
    expect(items[2]!.tags).toEqual(['layout'])
    expect(items[2]!.origin).toBe('manual')
  })

  it('splits comma-separated tags', () => {
    const src = `| dir | title | summary | tags | origin | preview |
| --- | --- | --- | --- | --- | --- |
| \`x\` | X | foo | spec, ui | manual | Y |
`
    const [item] = parseIndexMarkdown(src)
    expect(item!.tags).toEqual(['spec', 'ui'])
  })

  it('returns empty array when no table', () => {
    expect(parseIndexMarkdown('# empty')).toEqual([])
  })

  it('skips rows with fewer than 6 columns', () => {
    const src = `| dir | title | summary | tags | origin | preview |
| --- | --- | --- | --- | --- | --- |
| \`bad\` | broken row |
| \`good\` | Good | s | spec | manual | Y |
`
    const items = parseIndexMarkdown(src)
    expect(items.map((i) => i.id)).toEqual(['good'])
  })
})

describe('compactForPrompt', () => {
  const items: AssetMeta[] = Array.from({ length: 90 }, (_, i) => ({
    id: `id-${i}`,
    title: `Title ${i}`,
    summary: 'a'.repeat(120),
    tags: ['spec'],
    origin: 'open-design',
    hasPreview: true,
  }))

  it('truncates summary to <=60 chars', () => {
    const out = compactForPrompt(items.slice(0, 1))
    const line = out.split('\n')[0]!
    // extract summary field (between last two ' | ')
    const parts = line.split(' | ')
    expect(parts[parts.length - 1]!.length).toBeLessThanOrEqual(60)
  })

  it('caps at limit and appends overflow hint', () => {
    const out = compactForPrompt(items, 40)
    const lines = out.trim().split('\n')
    expect(lines).toHaveLength(41) // 40 rows + overflow line
    expect(lines[lines.length - 1]).toBe('… still 50 items match')
  })

  it('omits overflow line when under limit', () => {
    const out = compactForPrompt(items.slice(0, 5), 40)
    expect(out).not.toContain('still')
    expect(out.trim().split('\n')).toHaveLength(5)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/design && npx vitest run framework/src/lib/ai/assetIndex.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

Create `apps/design/framework/src/lib/ai/assetIndex.ts`:

```ts
import type { AssetKind } from '@/lib/types'

export type AssetMeta = {
  id: string
  title: string
  summary: string
  tags: string[]
  origin: string
  hasPreview: boolean
}

const BACKTICK_STRIP = /^`|`$/g

function stripBackticks(cell: string): string {
  return cell.trim().replace(BACKTICK_STRIP, '').trim()
}

function splitTags(cell: string): string[] {
  return cell
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function splitCells(row: string): string[] {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((c) => c.trim())
}

export function parseIndexMarkdown(source: string): AssetMeta[] {
  const lines = source.split(/\r?\n/)
  const out: AssetMeta[] = []
  let inTable = false
  let sawSeparator = false
  for (const line of lines) {
    if (!inTable) {
      if (/^\|\s*dir\s*\|/i.test(line)) {
        inTable = true
        sawSeparator = false
      }
      continue
    }
    if (!sawSeparator) {
      if (/^\|\s*-{3,}/.test(line)) sawSeparator = true
      continue
    }
    if (line.trim().length === 0) break
    if (!line.trim().startsWith('|')) break
    const cells = splitCells(line)
    if (cells.length < 6) continue
    const [dirCell, titleCell, summaryCell, tagsCell, originCell, previewCell] = cells
    const id = stripBackticks(dirCell ?? '')
    if (!id) continue
    out.push({
      id,
      title: (titleCell ?? '').trim(),
      summary: (summaryCell ?? '').trim(),
      tags: splitTags(tagsCell ?? ''),
      origin: (originCell ?? '').trim(),
      hasPreview: (previewCell ?? '').trim().toUpperCase() === 'Y',
    })
  }
  return out
}

export async function fetchAssetIndex(kind: AssetKind): Promise<AssetMeta[]> {
  const res = await fetch(`/assets/${kind}/INDEX.md`)
  if (!res.ok) throw new Error(`Failed to fetch ${kind} INDEX.md: ${res.status}`)
  const text = await res.text()
  return parseIndexMarkdown(text)
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

export function compactForPrompt(items: AssetMeta[], limit = 40): string {
  const head = items.slice(0, limit).map((m) => {
    const tags = m.tags.join(',') || '-'
    const summary = truncate(m.summary || '-', 60)
    return `${m.id} | ${m.title} | ${tags} | ${m.origin} | ${summary}`
  })
  if (items.length > limit) {
    head.push(`… still ${items.length - limit} items match`)
  }
  return `${head.join('\n')}\n`
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/design && npx vitest run framework/src/lib/ai/assetIndex.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/design/framework/src/lib/ai/assetIndex.ts apps/design/framework/src/lib/ai/assetIndex.test.ts
git commit -m "feat(design/ai): parse INDEX.md + compactForPrompt"
```

---

### Task 5: `lib/ai/promptBuild.ts` + Zod schema

**Files:**
- Create: `apps/design/framework/src/lib/ai/promptBuild.ts`
- Create: `apps/design/framework/src/lib/ai/promptBuild.test.ts`
- Create: `apps/design/framework/src/lib/ai/schema.ts`

**Interfaces:**
- Consumes: `AssetKind`、`AssetMeta`、`Filter`、`compactForPrompt`
- Produces:
  - `type Reply = { is_relevant: boolean; reply: string; filter_delta: FilterDelta; match_hint?: number }`
  - `ReplySchema: ZodSchema<Reply>`
  - `buildSystemPrompt(input: { basePrompt: string; kind: AssetKind; filter: Filter; candidates: AssetMeta[] }): string`
  - System prompt 会拼装：basePrompt（`public/prompts/asset-search.md` 内容）+ "## Kind" 段 + "## Current chips" 段 + "## Candidates"（用 `compactForPrompt`）

- [ ] **Step 1: 写 schema**

Create `apps/design/framework/src/lib/ai/schema.ts`:

```ts
import { z } from 'zod'

export const FilterDeltaAddSchema = z.object({
  kind: z.enum(['tag', 'origin', 'freeform']),
  label: z.string(),
  value: z.string(),
})

export const ReplySchema = z.object({
  is_relevant: z.boolean(),
  reply: z.string(),
  filter_delta: z
    .object({
      add: z.array(FilterDeltaAddSchema).default([]),
      remove: z.array(z.string()).default([]),
    })
    .default({ add: [], remove: [] }),
  match_hint: z.number().int().optional(),
})

export type Reply = z.infer<typeof ReplySchema>
```

- [ ] **Step 2: 写 promptBuild 测试**

Create `apps/design/framework/src/lib/ai/promptBuild.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { AssetMeta } from './assetIndex'
import { buildSystemPrompt } from './promptBuild'
import { emptyFilter, mergeFilterDelta } from './filterState'

const BASE = '# Asset Search Assistant\nBASE_PROMPT_MARKER'

const ITEMS: AssetMeta[] = [
  {
    id: 'neon',
    title: 'Neon',
    summary: 'glow',
    tags: ['spec'],
    origin: 'open-design',
    hasPreview: true,
  },
  {
    id: 'apple',
    title: 'Apple',
    summary: 'photography',
    tags: ['spec'],
    origin: 'awesome-design-md',
    hasPreview: false,
  },
]

describe('buildSystemPrompt', () => {
  it('embeds base prompt, kind and candidates', () => {
    const out = buildSystemPrompt({
      basePrompt: BASE,
      kind: 'designmd',
      filter: emptyFilter(),
      candidates: ITEMS,
    })
    expect(out).toContain('BASE_PROMPT_MARKER')
    expect(out).toContain('## Kind\ndesignmd')
    expect(out).toContain('## Candidates')
    expect(out).toContain('neon | Neon')
    expect(out).toContain('apple | Apple')
  })

  it('serializes current chips (or "none")', () => {
    const empty = buildSystemPrompt({
      basePrompt: BASE,
      kind: 'designmd',
      filter: emptyFilter(),
      candidates: ITEMS,
    })
    expect(empty).toMatch(/## Current chips\nnone/)

    const filter = mergeFilterDelta(
      emptyFilter(),
      { add: [{ kind: 'tag', label: 'spec', value: 'spec' }], remove: [] },
      'user',
    )
    const withChip = buildSystemPrompt({
      basePrompt: BASE,
      kind: 'designmd',
      filter,
      candidates: ITEMS,
    })
    expect(withChip).toContain('tag:spec (spec)')
  })

  it('differs across kinds', () => {
    const a = buildSystemPrompt({
      basePrompt: BASE,
      kind: 'designmd',
      filter: emptyFilter(),
      candidates: ITEMS,
    })
    const b = buildSystemPrompt({
      basePrompt: BASE,
      kind: 'layoutmd',
      filter: emptyFilter(),
      candidates: ITEMS,
    })
    expect(a).not.toBe(b)
    expect(b).toContain('## Kind\nlayoutmd')
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd apps/design && npx vitest run framework/src/lib/ai/promptBuild.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现 promptBuild**

Create `apps/design/framework/src/lib/ai/promptBuild.ts`:

```ts
import type { AssetKind } from '@/lib/types'
import { compactForPrompt, type AssetMeta } from './assetIndex'
import type { Filter } from './filterState'

export type BuildSystemPromptInput = {
  basePrompt: string
  kind: AssetKind
  filter: Filter
  candidates: AssetMeta[]
}

function formatChips(filter: Filter): string {
  if (filter.chips.length === 0) return 'none'
  return filter.chips.map((c) => `${c.id} (${c.label})`).join('\n')
}

export function buildSystemPrompt(input: BuildSystemPromptInput): string {
  return [
    input.basePrompt.trimEnd(),
    '',
    '## Kind',
    input.kind,
    '',
    '## Current chips',
    formatChips(input.filter),
    '',
    '## Candidates',
    compactForPrompt(input.candidates).trimEnd(),
    '',
  ].join('\n')
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd apps/design && npx vitest run framework/src/lib/ai/promptBuild.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/design/framework/src/lib/ai/promptBuild.ts apps/design/framework/src/lib/ai/promptBuild.test.ts apps/design/framework/src/lib/ai/schema.ts
git commit -m "feat(design/ai): buildSystemPrompt + Zod ReplySchema"
```

---

### Task 6: SettingsPage + AiConfigForm + 路由 + sidebar 入口

**Files:**
- Create: `apps/design/framework/src/features/settings/SettingsPage.tsx`
- Create: `apps/design/framework/src/features/settings/AiConfigForm.tsx`
- Create: `apps/design/framework/src/features/settings/AiConfigForm.test.tsx`
- Create: `apps/design/framework/src/features/settings/settings.css`
- Modify: `apps/design/framework/src/App.tsx`
- Modify: `apps/design/framework/src/shell/SidebarShell.tsx`

**Interfaces:**
- Consumes: `AiConfig`, `readAiConfig`, `writeAiConfig` from `@/lib/ai/config`
- Produces:
  - Route `/settings` mounts `<SettingsPage />`
  - Sidebar 顶部 nav 追加 "Settings" link，位于 Assets 组之后（Workspace 组之前）
  - `AiConfigForm` 组件：受控表单，保存写 localStorage 并展示成功 notice

- [ ] **Step 1: 加路由**

Modify `apps/design/framework/src/App.tsx`:

在 imports 追加：
```tsx
import { SettingsPage } from './features/settings/SettingsPage'
```

在 `<Routes>` 里、`<Route path="*" ...>` 之前追加：
```tsx
          <Route path="/settings" element={<SettingsPage />} />
```

- [ ] **Step 2: 加 sidebar 入口**

Modify `apps/design/framework/src/shell/SidebarShell.tsx`:

在 `AssetsIcon` 定义之后追加：
```tsx
function SettingsIcon() {
  return (
    <svg className="sidebar-shell__icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}
```

在 `<NavLink to="/assets/layout" ...>` 之后 (以及 `nodes.length > 0` 判断之前) 追加：
```tsx
          <div className="sidebar-shell__group-label">System</div>
          <NavLink to="/settings" className={navLinkClassName}>
            <SettingsIcon />
            <span className="sidebar-shell__nav-link-text">Settings</span>
          </NavLink>
```

- [ ] **Step 3: 写 AiConfigForm 测试**

Create `apps/design/framework/src/features/settings/AiConfigForm.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AiConfigForm } from './AiConfigForm'
import { clearAiConfig, readAiConfig } from '@/lib/ai/config'

afterEach(() => {
  clearAiConfig()
})

describe('AiConfigForm', () => {
  it('renders empty defaults when no config stored', () => {
    render(<AiConfigForm />)
    expect((screen.getByLabelText(/API Key/i) as HTMLInputElement).value).toBe('')
  })

  it('disables baseURL for anthropic and enables for openai', () => {
    render(<AiConfigForm />)
    const baseUrl = screen.getByLabelText(/Base URL/i) as HTMLInputElement
    expect(baseUrl.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText(/OpenAI/i))
    expect(baseUrl.disabled).toBe(false)
  })

  it('saves valid config to localStorage', () => {
    render(<AiConfigForm />)
    fireEvent.click(screen.getByLabelText(/OpenAI/i))
    fireEvent.change(screen.getByLabelText(/Base URL/i), {
      target: { value: 'https://proxy.example/v1' },
    })
    fireEvent.change(screen.getByLabelText(/API Key/i), {
      target: { value: 'sk-x' },
    })
    fireEvent.change(screen.getByLabelText(/Model/i), {
      target: { value: 'gpt-4o-mini' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Save/i }))
    expect(readAiConfig()).toEqual({
      provider: 'openai',
      baseURL: 'https://proxy.example/v1',
      apiKey: 'sk-x',
      model: 'gpt-4o-mini',
    })
  })

  it('rejects save when required fields blank', () => {
    render(<AiConfigForm />)
    fireEvent.click(screen.getByRole('button', { name: /Save/i }))
    expect(readAiConfig()).toBeNull()
    expect(screen.getByText(/API Key and Model are required/i)).toBeTruthy()
  })
})
```

- [ ] **Step 4: 实现 AiConfigForm**

Create `apps/design/framework/src/features/settings/AiConfigForm.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import {
  readAiConfig,
  writeAiConfig,
  type AiConfig,
  type AiProvider,
} from '@/lib/ai/config'
import './settings.css'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

export function AiConfigForm() {
  const initial = readAiConfig()
  const [provider, setProvider] = useState<AiProvider>(initial?.provider ?? 'anthropic')
  const [baseURL, setBaseURL] = useState<string>(initial?.baseURL ?? DEFAULT_BASE_URL)
  const [apiKey, setApiKey] = useState<string>(initial?.apiKey ?? '')
  const [model, setModel] = useState<string>(initial?.model ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<boolean>(false)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaved(false)
    if (apiKey.trim().length === 0 || model.trim().length === 0) {
      setError('API Key and Model are required')
      return
    }
    const config: AiConfig = {
      provider,
      apiKey: apiKey.trim(),
      model: model.trim(),
      ...(provider === 'openai' && baseURL.trim().length > 0
        ? { baseURL: baseURL.trim() }
        : {}),
    }
    writeAiConfig(config)
    setError(null)
    setSaved(true)
  }

  const modelHint =
    provider === 'anthropic'
      ? 'e.g. claude-sonnet-4-6'
      : 'e.g. gpt-4o-mini (or any id on your proxy)'

  return (
    <form className="settings-form" onSubmit={onSubmit}>
      <fieldset className="settings-form__section">
        <legend className="settings-form__legend">Provider</legend>
        <label className="settings-form__radio">
          <input
            type="radio"
            name="provider"
            value="anthropic"
            checked={provider === 'anthropic'}
            onChange={() => setProvider('anthropic')}
          />
          Anthropic (Claude)
        </label>
        <label className="settings-form__radio">
          <input
            type="radio"
            name="provider"
            value="openai"
            checked={provider === 'openai'}
            onChange={() => setProvider('openai')}
          />
          OpenAI (or OpenAI-compatible proxy)
        </label>
      </fieldset>

      <label className="settings-form__field">
        <span className="settings-form__label">Base URL</span>
        <input
          className="settings-form__input"
          type="url"
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
          disabled={provider !== 'openai'}
          placeholder={DEFAULT_BASE_URL}
        />
      </label>

      <label className="settings-form__field">
        <span className="settings-form__label">API Key</span>
        <input
          className="settings-form__input"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          placeholder="sk-..."
        />
      </label>

      <label className="settings-form__field">
        <span className="settings-form__label">Model</span>
        <input
          className="settings-form__input"
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={modelHint}
        />
        <span className="settings-form__hint">{modelHint}</span>
      </label>

      {error ? <p className="settings-form__error">{error}</p> : null}
      {saved ? <p className="settings-form__notice">Saved.</p> : null}

      <div className="settings-form__actions">
        <button type="submit" className="assets-btn">
          Save
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 5: 实现 SettingsPage**

Create `apps/design/framework/src/features/settings/SettingsPage.tsx`:

```tsx
import { AiConfigForm } from './AiConfigForm'
import './settings.css'

export function SettingsPage() {
  return (
    <div className="settings-page">
      <header className="settings-page__header">
        <h1>Settings</h1>
        <p className="settings-page__lead">
          Configure your AI provider. Keys stay in this browser (localStorage) and
          are sent directly to the provider you choose — nothing is proxied.
        </p>
      </header>

      <section className="settings-page__section">
        <h2 className="settings-page__section-title">AI Provider</h2>
        <AiConfigForm />
      </section>
    </div>
  )
}
```

- [ ] **Step 6: 实现 settings.css**

Create `apps/design/framework/src/features/settings/settings.css`:

```css
.settings-page {
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 2.5);
  width: 100%;
  max-width: 720px;
}

.settings-page__header h1 {
  margin: 0;
}

.settings-page__lead {
  margin: calc(var(--space) * 0.75) 0 0;
  color: var(--color-muted);
  font-size: 14px;
  line-height: 1.5;
}

.settings-page__section {
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 1.5);
  padding: calc(var(--space) * 2);
  border: 1px solid var(--color-border);
  border-radius: calc(var(--radius) * 1.5);
  background: var(--color-surface-2);
}

.settings-page__section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 1.5);
}

.settings-form__section {
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 0.75);
  padding: calc(var(--space) * 1.25) calc(var(--space) * 1.5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}

.settings-form__legend {
  padding: 0 calc(var(--space) * 0.5);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.settings-form__radio {
  display: inline-flex;
  align-items: center;
  gap: calc(var(--space) * 0.75);
  font-size: 14px;
  cursor: pointer;
}

.settings-form__field {
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 0.5);
}

.settings-form__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.settings-form__input {
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.settings-form__input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-form__hint {
  font-size: 12px;
  color: var(--color-muted);
}

.settings-form__error {
  margin: 0;
  padding: calc(var(--space) * 1) calc(var(--space) * 1.25);
  border-radius: var(--radius);
  border: 1px solid color-mix(in srgb, var(--color-danger) 45%, transparent);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  color: var(--color-danger);
  font-size: 13px;
}

.settings-form__notice {
  margin: 0;
  padding: calc(var(--space) * 1) calc(var(--space) * 1.25);
  border-radius: var(--radius);
  border: 1px solid color-mix(in srgb, var(--color-success) 45%, transparent);
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
  color: var(--color-success);
  font-size: 13px;
}

.settings-form__actions {
  display: flex;
  justify-content: flex-end;
}
```

- [ ] **Step 7: 运行测试**

Run: `cd apps/design && npx vitest run framework/src/features/settings/AiConfigForm.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 8: 手动烟测**

Run: `cd apps/design && npm run dev`

在浏览器打开 `http://localhost:5173/settings`。验证：
- 侧栏 "System / Settings" 链接可见并激活
- Provider 切到 OpenAI 后 Base URL 输入框启用
- 填 provider=OpenAI / baseURL / apiKey / model → Save → localStorage['wn.ai.config'] 有正确 JSON

停止 dev 服务器。

- [ ] **Step 9: Commit**

```bash
git add apps/design/framework/src/features/settings apps/design/framework/src/App.tsx apps/design/framework/src/shell/SidebarShell.tsx
git commit -m "feat(design): SettingsPage + sidebar entry for AI provider config"
```

---

### Task 7: `lib/ai/client.ts` — Vercel AI SDK 接线

**Files:**
- Create: `apps/design/framework/src/lib/ai/client.ts`

**Interfaces:**
- Consumes: `AiConfig` from `./config`, `Reply` / `ReplySchema` from `./schema`
- Produces:
  - `type ChatMessage = { role: 'user' | 'assistant'; content: string }`
  - `class AiClientError extends Error { readonly kind: 'auth' | 'network' | 'schema' | 'unknown' }`
  - `async function runAssetSearchTurn(input: { config: AiConfig; systemPrompt: string; messages: ChatMessage[] }): Promise<Reply>` — 内部 switch provider → `generateObject({ model, system, messages, schema })` → return `Reply`；rethrow 归类错误。

- [ ] **Step 1: 实现 client**

Create `apps/design/framework/src/lib/ai/client.ts`:

```ts
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import type { AiConfig } from './config'
import { ReplySchema, type Reply } from './schema'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type AiClientErrorKind = 'auth' | 'network' | 'schema' | 'unknown'

export class AiClientError extends Error {
  readonly kind: AiClientErrorKind
  constructor(kind: AiClientErrorKind, message: string) {
    super(message)
    this.name = 'AiClientError'
    this.kind = kind
  }
}

function classify(err: unknown): AiClientError {
  if (err instanceof AiClientError) return err
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'AI request failed'
  const lower = message.toLowerCase()
  if (lower.includes('401') || lower.includes('unauthor') || lower.includes('api key')) {
    return new AiClientError('auth', message)
  }
  if (lower.includes('fetch') || lower.includes('network') || lower.includes('failed to fetch')) {
    return new AiClientError('network', message)
  }
  if (lower.includes('schema') || lower.includes('parse') || lower.includes('validation')) {
    return new AiClientError('schema', message)
  }
  return new AiClientError('unknown', message)
}

export type RunAssetSearchTurnInput = {
  config: AiConfig
  systemPrompt: string
  messages: ChatMessage[]
}

export async function runAssetSearchTurn(input: RunAssetSearchTurnInput): Promise<Reply> {
  const { config, systemPrompt, messages } = input
  try {
    const model =
      config.provider === 'anthropic'
        ? createAnthropic({ apiKey: config.apiKey })(config.model)
        : createOpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL,
          })(config.model)

    const result = await generateObject({
      model,
      system: systemPrompt,
      messages,
      schema: ReplySchema,
    })
    return result.object as Reply
  } catch (err) {
    throw classify(err)
  }
}
```

- [ ] **Step 2: 类型 / 构建冒烟**

Run:
```bash
cd apps/design && npx tsc -b --noEmit
```
Expected: no errors.

- [ ] **Step 3: 手动 smoke（不进 CI）**

- 打开 dev server：`cd apps/design && npm run dev`
- 打开浏览器 devtools → Console
- 粘贴：

```js
const { runAssetSearchTurn } = await import('/framework/src/lib/ai/client.ts')
const { readAiConfig } = await import('/framework/src/lib/ai/config.ts')
const config = readAiConfig()
if (!config) throw new Error('先去 /settings 配置 AI')
const reply = await runAssetSearchTurn({
  config,
  systemPrompt: 'You reply with JSON only. Set is_relevant=true, reply="pong", filter_delta={add:[],remove:[]}.',
  messages: [{ role: 'user', content: 'ping' }],
})
console.log(reply)
```

Expected: 输出 `{is_relevant: true, reply: 'pong', filter_delta: {add: [], remove: []}}`。

（若失败：核对 SettingsPage 里 provider / baseURL / model 是否有效。）

- [ ] **Step 4: Commit**

```bash
git add apps/design/framework/src/lib/ai/client.ts
git commit -m "feat(design/ai): Vercel AI SDK client for asset search turn"
```

---

### Task 8: `useAssetSearchAgent` hook

**Files:**
- Create: `apps/design/framework/src/features/assets/useAssetSearchAgent.ts`
- Create: `apps/design/framework/src/features/assets/useAssetSearchAgent.test.ts`

**Interfaces:**
- Consumes: `AssetMeta`、`Filter`、`FilterDelta`、`mergeFilterDelta`、`applyFilter`、`ChatMessage`、`Reply`、`runAssetSearchTurn`、`buildSystemPrompt`
- Produces:
  - `type ChatEntry = { id: string; role: 'user' | 'assistant'; content: string; kind?: 'normal' | 'relevance-rejected' | 'error'; deltaSummary?: string }`
  - `type UseAssetSearchAgentOptions = { kind: AssetKind; index: AssetMeta[]; filter: Filter; onFilterChange: (next: Filter) => void; basePrompt: string; sendTurn?: (input: RunAssetSearchTurnInput) => Promise<Reply> }` — 第 5 项为 DI，测试用 mock
  - `type UseAssetSearchAgentApi = { entries: ChatEntry[]; sending: boolean; error: string | null; ask(text: string): Promise<void>; clear(): void }`
  - `useAssetSearchAgent(options): UseAssetSearchAgentApi`

- [ ] **Step 1: 写测试（mock client）**

Create `apps/design/framework/src/features/assets/useAssetSearchAgent.test.ts`:

```ts
// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AssetMeta } from '@/lib/ai/assetIndex'
import { emptyFilter, type Filter } from '@/lib/ai/filterState'
import type { Reply } from '@/lib/ai/schema'
import { useAssetSearchAgent } from './useAssetSearchAgent'

const INDEX: AssetMeta[] = [
  { id: 'neon', title: 'Neon', summary: 'glow dark', tags: ['spec'], origin: 'open-design', hasPreview: true },
  { id: 'apple', title: 'Apple', summary: 'photography', tags: ['spec'], origin: 'awesome-design-md', hasPreview: false },
]

function reply(partial: Partial<Reply>): Reply {
  return {
    is_relevant: true,
    reply: 'ok',
    filter_delta: { add: [], remove: [] },
    ...partial,
  }
}

function setup(overrides?: {
  sendTurn?: (typeof import('@/lib/ai/client'))['runAssetSearchTurn']
  filter?: Filter
}) {
  const onFilterChange = vi.fn()
  let currentFilter = overrides?.filter ?? emptyFilter()
  onFilterChange.mockImplementation((next: Filter) => {
    currentFilter = next
  })
  const hook = renderHook(({ filter }) =>
    useAssetSearchAgent({
      kind: 'designmd',
      index: INDEX,
      filter,
      onFilterChange,
      basePrompt: '# base',
      sendTurn: overrides?.sendTurn,
    }),
    { initialProps: { filter: currentFilter } },
  )
  return {
    hook,
    onFilterChange,
    currentFilter: () => currentFilter,
    rerender: () => hook.rerender({ filter: currentFilter }),
  }
}

describe('useAssetSearchAgent', () => {
  it('applies filter_delta on relevant reply', async () => {
    const sendTurn = vi.fn().mockResolvedValue(
      reply({
        reply: '建议 spec',
        filter_delta: { add: [{ kind: 'tag', label: 'spec', value: 'spec' }], remove: [] },
      }),
    )
    const { hook, onFilterChange } = setup({ sendTurn })
    await act(async () => {
      await hook.result.current.ask('给我风格建议')
    })
    expect(onFilterChange).toHaveBeenCalledTimes(1)
    const passed = onFilterChange.mock.calls[0]![0] as Filter
    expect(passed.chips.map((c) => c.id)).toEqual(['tag:spec'])
    expect(hook.result.current.entries).toHaveLength(2)
    expect(hook.result.current.entries[1]!.kind).toBe('normal')
  })

  it('does NOT apply filter_delta when is_relevant is false', async () => {
    const sendTurn = vi.fn().mockResolvedValue(
      reply({
        is_relevant: false,
        reply: '我只筛资产',
        filter_delta: { add: [{ kind: 'tag', label: 'spec', value: 'spec' }], remove: [] },
      }),
    )
    const { hook, onFilterChange } = setup({ sendTurn })
    await act(async () => {
      await hook.result.current.ask('今天天气如何')
    })
    expect(onFilterChange).not.toHaveBeenCalled()
    expect(hook.result.current.entries[1]!.kind).toBe('relevance-rejected')
  })

  it('records error entry on failure without wiping messages', async () => {
    const sendTurn = vi.fn().mockRejectedValue(new Error('401 Unauthorized: bad api key'))
    const { hook } = setup({ sendTurn })
    await act(async () => {
      await hook.result.current.ask('hi')
    })
    const entries = hook.result.current.entries
    expect(entries).toHaveLength(2)
    expect(entries[0]!.role).toBe('user')
    expect(entries[1]!.kind).toBe('error')
    expect(entries[1]!.content.toLowerCase()).toContain('unauthor')
  })

  it('clear() resets entries', async () => {
    const sendTurn = vi.fn().mockResolvedValue(reply({}))
    const { hook } = setup({ sendTurn })
    await act(async () => {
      await hook.result.current.ask('hi')
    })
    expect(hook.result.current.entries).toHaveLength(2)
    act(() => {
      hook.result.current.clear()
    })
    expect(hook.result.current.entries).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/design && npx vitest run framework/src/features/assets/useAssetSearchAgent.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: 实现 hook**

Create `apps/design/framework/src/features/assets/useAssetSearchAgent.ts`:

```ts
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
      if (!config) {
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
        const reply = await send({ config, systemPrompt, messages })
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/design && npx vitest run framework/src/features/assets/useAssetSearchAgent.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/design/framework/src/features/assets/useAssetSearchAgent.ts apps/design/framework/src/features/assets/useAssetSearchAgent.test.ts
git commit -m "feat(design/assets): useAssetSearchAgent hook with mockable client"
```

---

### Task 9: `AssetFilterChips` + AssetBrowserPage chip bar 集成

**Files:**
- Create: `apps/design/framework/src/features/assets/AssetFilterChips.tsx`
- Create: `apps/design/framework/src/features/assets/AssetFilterChips.test.tsx`
- Modify: `apps/design/framework/src/features/assets/AssetBrowserPage.tsx`
- Modify: `apps/design/framework/src/features/assets/assets.css`

**Interfaces:**
- Consumes: `Filter`, `FilterChip`, `applyFilter` from `@/lib/ai/filterState`; `AssetMeta`, `fetchAssetIndex` from `@/lib/ai/assetIndex`
- Produces:
  - `AssetFilterChips({ filter, onRemove(chipId), onReset }): JSX.Element`
  - AssetBrowserPage 内部持有 `filter` state（`emptyFilter()`），并向下暴露 setter 供 Task 10 的 drawer 使用；masonry 展示 `applyFilter(items, filter)`
  - `.assets-ai-slot*` CSS 从 `assets.css` 移除

- [ ] **Step 1: 写 chips 测试**

Create `apps/design/framework/src/features/assets/AssetFilterChips.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AssetFilterChips } from './AssetFilterChips'
import { chipId, type Filter } from '@/lib/ai/filterState'

const filter: Filter = {
  chips: [
    { id: chipId('tag', 'spec'), kind: 'tag', label: 'spec', value: 'spec', addedBy: 'ai' },
    { id: chipId('freeform', 'dark|neon'), kind: 'freeform', label: '冷色调', value: 'dark|neon', addedBy: 'user' },
  ],
}

describe('AssetFilterChips', () => {
  it('renders one chip per entry', () => {
    render(<AssetFilterChips filter={filter} onRemove={vi.fn()} onReset={vi.fn()} />)
    expect(screen.getByText('spec')).toBeTruthy()
    expect(screen.getByText('冷色调')).toBeTruthy()
  })

  it('fires onRemove with chip id', () => {
    const onRemove = vi.fn()
    render(<AssetFilterChips filter={filter} onRemove={onRemove} onReset={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/Remove spec/i))
    expect(onRemove).toHaveBeenCalledWith(chipId('tag', 'spec'))
  })

  it('fires onReset', () => {
    const onReset = vi.fn()
    render(<AssetFilterChips filter={filter} onRemove={vi.fn()} onReset={onReset} />)
    fireEvent.click(screen.getByRole('button', { name: /Reset all/i }))
    expect(onReset).toHaveBeenCalled()
  })

  it('renders nothing when filter empty', () => {
    const { container } = render(
      <AssetFilterChips filter={{ chips: [] }} onRemove={vi.fn()} onReset={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: 实现 AssetFilterChips**

Create `apps/design/framework/src/features/assets/AssetFilterChips.tsx`:

```tsx
import type { Filter } from '@/lib/ai/filterState'

type Props = {
  filter: Filter
  onRemove: (chipId: string) => void
  onReset: () => void
}

export function AssetFilterChips({ filter, onRemove, onReset }: Props) {
  if (filter.chips.length === 0) return null
  return (
    <div className="assets-chips" role="list" aria-label="Active filters">
      {filter.chips.map((chip) => (
        <span
          key={chip.id}
          role="listitem"
          className={`assets-chip assets-chip--${chip.kind} assets-chip--by-${chip.addedBy}`}
          title={chip.value}
        >
          <span className="assets-chip__label">{chip.label}</span>
          <button
            type="button"
            className="assets-chip__remove"
            aria-label={`Remove ${chip.label}`}
            onClick={() => onRemove(chip.id)}
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        className="assets-chips__reset"
        onClick={onReset}
      >
        Reset all
      </button>
    </div>
  )
}
```

- [ ] **Step 3: 追加 CSS，移除 ai slot**

Modify `apps/design/framework/src/features/assets/assets.css`:

删除第 46-85 行的 `.assets-ai-slot`、`.assets-ai-slot__field`、`.assets-ai-slot__prompt`、`.assets-ai-slot__hint`、`.assets-ai-slot__btn` 五个规则，以及第 132-139 行 `@media (max-width: 720px)` 内的 `.assets-ai-slot` 及其 `__btn` 两条规则。

在文件末尾追加：

```css
.assets-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(var(--space) * 0.75);
}

.assets-chip {
  display: inline-flex;
  align-items: center;
  gap: calc(var(--space) * 0.5);
  padding: 4px 4px 4px 10px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 45%, var(--color-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.assets-chip--by-ai {
  border-color: color-mix(in srgb, var(--color-primary) 60%, transparent);
}

.assets-chip__label {
  max-width: 22ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assets-chip__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.assets-chip__remove:hover {
  background: color-mix(in srgb, var(--color-danger) 24%, transparent);
  color: var(--color-danger);
}

.assets-chips__reset {
  padding: 4px 10px;
  border: 1px dashed var(--color-border);
  border-radius: 999px;
  background: transparent;
  color: var(--color-muted);
  font-size: 12px;
  cursor: pointer;
}

.assets-chips__reset:hover {
  color: var(--color-text);
  border-color: var(--color-text);
}
```

- [ ] **Step 4: 修改 AssetBrowserPage — 添加 filter state，接 chip bar，移除 ai slot**

Modify `apps/design/framework/src/features/assets/AssetBrowserPage.tsx`:

在 imports 之后追加：
```tsx
import { emptyFilter, applyFilter, type Filter } from '@/lib/ai/filterState'
import { AssetFilterChips } from './AssetFilterChips'
```

在 `AssetBrowserPage` 组件的 state 声明区（`const [pickerFor, setPickerFor] = ...` 附近）追加：
```tsx
  const [filter, setFilter] = useState<Filter>(emptyFilter())
```

在 `return (` 前，把 masonry 的数据源改为过滤后的列表 — 找到 `{items !== null && items.length > 0 ? (` 块，将 `items.map(...)` 改为使用 `visibleItems`（同处上方计算）：

在 return 前追加计算：
```tsx
  const visibleItems = items ? applyFilter(items, filter) : null
```

替换 `<div className="assets-page__header"> ... </div>` 之后紧跟的 `<div className="assets-ai-slot"> ... </div>` 整段（原第 350-358 行）为：
```tsx
      <AssetFilterChips
        filter={filter}
        onRemove={(id) =>
          setFilter((prev) => ({ chips: prev.chips.filter((c) => c.id !== id) }))
        }
        onReset={() => setFilter(emptyFilter())}
      />
```

将 count 显示改为过滤后 / 总数（原第 345-347 行 `<p className="assets-page__count">`）：
```tsx
        <p className="assets-page__count">
          {items === null
            ? '…'
            : filter.chips.length > 0
              ? `${visibleItems?.length ?? 0} / ${items.length} packages`
              : `${items.length} packages`}
        </p>
```

将 masonry 渲染的 `items.map(...)` 改为 `visibleItems!.map(...)`（外层判空条件同步改为 `visibleItems && visibleItems.length > 0`）：
```tsx
      {items !== null && items.length > 0 && visibleItems && visibleItems.length > 0 ? (
        <div className="assets-masonry" role="list" aria-labelledby={titleId}>
          {visibleItems.map((entry) => {
            // ... unchanged
          })}
        </div>
      ) : null}
```

在 empty branch 上方追加过滤后为空的分支：
```tsx
      {items !== null && items.length > 0 && visibleItems && visibleItems.length === 0 ? (
        <p className="assets-empty">No packages match the current filters.</p>
      ) : null}
```

- [ ] **Step 5: 运行测试**

Run: `cd apps/design && npx vitest run framework/src/features/assets/AssetFilterChips.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: 类型冒烟 + dev 视觉冒烟**

Run: `cd apps/design && npx tsc -b --noEmit`
Expected: no errors.

Run: `cd apps/design && npm run dev`

浏览器打开 `/assets/rule`。验证：
- 顶部原 "Ask about assets…" 输入框消失
- 空 filter 状态下，masonry 显示全部 224 项
- 打开 devtools console，手动注入一个 chip 试试：
  ```js
  // 无法直接注入 hook state，暂时跳过；此步只验证渲染无回归
  ```
- 视觉：header / count / masonry 无错位

停止 dev server。

- [ ] **Step 7: Commit**

```bash
git add apps/design/framework/src/features/assets/AssetFilterChips.tsx apps/design/framework/src/features/assets/AssetFilterChips.test.tsx apps/design/framework/src/features/assets/AssetBrowserPage.tsx apps/design/framework/src/features/assets/assets.css
git commit -m "feat(design/assets): filter chips replace inline AI slot"
```

---

### Task 10: `AiFilterDrawer` + AssetBrowserPage 接线

**Files:**
- Create: `apps/design/framework/src/features/assets/AiFilterDrawer.tsx`
- Create: `apps/design/framework/src/features/assets/AiFilterDrawer.test.tsx`
- Modify: `apps/design/framework/src/features/assets/AssetBrowserPage.tsx`
- Modify: `apps/design/framework/src/features/assets/assets.css`

**Interfaces:**
- Consumes: `AssetMeta`, `Filter`, `useAssetSearchAgent`, `readAiConfig`, `fetchAssetIndex`
- Produces:
  - `AiFilterDrawer({ open, kind, index, filter, onFilterChange, basePrompt, matchCount, totalCount, onClose }): JSX.Element | null`
  - AssetBrowserPage 加 "AI 筛选" 按钮 + drawer 状态 + 加载 basePrompt + 加载 index

- [ ] **Step 1: 写 drawer 测试**

Create `apps/design/framework/src/features/assets/AiFilterDrawer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AiFilterDrawer } from './AiFilterDrawer'
import { clearAiConfig, writeAiConfig } from '@/lib/ai/config'
import { emptyFilter } from '@/lib/ai/filterState'
import type { Reply } from '@/lib/ai/schema'

function wrap(ui: React.ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>
}

afterEach(() => {
  clearAiConfig()
})

describe('AiFilterDrawer', () => {
  it('shows config guidance when no AI configured', () => {
    render(
      wrap(
        <AiFilterDrawer
          open
          kind="designmd"
          index={[]}
          filter={emptyFilter()}
          onFilterChange={vi.fn()}
          basePrompt="# base"
          matchCount={0}
          totalCount={0}
          onClose={vi.fn()}
        />,
      ),
    )
    expect(screen.getByText(/Configure your AI provider/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Open Settings/i })).toBeTruthy()
  })

  it('closes on ESC', () => {
    writeAiConfig({ provider: 'anthropic', apiKey: 'sk', model: 'claude-sonnet-4-6' })
    const onClose = vi.fn()
    render(
      wrap(
        <AiFilterDrawer
          open
          kind="designmd"
          index={[]}
          filter={emptyFilter()}
          onFilterChange={vi.fn()}
          basePrompt="# base"
          matchCount={0}
          totalCount={0}
          onClose={onClose}
        />,
      ),
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('sends a message via injected sendTurn', async () => {
    writeAiConfig({ provider: 'anthropic', apiKey: 'sk', model: 'claude-sonnet-4-6' })
    const sendTurn = vi.fn().mockResolvedValue<Reply>({
      is_relevant: true,
      reply: 'hello',
      filter_delta: { add: [], remove: [] },
    })
    const onFilterChange = vi.fn()
    render(
      wrap(
        <AiFilterDrawer
          open
          kind="designmd"
          index={[]}
          filter={emptyFilter()}
          onFilterChange={onFilterChange}
          basePrompt="# base"
          matchCount={0}
          totalCount={0}
          onClose={vi.fn()}
          sendTurn={sendTurn}
        />,
      ),
    )
    const input = screen.getByPlaceholderText(/tell me/i) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))
    // wait for microtasks
    await new Promise((r) => setTimeout(r, 0))
    expect(sendTurn).toHaveBeenCalled()
    expect(await screen.findByText('hello')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 实现 AiFilterDrawer**

Create `apps/design/framework/src/features/assets/AiFilterDrawer.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AssetMeta } from '@/lib/ai/assetIndex'
import type { RunAssetSearchTurnInput } from '@/lib/ai/client'
import { hasValidConfig } from '@/lib/ai/config'
import { chipId, type Filter } from '@/lib/ai/filterState'
import type { Reply } from '@/lib/ai/schema'
import type { AssetKind } from '@/lib/types'
import { useAssetSearchAgent } from './useAssetSearchAgent'

type Props = {
  open: boolean
  kind: AssetKind
  index: AssetMeta[]
  filter: Filter
  onFilterChange: (next: Filter) => void
  basePrompt: string
  matchCount: number
  totalCount: number
  onClose: () => void
  sendTurn?: (input: RunAssetSearchTurnInput) => Promise<Reply>
}

export function AiFilterDrawer({
  open,
  kind,
  index,
  filter,
  onFilterChange,
  basePrompt,
  matchCount,
  totalCount,
  onClose,
  sendTurn,
}: Props) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const configured = hasValidConfig()

  const { entries, sending, ask, clear } = useAssetSearchAgent({
    kind,
    index,
    filter,
    onFilterChange,
    basePrompt,
    sendTurn,
  })

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [entries.length, sending])

  if (!open) return null

  function onSend() {
    const text = input.trim()
    if (!text) return
    setInput('')
    void ask(text)
  }

  return (
    <div className="ai-drawer" role="dialog" aria-modal="true" aria-label="AI filter">
      <div className="ai-drawer__scrim" onClick={onClose} />
      <aside className="ai-drawer__panel">
        <header className="ai-drawer__header">
          <span className="ai-drawer__title">AI 筛选</span>
          <button
            type="button"
            className="ai-drawer__close"
            onClick={onClose}
            aria-label="Close AI filter"
          >
            ×
          </button>
        </header>

        <div className="ai-drawer__status">
          {filter.chips.length > 0
            ? `${matchCount} / ${totalCount} 匹配`
            : `${totalCount} packages`}
          {entries.length > 0 ? (
            <button
              type="button"
              className="ai-drawer__reset"
              onClick={clear}
            >
              Clear chat
            </button>
          ) : null}
        </div>

        <div className="ai-drawer__scroll" ref={scrollRef}>
          {!configured ? (
            <div className="ai-drawer__guidance">
              <p>Configure your AI provider first.</p>
              <Link to="/settings" className="assets-btn assets-btn--ghost">
                Open Settings
              </Link>
            </div>
          ) : entries.length === 0 ? (
            <p className="ai-drawer__hint">
              Describe the style / layout you want. Example: "想做金融数据看板，冷色调，深色主题"。
            </p>
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                className={`ai-drawer__msg ai-drawer__msg--${e.role} ai-drawer__msg--${e.kind ?? 'normal'}`}
              >
                <div className="ai-drawer__msg-body">{e.content}</div>
                {e.deltaSummary ? (
                  <div className="ai-drawer__msg-delta">{e.deltaSummary}</div>
                ) : null}
              </div>
            ))
          )}
          {sending ? <p className="ai-drawer__hint">Thinking…</p> : null}
        </div>

        <footer className="ai-drawer__footer">
          <textarea
            className="ai-drawer__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                onSend()
              }
            }}
            placeholder="Tell me what you're looking for…"
            disabled={!configured || sending}
            rows={2}
          />
          <button
            type="button"
            className="assets-btn"
            onClick={onSend}
            disabled={!configured || sending || input.trim().length === 0}
          >
            Send
          </button>
        </footer>
      </aside>
    </div>
  )
}

// re-export for callers to build chip ids consistently
export { chipId }
```

- [ ] **Step 3: 追加 drawer CSS**

Append to `apps/design/framework/src/features/assets/assets.css`:

```css
.ai-drawer {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: flex-end;
}

.ai-drawer__scrim {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, #000 55%, transparent);
  backdrop-filter: blur(4px);
}

.ai-drawer__panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(420px, 100%);
  height: 100%;
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
  box-shadow: -12px 0 40px color-mix(in srgb, #000 35%, transparent);
}

.ai-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--space) * 1.5) calc(var(--space) * 2);
  border-bottom: 1px solid var(--color-border);
}

.ai-drawer__title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.ai-drawer__close {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-muted);
  font-size: 18px;
  cursor: pointer;
}

.ai-drawer__close:hover {
  color: var(--color-text);
  background: var(--color-surface-2);
}

.ai-drawer__status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--space) * 1) calc(var(--space) * 2);
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-muted);
}

.ai-drawer__reset {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-muted);
  padding: 3px 8px;
  font-size: 12px;
  cursor: pointer;
}

.ai-drawer__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: calc(var(--space) * 1.5) calc(var(--space) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 1.25);
}

.ai-drawer__guidance {
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 1.25);
  color: var(--color-muted);
}

.ai-drawer__hint {
  color: var(--color-muted);
  font-size: 13px;
  margin: 0;
}

.ai-drawer__msg {
  border: 1px solid var(--color-border);
  border-radius: calc(var(--radius) * 1.25);
  padding: calc(var(--space) * 1) calc(var(--space) * 1.25);
  background: var(--color-surface-2);
  font-size: 14px;
  line-height: 1.5;
}

.ai-drawer__msg--user {
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-2));
  border-color: color-mix(in srgb, var(--color-primary) 30%, var(--color-border));
}

.ai-drawer__msg--relevance-rejected {
  opacity: 0.65;
}

.ai-drawer__msg--error {
  border-color: color-mix(in srgb, var(--color-danger) 45%, transparent);
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
  color: var(--color-danger);
}

.ai-drawer__msg-delta {
  margin-top: calc(var(--space) * 0.5);
  font-size: 12px;
  color: var(--color-muted);
}

.ai-drawer__footer {
  display: flex;
  gap: calc(var(--space) * 1);
  padding: calc(var(--space) * 1.25) calc(var(--space) * 2);
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}

.ai-drawer__input {
  flex: 1;
  min-height: 40px;
  resize: vertical;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface-2);
  color: var(--color-text);
  font: inherit;
}

.ai-drawer__input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
```

- [ ] **Step 4: 挂到 AssetBrowserPage**

Modify `apps/design/framework/src/features/assets/AssetBrowserPage.tsx`:

在 import 追加：
```tsx
import { fetchAssetIndex, type AssetMeta } from '@/lib/ai/assetIndex'
import { AiFilterDrawer } from './AiFilterDrawer'
```

在 state 声明区（filter 附近）追加：
```tsx
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [assetIndex, setAssetIndex] = useState<AssetMeta[]>([])
  const [basePrompt, setBasePrompt] = useState<string>('')
```

在 items 加载 effect 之后新增两个 effect：
```tsx
  useEffect(() => {
    let cancelled = false
    fetchAssetIndex(kind)
      .then((data) => {
        if (!cancelled) setAssetIndex(data)
      })
      .catch(() => {
        if (!cancelled) setAssetIndex([])
      })
    return () => {
      cancelled = true
    }
  }, [kind])

  useEffect(() => {
    let cancelled = false
    fetch('/prompts/asset-search.md')
      .then((res) => (res.ok ? res.text() : ''))
      .then((text) => {
        if (!cancelled) setBasePrompt(text)
      })
      .catch(() => {
        if (!cancelled) setBasePrompt('')
      })
    return () => {
      cancelled = true
    }
  }, [])
```

在 header 的右侧（`<p className="assets-page__count">` 上方或同级容器内）加上按钮 —— 具体：把 count 段包一层 flex 容器并追加 AI 按钮：

原：
```tsx
        <p className="assets-page__count">
          {items === null
            ? '…'
            : filter.chips.length > 0
              ? `${visibleItems?.length ?? 0} / ${items.length} packages`
              : `${items.length} packages`}
        </p>
```

替换为：
```tsx
        <div className="assets-page__header-actions">
          <p className="assets-page__count">
            {items === null
              ? '…'
              : filter.chips.length > 0
                ? `${visibleItems?.length ?? 0} / ${items.length} packages`
                : `${items.length} packages`}
          </p>
          <button
            type="button"
            className="assets-btn"
            onClick={() => setDrawerOpen(true)}
          >
            AI 筛选
          </button>
        </div>
```

在 return 的最后（`)` 前，与 lightbox / picker 同级）追加 drawer：
```tsx
      <AiFilterDrawer
        open={drawerOpen}
        kind={kind}
        index={assetIndex}
        filter={filter}
        onFilterChange={setFilter}
        basePrompt={basePrompt}
        matchCount={visibleItems?.length ?? 0}
        totalCount={items?.length ?? 0}
        onClose={() => setDrawerOpen(false)}
      />
```

同时在 `assets.css` 末尾追加：
```css
.assets-page__header-actions {
  display: flex;
  align-items: center;
  gap: calc(var(--space) * 1.5);
}
```

- [ ] **Step 5: 运行测试**

Run: `cd apps/design && npx vitest run framework/src/features/assets/AiFilterDrawer.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: 类型冒烟**

Run: `cd apps/design && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/design/framework/src/features/assets/AiFilterDrawer.tsx apps/design/framework/src/features/assets/AiFilterDrawer.test.tsx apps/design/framework/src/features/assets/AssetBrowserPage.tsx apps/design/framework/src/features/assets/assets.css
git commit -m "feat(design/assets): AiFilterDrawer with multi-turn narrowing"
```

---

### Task 11: 落地 System Prompt + IDE Skill + 手动 smoke checklist

**Files:**
- Create: `apps/design/framework/public/prompts/asset-search.md`
- Create: `.claude/skills/asset-search/SKILL.md`

**Interfaces:**
- Consumes: —
- Produces: App 侧 fetch 得到 base prompt；IDE 侧 Claude Code 可用 skill

- [ ] **Step 1: 写 App 侧 prompt**

Create `apps/design/framework/public/prompts/asset-search.md`:

```markdown
# Asset Search Assistant

You help a designer narrow down from a list of design system / layout packages by asking questions and proposing filter chips.

## Scope guard (STRICT)

The ONLY task is: narrow the asset list by dialogue. If the user asks about anything else (code, weather, general chat, personal questions, unrelated tools), you MUST:
- return `is_relevant: false`
- put a short refusal in `reply` (e.g. "我只负责帮你在设计包里筛选风格 / 布局，别的问题帮不上。")
- keep `filter_delta.add` and `filter_delta.remove` both empty

## Filter chip rules

- Prefer `tag` chips when the tag literally exists in the candidate list (e.g. `spec`, `layout`).
- Use `origin` chips when the user hints at the source (e.g. `open-design`, `awesome-design-md`, `manual`).
- Use `freeform` chips for everything else. The `value` MUST be a pipe-separated list of lowercase English keywords likely to appear inside title / summary / tags. Example: label `冷色调`, value `cool|dark|blue|neon|cyber`.
- Never add a chip whose value cannot plausibly match ANY item in the current candidate list.
- When removing, output the chip `id` copied verbatim from the "Current chips" list; you can only remove chips already present.
- Prefer adding at most 2 new chips per turn.

## Dialogue rules

- Ask ONE question per turn (multiple choice preferred if useful).
- Stop asking when candidates <= 8 OR the user says they're done.
- Keep `reply` under 3 short sentences plus optional bullet list.
- Always answer in the user's language (default Chinese).
- Never invent asset ids or claim capabilities beyond filtering.

The runtime injects `## Kind`, `## Current chips`, and `## Candidates` sections below at each turn.
```

- [ ] **Step 2: 写 IDE 侧 skill**

Create `.claude/skills/asset-search/SKILL.md`:

```markdown
# Asset Search (IDE)

Skill for locating a design-rule or layout asset id under `apps/design/framework/public/assets/{designmd,layoutmd}/INDEX.md` through a short dialogue with the developer.

## When to use

- Developer asks "help me pick a style / layout for this app" from inside the IDE
- Developer wants to remember what tags / origins exist without opening the browser

## Steps

1. Ask which kind: `designmd` (style) or `layoutmd`.
2. Read the matching `INDEX.md` from disk (path shown above). Extract `dir / title / summary / tags / origin / preview` per row.
3. Ask ONE targeted narrowing question at a time (mood / domain / colors / density). Stop when candidates <= 8.
4. Return the final list as `id — title (origin)`, and offer to copy the id to the app’s `app.json` (edit or point out the file).

## Output contract

- Never invent an id. Only surface ids present in `INDEX.md`.
- If the request is unrelated to asset selection, decline and suggest the correct tool / doc instead.

## Notes

- This IDE skill is intentionally independent from the browser prompt at `apps/design/framework/public/prompts/asset-search.md`. Update both if the taxonomy changes.
```

- [ ] **Step 3: 全量测试**

Run: `cd apps/design && npm run test`
Expected: all tests PASS.

- [ ] **Step 4: 手动 smoke checklist**

Run: `cd apps/design && npm run dev`

在 `http://localhost:5173` 依次验证：

1. `/settings` → 保存 provider / model / key
2. `/assets/rule` → 点 "AI 筛选" → 输入 "想做金融数据看板，冷色调深色主题" → 验证：至少 2 个 chip 出现、右侧计数 `N / 224` 收窄
3. 继续输入 "去掉冷色调" → 对应 chip 被 remove（右侧计数扩大）
4. 输入 "今天天气怎么样" → 灰色 muted 消息，chip 不变
5. `/assets/layout` → drawer 复用；prompt 里 `Kind: layoutmd` 生效（可在 devtools Network 里查 payload）
6. `/settings` 切 `openai` + LiteLLM baseURL → 保存 → 回到 `/assets/rule` 打开 drawer → 发一次消息 → 通

停止 dev server。

- [ ] **Step 5: Commit**

```bash
git add apps/design/framework/public/prompts/asset-search.md .claude/skills/asset-search/SKILL.md
git commit -m "docs(asset-search): App system prompt + IDE skill"
```

---

## Self-Review

**Spec coverage:**
- `AssetBrowserPage` 顶部旧输入框移除 → Task 9
- chip 过滤条 → Task 9
- AI 抽屉 → Task 10
- SettingsPage `/settings` + sidebar → Task 6
- 组件清单里的所有文件 → Tasks 2-11
- INDEX.md 解析 + 压缩 → Task 4
- 客户端 AND 匹配 + freeform pipe OR → Task 3
- ReplySchema + is_relevant guard → Tasks 5, 8
- 错误处理（未配置 / 401 / 网络 / schema） → Tasks 7-8, 10
- Prompt 落地 + IDE Skill 独立 → Task 11
- 手动 smoke checklist → Task 11
- Dashboard style tokens → 每个 CSS Task 都用 `--color-*` tokens

**Placeholder scan:** 已通读，无 TBD / TODO / "similar to Task N" / "add appropriate handling"。

**Type consistency:**
- `FilterChip` / `Filter` / `FilterDelta` 在 Task 3 定义，Tasks 5 / 8 / 9 / 10 使用签名一致
- `AssetMeta` 在 Task 4 定义，Tasks 5 / 8 / 10 一致引用
- `Reply` / `ReplySchema` 在 Task 5 定义，Tasks 7 / 8 一致引用
- `ChatMessage` / `RunAssetSearchTurnInput` 在 Task 7 定义，Task 8 引用
- `AiConfig` 在 Task 2 定义，Tasks 6 / 7 引用
- `runAssetSearchTurn` 签名固定：`(RunAssetSearchTurnInput) => Promise<Reply>`
- 组件 props：`AssetFilterChips` / `AiFilterDrawer` 的 props 定义与调用方 (Task 9 / 10) 精确匹配

---

## Execution Handoff

Plan complete and saved to `docs/dev/superpowers/plans/2026-07-22-asset-ai-search.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每个 Task 派一个 fresh subagent，我在 Task 之间做 review，快速迭代

**2. Inline Execution** — 在本会话里跑 executing-plans，批处理 + checkpoint

Which approach?
