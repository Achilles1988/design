# Design Engineering Framework (Phase 1)

> **Contract-path update (2026-07-21):** Authoritative style/layout contracts and discovery are defined by `docs/dev/superpowers/specs/2026-07-21-design-project-contract-protocol-design.md` and `docs/dev/api/design-project.md`. Obsolete host-repo contract paths and deprecated spec-install skill guidance in this document have been rewritten to match that protocol. Style/layout files now live under the design project (`design.project.json`).

Date: 2026-07-20  
Status: Approved for implementation planning (contract paths superseded — see note above)

## Goal

在 `apps/design` 建立可同步的设计工程框架。设计产物是前端页面；本工程本质是前端工程。第一期提供应用与设计页的台账能力：在 UI 中浏览/管理本仓库有哪些应用、每个应用下有哪些设计页，并支持增删空白页与空白预览。后续 skill 可读应用配置去设计具体页面。

## Context

- 本工程视觉规范现位于设计工程内：`styles/dashboard`、`layouts/sidebar-shell` 与 `split-screen`（经 `design.project.json` 解析；见 `docs/dev/api/design-project.md`）。
- `apps/design` 目前几乎为空；根目录尚无前端工程。
- 未来本设计工程会同步到其他仓库；安装脚本同步框架，不同步具体应用配置与页面内容。

## Decisions

| Topic | Decision |
|-------|----------|
| 交互面 | 管理 UI（非 CLI） |
| 壳视觉 | 遵循设计工程内 dashboard + sidebar-shell 契约 |
| 持久化 | 文件系统 |
| 目录边界 | 全部在 `apps/design/` 内；`framework/` 可同步，`apps/` 不同步（安装时 exclude） |
| 技术栈 | React + Vite + TypeScript + React Router |
| 写文件 | Vite 开发期本地 file API；生产构建只读 |
| 应用标识 | 名称必填；`id` 由名称预填且可编辑，须唯一并符合 slug 规则 |
| `path` | 可选元数据：目标 mono 仓库中业务应用源码相对路径；本工程不创建/删除真实源码路径 |
| style / layout | 第一期创建应用时写死默认值；后期再做成可选 |
| 空白页 | 元数据 + 占位组件 + 列表增删 + 可预览 |
| 实现路径 | 配置驱动台账 + 动态预览 |

## Architecture

### Directory layout

```text
apps/design/
  package.json
  vite.config.ts
  index.html
  framework/                      # syncable
    src/
      main.tsx
      App.tsx
      shell/                      # dashboard + sidebar-shell
      features/apps/              # app/page registry UI
      preview/                    # blank page preview host
      lib/api.ts                  # client for Vite file API
    vite-plugins/
      design-fs.ts                # dev-only read/write under apps/
  apps/                           # NOT synced (install exclude)
    <id>/
      app.json
      pages.json
      pages/
        <PageName>.tsx
```

### Data model

**`app.json`**

| Field | Phase 1 rule |
|-------|----------------|
| `id` | slug from `name`; equals directory name |
| `name` | required |
| `path` | optional; target repo source-relative path metadata only |
| `style` | hardcoded default: `dashboard` |
| `layout` | hardcoded default: `sidebar-shell` |

**Slug rules (explicit)**

1. Trim `name`, lowercase, replace runs of non-`[a-z0-9]` with `-`, trim `-`.
2. If the result is empty (e.g. name is only CJK/symbols), require the user to supply a latin `id` override in the create form (phase 1 exception to “name-only”), or reject with a clear error asking for an ASCII-friendly name. Prefer: show an editable `id` field prefilled from the slug algorithm; user may edit before submit. `id` must match `^[a-z][a-z0-9-]*$` and be unique.
3. Directory is always `apps/design/apps/<id>/`.

**`path` rules (explicit)**

- Optional opaque string for skills; no filesystem access to the target repo.
- If provided: non-empty after trim; must not contain `..`; reject absolute paths (`/…` or Windows drive). No other validation in phase 1.

**`pages.json`**

Each entry: `id`, `name`, `component` (filename under `pages/`).

Adding/removing a blank page updates `pages.json` and creates/deletes the corresponding `.tsx` placeholder.

### Runtime

- `vite dev` serves the management shell and mounts the file API plugin.
- Write APIs exist only in development. `vite build` / static preview are read-oriented; write calls must fail closed (404 or disabled).

**Management routes**

| Path | Purpose |
|------|---------|
| `/` | App list |
| `/apps/new` | Create app (`name`, editable `id` prefilled from name, optional `path`) |
| `/apps/:id` | App detail: metadata, page list, add/delete blank pages |
| `/apps/:id/pages/:pageId` | Blank page preview |

**Write flow (dev only)**

1. UI → `POST/DELETE` (or equivalent) on `/__design_fs/*`
2. Plugin resolves paths and rejects any target outside `apps/design/apps/`
3. Persist `app.json` / `pages.json` / `pages/*.tsx`
4. UI refreshes lists; preview loads via `import.meta.glob` (or equivalent alias) over `apps/*/pages/*.tsx`

**Read flow**

- Lists/details: file API reads JSON from `apps/`
- Preview: dynamic import of placeholder components from the content zone

### Error handling

- Duplicate `id`, invalid `id`/`path` per rules above, or existing files: API returns explicit errors; UI surfaces them; never silent overwrite.
- Path traversal attempts: rejected by the plugin.

## UI scope (Phase 1)

Shell: sidebar-shell — sidebar for navigation/entry, main for list/detail.

Included:

- App list, create form, app detail
- Page list, add blank page, delete with confirm
- Blank preview route

Excluded:

- Creating/deleting target-repo source directories
- Style/layout picker and validation for managed apps
- Skill invocation UI
- Install/sync scripts to other repositories
- Auto-linking managed apps to host-repo doc trees (retired; contracts live in the design project)

## Placeholder page

Minimal React component (page title from name) that the preview route can render. Later skills edit these files; this framework does not author design content.

## Testing

- Manual: in `vite dev`, create app → add blank page → preview → delete page → delete app; confirm disk files match UI.
- Automated: unit tests for file API path safety, slug generation, and duplicate-id rejection.
- No heavy UI E2E required in phase 1.

## Success criteria

1. `apps/design` is a runnable Vite React app whose shell follows in-project style/layout contracts (`design.project.json`).
2. Operator can manage apps and blank pages entirely from the UI in dev, with files under `apps/design/apps/`.
3. Content under `apps/` is clearly separable for a future install script exclude.
4. App `path` is stored as metadata only; no target source tree mutations.
5. Blank pages are listable, deletable, and previewable.

## Out of scope (later)

- Install/upgrade scripts that sync `framework/` into other repos
- Selectable style/layout for managed apps
- Content visual compliance tooling
- Skill wiring beyond readable config on disk

## Spec self-review notes

- No TBD placeholders left for phase 1 behavior.
- Sync story is a constraint on layout, not an implemented feature.
- Authoritative style/layout contracts live under the design project (`styles/` / `layouts/`); `framework/public/assets/` remains a browser library only.
