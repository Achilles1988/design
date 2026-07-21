# Design Project Contract Protocol + `wn-design-prd` Hardening

Date: 2026-07-21  
Status: Approved for implementation planning

## Goal

把 style/layout 契约的所有权收进**设计工程**自身：用 `design.project.json` 发现任意安装路径下的 `<designRoot>`；共享 `styles/<styleId>` / `layouts/<layoutId>`；`app.json` 只配 id。同步硬化 `wn-design-prd`（路径发现、推荐选配、默认 worktree），**废除 `wn-design-spec` 与整棵 `docs/design/`**，并改掉 memory / API / 旧 spec 中的双真相口径。

## Context

- `wn-design-prd` 与 memory 仍写死 `apps/design`、`docs/design/<app>/…`，并引导不存在的 `wn-design-spec`。
- 设计工程将安装到目标仓，根路径不固定；安装脚本尚未实现，但协议必须先可被 skill / 未来脚本共用。
- 契约正文目前在 `docs/design/design/`（`rules/` + `layouts/`）；壳 CSS 已部分体现 token，但 **markdown 契约仍需迁入设计工程** 供 skill / design-review 读取，然后删除整个 `docs/design/`。
- 已有默认 App：`apps/design/apps/design/app.json`（`style: dashboard`，`layout: sidebar-shell`）——与「默认 App 就是工程自己、规则机制统一」一致。
- 用户选定落地切法：**方案 2**（本轮一次做完迁目录 + 协议 + skill + 清引用）。

## Decisions

| Topic | Decision |
|-------|----------|
| 范围切法 | 方案 2：协议 + marker + 迁契约 + 删 `docs/design` + 改 skill + 清引用；安装脚本仍 out of scope |
| 设计工程发现 | 仓库内搜索 `design.project.json`；0 → 硬停；多 → 问用户 |
| 契约位置 | 共享库 A：`<stylesRoot>/<styleId>/`、`<layoutsRoot>/<layoutId>/`；`app.json` 只存 id |
| 默认 App | 设计工程自带 App（本仓 id=`design`），与其它 App 同一套 id 选配 |
| `wn-design-spec` | **废除**：不实现、不引导；删相关引用与「由 spec 安装 docs/design」类文档口径 |
| `docs/design/` | **整目录删除**（迁完契约后） |
| style 缺失 | 必需；从库存推荐 → 用户确认 → 自动写 `app.json.style`；库空硬停；**不新建**契约文件 |
| layout | 优先适用、可缺（AI 自由发挥）；更好适配可推荐 → 确认后写 `app.json.layout` |
| 推荐范围 | 仅库存 id（后续可放宽；本期写死 A） |
| Worktree | detected 下调用 `using-git-worktrees` 时**声明始终隔离**，不再询问 |
| 路径硬编码 | skill / review / 交接 prompt 禁止写死 `apps/design`；一律相对 `<designRoot>` |

## Architecture

### `design.project.json`（标记 + 配置面）

位于 `<designRoot>/design.project.json`。本仓路径：`apps/design/design.project.json`。

| Field | Type | Meaning | Initial value (this repo) |
|-------|------|---------|---------------------------|
| `schemaVersion` | number | 协议版本 | `1` |
| `contentRoot` | string | App 内容区（相对根） | `apps` |
| `stylesRoot` | string | 共享 style 根 | `styles` |
| `layoutsRoot` | string | 共享 layout 根 | `layouts` |
| `defaultAppId` | string | 默认 App id | `design` |

公共 API 说明落在 `docs/dev/api/`（与实现同变更）：描述字段语义、发现算法、解析公式。

### 目录（迁完后）

```text
<designRoot>/                      # e.g. apps/design
  design.project.json
  package.json
  framework/                       # syncable (unchanged intent)
  styles/
    <styleId>/                     # e.g. dashboard
      design.md                    # required contract file
      …                            # e.g. components.html
  layouts/
    <layoutId>/                    # e.g. sidebar-shell, split-screen
      LAYOUT.md                    # required if layout id is used
      preview.html?                # migrate if present
  apps/
    <appId>/                       # includes default app `design`
      app.json                     # style / layout are ids only
      canvases.json
      canvases/
```

### 解析公式

给定 App 配置 `app.json`：

- Style 契约路径：`<designRoot>/<stylesRoot>/<style>/design.md` — **必须存在**才视为有效 style。
- Layout 契约路径：`<designRoot>/<layoutsRoot>/<layout>/LAYOUT.md` — 存在则优先套用；可缺。
- App 目录：`<designRoot>/<contentRoot>/<appId>/`。
- Dev：在 `<designRoot>` 执行 `npm run dev`；预览 URL 仍为该工程路由约定（如 `/apps/<appId>/canvases/<canvasId>`）。

**禁止**再解析 `docs/design/**`。

### 本仓迁移映射

| From | To |
|------|----|
| `docs/design/design/rules/*` | `apps/design/styles/dashboard/`（对齐现有 `app.json.style`） |
| `docs/design/design/layouts/*` | `apps/design/layouts/` |
| `docs/design/`（整树） | **删除** |

默认 App `apps/design/apps/design/app.json` 的 id 保持与迁后共享库一致（`dashboard` / `sidebar-shell`）。

### `wn-design-prd` 行为（相对现行 skill 的差分）

1. **Step 发现（先于拷问）**：搜 `design.project.json` → 锁定 `<designRoot>` 与 roots。
2. **拷问 / 选配**：
   - 读目标 `app.json` 的 style/layout id，按公式解析。
   - style 无效：列出 `styles/*` 库存 → 推荐 → 确认 → 写回 `app.json.style`；库空 → 硬停。
   - layout：可缺 → 「AI 自由发挥」；若有更合适库存 layout → 推荐 → 确认 → 写回 `app.json.layout`。
   - 推荐**只**来自已存在目录 id；不创建 style/layout 契约文件（不复活半个 `wn-design-spec`）。
3. **Worktree**：若锚点 `using-git-worktrees` 存在，调用时带入已声明偏好「始终隔离」，**不征求同意**；缺失则降级当前树并提示。
4. **实现 / review / 交接**：一切路径相对 `<designRoot>`；design-review 读共享库契约；去掉全部 `wn-design-spec` / `docs/design` 文案。
5. 编排者模型、两条 runner、非 UI 需求守恒、框架无关、design review 保序等**既有决策保持不变**（见 `2026-07-21-wn-design-prd-design.md`）；本 spec 覆盖其过时的契约路径与前置 skill 口径。

### 文档与记忆清理面

必须同轮更新或删除冲突口径：

- `.wn-ai/skills/wn-design-prd/**`
- `.wn-ai/memories/memory.md`（及由它扇出的 AGENTS/CLAUDE 等 Design Spec 段）
- `apps/design/README.md`
- `docs/dev/api/design-fs.md`（及新建的 design-project 协议 API 页）
- `docs/dev/superpowers/specs/2026-07-21-wn-design-prd-design.md`、`2026-07-20-design-engineering-framework-design.md`：修订过时段落或加「被本协议取代」指针，避免双真相
- `docs/dev/superpowers/plans/*` 中引用 `docs/design` / `wn-design-spec` 的过时句：同期改正或标注 superseded
- 删除整个 `docs/design/`

仓库内若无 `wn-design-spec` skill 实体，只需清引用；不新建该 skill。

## Error handling

| Condition | Behavior |
|-----------|----------|
| 0 个 `design.project.json` | 硬停，说明需在设计工程根放置 marker |
| 多个 marker | 询问用户选择 |
| style 库空或确认后仍无 `design.md` | 硬停，不写 Canvas |
| layout 自由发挥 | design review 仅对照 style + 通用版式健全性 |
| 预览不可达 / 新 Canvas 未重启 | design review 报错，不静默跳过 |
| 路径逃逸出 `<designRoot>` | 与现有 design-fs 安全规则一致：拒绝 |

## Testing / verification

1. 迁后：`apps/design/styles/dashboard/design.md` 与 `layouts/*/LAYOUT.md` 存在；`docs/design/` 不存在。
2. `design.project.json` 可被从仓库根发现；字段与上表一致。
3. 默认 App `app.json` id 能解析到迁后契约。
4. `rg 'wn-design-spec|docs/design'` 在约定清理面内无残留（历史 plan 若保留须已改写或明确 superseded）。
5. `wn-design-prd` / `design-review` 文案：无写死 `apps/design` 作为唯一根；含发现步骤、推荐选配、默认 worktree、无 spec 引导。
6. memory Design Spec 段描述协议发现 + id 解析，不再贴 `docs/design` 树。

## Success criteria

1. 任意合理安装路径下，skill 只通过 marker 找到设计工程并解析契约。
2. 所有 App（含默认 App）统一：`app.json` id → 共享库契约。
3. `wn-design-spec` 与 `docs/design/` 不再作为权威或引导入口。
4. detected 路径下 worktree 默认隔离且不询问。
5. 公共配置面在 `docs/dev/api/` 可核对；与磁盘布局一致。

## Out of scope

- 设计工程安装 / 同步脚本（日后读同一 `design.project.json`）。
- 推荐时自动**新建** style/layout 契约草稿（明确后续可放宽）。
- 修改 Canvas 数据模型（per-canvas layout 字段等）。
- 重做壳视觉或 token 值（只迁契约文件与改引用，不改设计语言）。

## Spec self-review notes

- Placeholder scan: 无 TBD/TODO；推荐策略与删除面已写死。
- Consistency: 方案 2、共享库 A、发现 A、worktree A、缺契约 B+推荐、推荐仅库存 A，与对话决议一致；与旧 wn-design-prd spec 冲突处声明以本文件为准并要求同轮改写旧文。
- Scope: 单轮可执行（迁目录 + marker + skill + 文档清理）；安装脚本排除。
- Ambiguity: `rules/` → `styles/<styleId>/design.md` 文件名固定为 `design.md`；layout 固定 `LAYOUT.md`；style id 取自目录名且与 `app.json.style` 对齐（本仓 `dashboard`，不是旧路径里的 app 名 `design`）。
