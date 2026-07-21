# 实现计划：`wn-design-prd` skill

- Spec: `docs/dev/superpowers/specs/2026-07-21-wn-design-prd-design.md`
- 日期: 2026-07-21
- 产物: 项目级 skill `.wn-ai/skills/wn-design-prd/`（`SKILL.md` + `README.md` + `agents/design-review.md`）
- 方法论: 遵循 `writing-skills` 的 **RED → GREEN → REFACTOR** 铁律（先有失败基线场景，再写 skill）。

> 面向零上下文的执行者：本计划给出精确文件路径、完整落地内容与可执行验证方式。skill 本体是给 AI 的**指令文档**，其"测试"是**子代理压力场景**（不是单元测试）。

---

## 背景与关键现实约束（执行前必读）

`wn-design-prd` 把一份 PRD/设计需求落成 `apps/design` 工程内**真实可预览的 Canvas 设计稿**，严格遵循目标 App 的 style/layout 契约；对外可选输出交接 prompt。设计定稿于上方 spec。落地时必须尊重以下**代码库现实**（来自对 `apps/design` 的探测）：

1. **预览 URL 形态**：`http://localhost:5173/apps/<appId>/canvases/<canvasId>`（Vite 默认端口 5173；`react-router-dom` 路由 `"/apps/:id/canvases/:canvasId"`）。
2. **Canvas 数据模型**：
   - App 目录：`apps/design/apps/<appId>/`，含 `app.json`、`canvases.json`、`canvases/*.tsx`。
   - `app.json` = `{ id, name, style, layout, path? }`，**style/layout 是 App 级单值**（如 `dashboard` / `sidebar-shell`）。
   - `canvases.json` = `{ "canvases": [{ id, name, component }] }`，`component` 是 `canvases/` 下的 `.tsx` 文件名。
   - **Canvas `.tsx` 本身不声明 style/layout**，仅 `export default` 一个 React 组件；预览靠 `canvases.json` + Vite glob 路径匹配识别。
3. **layout 是 App 级单值的后果**：spec 里"每个 Canvas 选一个 layout"只能落在**设计意图层面**——Canvas 组件按所选 `LAYOUT.md` 手工实现，design review 对照该契约审。**不因此修改数据模型**（不引入 per-canvas layout 字段），除非未来单独扩展。App 的默认 layout 记录在 `app.json.layout`。
4. **design-fs dev-only API**（`/__design_fs/*`，仅 `npm run dev` 生效）：
   - 新增 Canvas：`POST /apps/:id/canvases {id,name}` → 建条目 + 写**占位** `.tsx`；随后**直接编辑该 `.tsx`** 填入真实设计代码。
   - 修改 Canvas：**没有专用 API，直接编辑 `.tsx` 文件**。
   - 删除 Canvas：`DELETE /apps/:id/canvases/:canvasId`。
   - 客户端封装：`apps/design/framework/src/lib/api.ts`（`designApi`）。
5. **Vite glob 缓存**：新增 `.tsx` 文件后，`import.meta.glob` 收集是构建期静态的，**必须重启 dev server** 才能预览新 Canvas（否则预览 404，代码内有 `GLOB_MISS_HINT`）。→ 这是 design review 预览前置的**硬前提**。
6. **契约位置**：`docs/design/<app>/rules/design.md`（style）、`docs/design/<app>/layouts/<id>/LAYOUT.md`（layout）。当前磁盘上 `<app>` = `design`。
7. **技术栈现状**：React 19 + Vite 6 + `react-router-dom` 7；Canvas 为 `.tsx`。**框架无关铁律**：实现以既有 Canvas 的技术栈为准，skill 正文严禁硬编码框架写法。

### 探测锚点（Step 0 路由依据）

在 `.wn-ai/skills/` 下探测下列锚点 skill 是否存在：

| 本 skill 步骤 | 锚点子技能 | 缺失降级 |
|---|---|---|
| #4 分支 | `using-git-worktrees` | 跳过分支，在当前工作树做（记提示） |
| #6 code review | `requesting-code-review` | 跳过 CR（design review 仍照跑） |
| #8 收尾 | `finishing-a-development-branch` | 跳过收尾，提示手动 |
| #5 实现（可选增强） | `executing-plans` / `subagent-driven-development` | 无则本 skill 自兜底实现 |

任一分支/CR/收尾锚点存在 → **detected**；全无 → **plan**。不确定询问用户；用户可手动覆盖。

---

## 全局约束

- 所有产物为 Markdown，落在 `.wn-ai/skills/wn-design-prd/`。
- SKILL/agent/README 正文**用英文**（与既有 `design-review.md` 风格一致、便于跨环境复用）；本计划说明用中文。
- **不打包**任何外部工作流步骤，只按锚点探测/调用。
- skill 正文**不得出现框架特定代码片段**（不假设 React/Vue）。
- `design-review` 是本 skill 自带的唯一 agent。

---

## 文件结构（最终）

```
.wn-ai/skills/wn-design-prd/
├── SKILL.md                 # 编排指令（重写）
├── README.md                # 面向用户的简介（重写）
└── agents/
    └── design-review.md     # 视觉门禁 agent（小改：补 dev server 重启前提）
```

---

## Task 1 — RED：清空旧口径 + 建立失败基线场景

**目的**：回到"无编排指令"状态并记录基线失败，满足 writing-skills「先测后写」。

**步骤**：
1. 删除旧口径正文（保留目录与 agent）：
   - 清空/删除 `.wn-ai/skills/wn-design-prd/SKILL.md`（旧 `plain`/handoff 口径，废弃）。
   - 清空/删除 `.wn-ai/skills/wn-design-prd/README.md`（旧口径）。
   - **保留** `agents/design-review.md`（Task 4 再小改）。
2. 选取下方 §测试场景 中的 5 个"地基"场景（S2 编排保序、S4 部分安装降级、S9 预览前置、S13 需求守恒、S15 框架自适应），在**无 SKILL.md** 环境下派子代理跑一遍，记录其失败/跑偏行为作为基线（预期：无编排指令时 agent 会整包 handoff、或漏 design review、或硬套 React、或漏回吐非 UI 需求）。

**验证**：`SKILL.md`/`README.md` 不存在或为空；基线记录已写入本计划的执行笔记（或 PR 描述）。RED 成立。

---

## Task 2 — GREEN：写 `SKILL.md`

**文件**：`.wn-ai/skills/wn-design-prd/SKILL.md`
**动作**：新建，完整内容如下（一字不差落地）：

````markdown
---
name: wn-design-prd
description: Use when turning a PRD or design requirement into real design-page (Canvas) UI inside a design-engineering app — creating, modifying, or deleting an App's Canvases that must follow that App's installed style and layout contracts.
---

# wn-design-prd

Turn a PRD / design requirement into **real, previewable Canvas design drafts** inside the `apps/design` engineering app, strictly following the target App's installed **style** and **layout** contracts. This skill is the "product + design first pass": it produces a design prototype, and always hands back any non-UI requirements it did not implement.

## Iron rules (non-negotiable)

1. **Orchestrator model.** This skill is ALWAYS the driver. When a dev workflow is installed, call its skills as sub-skills step by step — never hand the whole task off and never rely on a callback.
2. **Framework-agnostic.** You are given instructions, and YOU write the code. Implement by reading the target App's contracts + its EXISTING Canvas files and matching their tech stack. NEVER assume a framework. This file contains no framework-specific code on purpose.
3. **Requirement conservation.** A PRD often mixes UI and non-UI requirements. Implement only the UI part; separate the non-UI part and ALWAYS return it to the user (Step 9), even if nothing else consumes it.
4. **Design review is a mandatory gate** on BOTH runners (Step 7), judged from screenshots of the running preview.

## Vocabulary

- **App**: a design package under `apps/design/apps/<appId>/` (`app.json`, `canvases.json`, `canvases/*`).
- **Canvas**: one previewable page component (`canvases/<Component>.tsx`), listed in `canvases.json`.
- **Style contract**: `docs/design/<app>/rules/design.md`. **Layout contract**: `docs/design/<app>/layouts/<id>/LAYOUT.md`.
- **Runner**: `detected` (a dev workflow is installed) or `plan` (none installed).

## Step 0 — Detect & route

Probe `.wn-ai/skills/` for anchor skills and map them to steps:

| Step | Anchor skill | If missing |
| --- | --- | --- |
| #4 branch | `using-git-worktrees` | skip branching, work in current tree (note it) |
| #6 code review | `requesting-code-review` | skip CR (design review still runs) |
| #8 finish | `finishing-a-development-branch` | skip finish, tell user to finish manually |
| #5 implement (optional boost) | `executing-plans` / `subagent-driven-development` | none → this skill implements directly |

- Any of the branch/CR/finish anchors present → **detected**. None present → **plan**.
- If detection is ambiguous, ASK the user. The user may override the runner at any time.
- Do NOT hardcode a workflow's internal steps; only call its entry skill by name.

## Pipeline

| # | detected | plan |
| --- | --- | --- |
| 1 | detect & route (ask if unsure; user can override) | detect → no anchors → plan |
| 2 | interrogate design details **and separate non-UI requirements** | same |
| 3 | assemble internal requirement pack (do NOT trigger the external workflow's brainstorming/requirement intake) | assemble as plan input |
| 4 | call `using-git-worktrees` (else degrade) | no branch |
| 5 | implement Canvas drafts (this skill implements; delegate to `executing-plans`/`subagent-driven-development` if installed and **tell it NOT to auto-finish**) | use the IDE's built-in **plan mode**: produce a plan → user approves → exit plan mode → implement |
| 6 | call `requesting-code-review` + fix (else skip) | skip |
| 7 | run `design-review` agent + fix | run `design-review` agent |
| 8 | call `finishing-a-development-branch` (else prompt manual) | skip |
| 9 | **non-UI requirement receipt (unconditional)** | same |
| 10 | optional handoff prompt (if user wants) | same |

**Ordering (detected):** implement → CR → **design review + fix** → finish. design review MUST land before finish. When delegating implementation, explicitly instruct the sub-skill "implement only, do not auto-finish/merge". Step 9 runs on BOTH runners regardless of Step 10.

## Step 2 — Interrogation checklist

Lock down, one item at a time:

- Target **App** (`docs/design/<app>/` exists and has `rules/design.md`).
- Which Canvases to **add / modify / delete** (list each).
- Which **layout** each Canvas follows (reference `docs/design/<app>/layouts/<id>/LAYOUT.md`).
- Fake-data rules for each Canvas (realistic placeholder content).
- **Separate non-UI requirements**: pull every requirement unrelated to UI/Canvas (backend logic, data/storage rules, business constraints, permissions, integrations…) and record them verbatim. This skill does NOT implement them; they are returned in Step 9. If unsure whether an item is UI, ask the user to classify it.

**Blocking conditions:**

- Missing style/layout contract for the App → **STOP** and tell the user to run `wn-design-spec` first. Do not invent contracts.
- No suitable layout exists for a Canvas → offer two paths: (a) user adds a new layout via `wn-design-spec`, or (b) mark the Canvas **"AI improvise the layout"** (design review then judges against style rules + general layout soundness only).

## Step 5 — Implement (framework-agnostic)

- **Read 1–3 existing Canvas files of the target App first** to learn its tech stack, imports, and conventions. Match them. Never introduce a different framework.
- Note: `app.json.style`/`app.json.layout` are App-level. A Canvas `.tsx` does not declare style/layout; it just exports a component. Per-Canvas layout is a design intent — implement the component to match the chosen `LAYOUT.md`; do not change the data model.
- Mechanics (via the dev-only design-fs API / files):
  - **Add** a Canvas: create it (placeholder `.tsx`), then edit that `.tsx` with the real design code.
  - **Modify** a Canvas: edit its `.tsx` directly (no dedicated API).
  - **Delete** a Canvas: remove its entry + file.
- **After ADDING any new `.tsx`, the dev server must be restarted** before it can be previewed (Vite glob is static; a stale glob returns 404). Do this before Step 7.

## Step 7 — Design review

Delegate to the bundled `agents/design-review.md` on both runners. **Preview prerequisites (or review cannot capture screenshots):**

- The target design app's dev server is running (`cd apps/design && npm run dev`). In `detected` with a worktree, run it **inside that worktree**; in `plan`, the current tree.
- **If any new Canvas was added, the dev server has been restarted** (see Step 5).
- Resolve each reviewed Canvas's preview URL: `http://localhost:5173/apps/<appId>/canvases/<canvasId>`.
- If the server is unreachable or a URL can't be resolved, the review step must ERROR and explain how to start/restart the preview — never silently skip.

Fix every FAIL/PARTIAL, then re-review until PASS. Only then proceed to finish (detected).

## Step 9 — Non-UI requirement receipt (unconditional)

Always output, to the user, the non-UI requirements separated in Step 2 (verbatim, itemized), labeled: "The following non-UI requirements were NOT covered by this design prototype — hand them to downstream development." If the PRD had none, state explicitly "No uncovered non-UI requirements." This runs on both runners and is independent of Step 10.

## Step 10 — Optional handoff prompt

Ask whether to emit a minimal handoff prompt. If yes, output exactly:

```
Implement: <one-line requirement summary>
Key notes: <points locked in interrogation — target App, chosen layout, key interactions/data rules>
Design reference: <stable Canvas source paths, e.g. apps/design/apps/<app>/canvases/<id>.tsx; plus docs/design/<app>/rules|layouts contract paths>
Non-UI requirements (to implement): <the Step 2 items; "none" if empty>
```

Give **stable file paths, not `localhost` URLs** — this prompt is copied into a real product repo where dev URLs are meaningless. No bug lists; keep it minimal.

## Red flags — stop and fix

- Handing the whole task to an external workflow and hoping it calls back. (Use the orchestrator model.)
- design review running after merge, or being skipped. (It must precede finish.)
- Hardcoding React/Vue specifics instead of matching existing Canvases.
- Dropping non-UI requirements because "this skill doesn't implement them".
- Previewing a newly added Canvas without restarting the dev server.
- Inventing a style/layout contract instead of stopping for `wn-design-spec`.
````

**验证**：文件存在；`grep -i "react\|vue\|\.tsx render"` 在正文（除 Vocabulary 里的路径示例 `.tsx` 外）**无框架实现写法**；10 步流水线、Step 9 无条件、预览前置含"重启 dev server"均在文中。

---

## Task 3 — GREEN：写 `README.md`

**文件**：`.wn-ai/skills/wn-design-prd/README.md`
**动作**：新建，完整内容如下：

````markdown
# wn-design-prd

Turn a PRD / design requirement into **real, previewable Canvas design drafts** inside the `apps/design` engineering app — a "product + design first pass" that follows the target App's installed style & layout contracts, then hands back any non-UI requirements it didn't implement.

## What it does

- Interrogates the requirement, separating UI work from **non-UI requirements**.
- Implements Canvas drafts (framework-agnostic — matches the App's existing tech stack).
- Runs a mandatory visual **design review** against `docs/design/<app>` contracts.
- Always returns the untouched non-UI requirements; optionally emits a minimal handoff prompt for a downstream product repo.

## Two runners

- **detected** — a dev workflow (worktree / code-review / finish-branch) is installed: this skill orchestrates it step by step (never hands off), forcing `implement → code review → design review → finish`.
- **plan** — nothing installed: use the IDE's built-in plan mode (plan → approve → implement), skipping branch/CR/finish but still running design review.

## Prerequisites

- Target App has style/layout contracts under `docs/design/<app>/`. If missing, run `wn-design-spec` first.
- For design review, the design app dev server must be running (`cd apps/design && npm run dev`); newly added Canvases require a dev-server **restart** before preview.

## Bundled agent

- `agents/design-review.md` — visual gate that verifies each Canvas against its App's style & layout contracts from screenshots.
````

**验证**：文件存在，与 SKILL 口径一致（两 runner、需求守恒、预览前置）。

---

## Task 4 — REFACTOR：微调 `agents/design-review.md`

**文件**：`.wn-ai/skills/wn-design-prd/agents/design-review.md`
**动作**：现有内容基本可用，仅在 Review Process 第 1 步补"新增 Canvas 需重启 dev server"的硬前提，并补预览 URL 形态。

替换 Review Process 的第 1 条：

- old:
  ```
  1. **Preview each Canvas.** With the dev server running, open each added/modified Canvas's preview and capture screenshots (use Playwright). Cover the relevant breakpoints and states (default, empty, loading, error) that the requirement implies.
  ```
- new:
  ```
  1. **Preview each Canvas.** Requires the dev server running (`cd apps/design && npm run dev`). If any Canvas was newly added, the dev server MUST have been restarted first (Vite's static glob otherwise 404s new files). Open each Canvas at `http://localhost:5173/apps/<appId>/canvases/<canvasId>` and capture screenshots (Playwright), covering the relevant breakpoints and states (default, empty, loading, error) the requirement implies.
  ```

**验证**：agent 内出现预览 URL 形态与"restart"前提；其余内容不变。

---

## Task 5 — GREEN 验证 + 收口

对照 §测试场景 逐条派子代理验证；把 Task 1 记录的基线失败逐一转为通过。全绿后收口（更新 memory/lesson 若有约定）。

---

## 测试场景（15 条，子代理压力测试）

对齐 spec Testing 段。每条给"给子代理的场景设定 + 期望 GREEN 行为"。地基场景（S2/S4/S9/S13/S15）给完整判据，其余给明确 pass 判据。

- **S1 路由-未装**：环境无任何锚点 → 走 `plan`（计划→批准→实现），跳过分支/CR/收尾，仍跑 design review + 询问交接 prompt。
- **S2 路由-全装（编排保序）**：三锚点都在 → 走 detected，**按步调用**子技能且**保留主控**；顺序为 实现→CR→design review+修→finish；调用实现子技能时**明确指示"不要自动收尾"**；design review 落在 finish 之前。RED 基线：无 SKILL 时 agent 会整包交出或让 design review 落在合并后。
- **S3 保序 & 不自动收尾**：同 S2 的顺序断言单独校验。
- **S4 部分安装降级**：只装 `using-git-worktrees`、无 `finishing-a-development-branch` → 用 worktree、跳过收尾并提示手动，不整体失败。
- **S5 路由-不确定**：探测模糊 → 询问用户，不擅自选。
- **S6 手动覆盖**：用户说"走 plan" → 尊重覆盖。
- **S7 缺 style/layout 阻断**：目标 App 无 `rules/design.md` → 停并提示先跑 `wn-design-spec`，不继续。
- **S8 无合适 layout**：所需 layout 不存在 → 给"新增 / AI 自由发挥"两条出路，不擅自编造。
- **S9 预览前置**：dev server 未启动 / 新增 Canvas 未重启 → design review 报错并提示启动/重启预览，不静默跳过、不截空图。
- **S10 交接 prompt 极简 + 稳定引用**：输出 prompt 时含 需求/注意事项/设计稿参考（**文件路径**非 localhost）+ 非 UI 需求块，无 bug 清单。
- **S11 design review 兜底**：两条 runner 都调用 `design-review`。
- **S12 不重复需求收集**：detected 下调用外部子技能时不触发其头脑风暴/需求澄清入口。
- **S13 非 UI 需求守恒**：PRD 含非 UI 需求 → Step 2 分离登记、Step 9 **无条件回吐**（两 runner 都做、独立于是否出 prompt）；无非 UI 需求时明确声明"无未覆盖需求"。
- **S14 实现能力自兜底**：仅装 `using-git-worktrees`、无任何实现类子技能 → detected 下 agent **自己实现** Canvas 并跑通，不卡住。
- **S15 框架自适应**：把范例 Canvas 换成非 React 写法（如 `.vue`）→ agent 参照既有 Canvas 技术栈实现，不硬套 React；核验 SKILL 正文无框架特定硬编码。

---

## 自评（Self-review）

- 计划把 spec 全部决策落到具体文件与措辞：编排者模型、框架无关、需求守恒、10 步流水线、探测锚点+降级、预览前置、交接 prompt、design review 兜底。
- 补齐了 spec 未触及的**代码库现实**：预览 URL、App 数据模型（App 级单 layout）、design-fs 增删改机制、**新增 Canvas 需重启 dev server**。
- 遵循 writing-skills 的 RED→GREEN→REFACTOR：先删旧口径建基线，再写 SKILL/README，最后微调 agent。
- 产物正文为英文且无框架硬编码，满足可移植与框架无关铁律。
- 15 个子代理场景可执行，与 spec Testing 一一对应。
````
