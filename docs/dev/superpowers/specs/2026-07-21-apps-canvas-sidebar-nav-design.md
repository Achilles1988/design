# Apps/Canvas Sidebar Navigation & Terminology Rename (Phase 2)

Date: 2026-07-21
Status: Approved for implementation planning

## Goal

优化 Phase 1 台账 UI 的信息架构与视觉呈现：侧边栏改为可展开的二级树（App → Canvas），
让所有 App 和其下的 Canvas 一次性可见可导航；简化冗余的按钮/空态文案；主内容区利用更多可用宽度并居中；
将概念 "page" 统一重命名为 "canvas"（含技术层：类型、API、磁盘文件、路由）。

## Context

- Phase 1 详见 `docs/dev/superpowers/specs/2026-07-20-design-engineering-framework-design.md`。
- 现状问题（对照截图）：
  1. 侧边栏只有两个静态项 "Apps" / "New app"，看不到实际有哪些 App。
  2. 主内容区 `.apps-page` 限宽 720px 且贴左，未利用侧边栏之外的空间，视觉偏空。
  3. App 详情页头部的 "All apps" 按钮与侧边栏 "Apps" 导航功能重复。
  4. "Pages" 区块的空态提示 "No pages yet. Add a blank page below." 与紧邻的表单重复，冗余。
  5. 领域词 "page" 容易与浏览器/路由的 "page" 概念混淆；产品语义上这些是"空白设计画布"，改名为 "canvas" 更准确，且需要在 glossary 中固化。

## Decisions

| Topic | Decision |
|-------|----------|
| 术语改名范围 | 全面重命名（UI 文案 + 类型名 + API 路径 + 磁盘文件名 + 路由 + API 文档），非仅文案 |
| 术语固化 | 在 `docs/dev/conventions/glossary.md` 新增 "Canvas" 词条 |
| 侧边栏内容 | 静态 "Apps" 链接 + 动态二级树（App 列表，每个 App 下展开显示其 Canvas 列表） |
| 侧边栏 "New app" | 移除；创建入口保留在 Apps 列表页右上角现有按钮 |
| 树展开/折叠 | 每个 App 节点可 collapse/expand；本期状态只存于组件内存，不做持久化 |
| 详情页 "All apps" 按钮 | 移除（侧边栏已可达） |
| 详情页 Canvas 区块 | 保留列表 + "Add canvas" 表单；移除空态提示文案，空列表时直接展示表单 |
| 主内容区布局 | 保持左侧 `sidebar-shell__main` 区域不变，内部改为 flex 居中；`.apps-page` 最大宽度从 720px 增至 960px |
| 数据获取方式 | 侧边栏树用现有 `listApps` + 每个 App 并行 `listCanvases`（N+1 客户端请求），不新增聚合端点 |
| 迁移 | 已有 `apps/design/apps/test-app/pages.json` → `canvases.json`，`pages/` 目录 → `canvases/`；字段 `pages` → `canvases` |

## Architecture

### Rename map (page → canvas)

| Layer | File | Before | After |
|---|---|---|---|
| 类型 | `framework/src/lib/types.ts` | `PageEntry`, `PagesFile` | `CanvasEntry`, `CanvasesFile` |
| 前端 API | `framework/src/lib/api.ts` | `listPages`, `addPage`, `deletePage` | `listCanvases`, `addCanvas`, `deleteCanvas` |
| HTTP 路由 | `framework/vite-plugins/design-fs/plugin.ts` | `/__design_fs/apps/:id/pages[...]` | `/__design_fs/apps/:id/canvases[...]` |
| 存储逻辑 | `framework/vite-plugins/design-fs/store.ts` | `readPagesFile/writePagesFile/listPages/addPage/deletePage/nameToComponentFile/pagePlaceholderSource` | 同名前缀替换为 `Canvas`/`canvas`（`nameToComponentFile` 保持通用命名不变，因其与 canvas/page 无关） |
| 磁盘 | `apps/design/apps/<id>/pages.json`, `pages/*.tsx` | — | `canvases.json`, `canvases/*.tsx`；JSON 顶层字段 `pages` → `canvases` |
| 前端路由 | `App.tsx` | `/apps/:id/pages/:pageId` | `/apps/:id/canvases/:canvasId` |
| 预览组件 | `framework/src/preview/` | `PagePreview.tsx`, `loadPageModule.ts` | `CanvasPreview.tsx`, `loadCanvasModule.ts` |
| UI 文案 | `AppDetailPage.tsx` | "Pages" / "Add blank page" / "Page name" / "No pages yet..." | "Canvases" / "Add canvas" / "Canvas name" / （移除） |
| API 文档 | `docs/dev/api/design-fs.md` | `pages.json` / `/pages` 端点 / `listPages` 等 | 同步改为 `canvases.json` / `/canvases` / `listCanvases` 等 |
| Glossary | `docs/dev/conventions/glossary.md` | 空表 | 新增 `Canvas` 词条 |

`AppConfig.style` / `AppConfig.layout` 等与 "page" 无关的字段不受影响。

### Sidebar tree (new)

`SidebarShell` 从纯展示组件变为数据感知组件：

```
SidebarShell
  useEffect: designApi.listApps()
    → 对每个 app 并行 designApi.listCanvases(app.id)
  state: apps: Array<{ app: AppConfig; canvases: CanvasEntry[] }> | null
  state: collapsed: Set<string>   // 记录折叠的 appId，默认全部展开
```

渲染结构：

```
<nav>
  <NavLink to="/">Apps</NavLink>          ← 一级，始终存在，指向列表页
  {apps.map(({app, canvases}) => (
    <div class="app-node">
      <button (toggle collapsed) + <NavLink to={`/apps/${app.id}`}>{app.name}</NavLink>
      {!collapsed && canvases.map(c => (
        <NavLink to={`/apps/${app.id}/canvases/${c.id}`}>{c.name}</NavLink>
      ))}
    </div>
  ))}
</nav>
```

- 折叠箭头（chevron）点击仅 toggle 展开态，不触发导航；点击 App 名称文本才导航到详情页。
- 二级 Canvas 项使用比一级更小的缩进/字号（视觉层级），复用 `sidebar-shell__nav-link` 变体类。
- 加载失败或某个 App 尚无 Canvas：该 App 节点展开后为空，不显示错误（详情页本身有错误态承载）。
- `SidebarShell` 目前是无状态展示组件，改造后需要感知路由变化后刷新（例如在详情页新增/删除 Canvas 后，侧边栏树要能反映最新数据）。方案：在 `AppDetailPage` 增删 Canvas 成功后，通过一个轻量的刷新信号通知 `SidebarShell` 重新拉取列表 — 采用最简方案：`SidebarShell` 监听 `location.pathname` 变化时重新 `listApps`/`listCanvases`（路由切换在增删后必然发生：增删都不导航，因此需要更直接的机制）。

  **修正方案**：不引入全局状态库；`AppDetailPage` 的增删 Canvas 成功回调中，额外调用一个简单的模块级事件总线（`framework/src/lib/canvasEvents.ts`，基于 `EventTarget` 的极简实现）广播 `canvases-changed`；`SidebarShell` 订阅该事件以及路由变化以重新拉取。这是本次改造中唯一新增的小型基础设施文件。

### Layout changes

`SidebarShell.css`：
```css
.sidebar-shell__main {
  /* existing grid position unchanged */
  display: flex;
  justify-content: center;   /* 新增：内容居中 */
}
```

`apps.css`：
```css
.apps-page {
  max-width: 960px;   /* was 720px */
  width: 100%;
}
```

### App detail page changes

- Header actions 只保留 `Delete app` 按钮，移除 `All apps` `Link`。
- "Pages" → "Canvases" 标题；空列表分支（`canvases.length === 0`）不再渲染 `<p className="apps-empty">`，直接渲染下方表单。
- 表单标签/占位文案同步改名（Name 占位 `Home` 不变；说明文案 "Add blank page" → "Add canvas"）。

## Error handling

- 沿用现有错误处理模式（`apps-error` 提示条），改名不影响错误语义。
- 迁移旧 `pages.json`/`pages/` 时如目标 `canvases.json`/`canvases/` 已存在，脚本报错而非覆盖（本仓库只有一个 `test-app` 实例，风险很低，仍按规范处理）。

## Migration steps (data)

1. 对 `apps/design/apps/test-app/`：
   - `pages.json` → `canvases.json`，JSON 内 `"pages"` 键改为 `"canvases"`。
   - `pages/` 目录重命名为 `canvases/`（内容原样，`.tsx` 文件不变）。
2. 无需数据库/其他实例迁移（当前仓库仅一个示例 App）。

## Testing

- Manual：`npm run dev` 下验证：
  - 侧边栏展示所有 App，可展开/折叠，点击二级项跳转到对应 Canvas 预览。
  - 新增/删除 Canvas 后，侧边栏树同步更新。
  - 详情页头部只剩 "Delete app"；Canvas 空列表下表单正常展示、无冗余空态文案。
  - 主内容区在宽屏下居中显示，宽度上限 960px。
- 回归：Apps 列表页、New app 创建流程不受影响。
- 若项目已有单元测试覆盖 `store.ts`/slug 校验，同步更新测试中的字段名/路径断言（`pages` → `canvases`）。

## Success criteria

1. 侧边栏无需进入列表页即可看到所有 App 及其 Canvas，可折叠展开。
2. 全局不再有 "page" 术语残留（代码标识符、路由、磁盘文件、文档、UI 文案），"canvas" 出现在 glossary 中并有清晰定义。
3. 详情页 Header 只保留 "Delete app"；Canvas 区块无冗余空态文案。
4. 主内容区在大屏下居中展示，视觉不再显得局促。
5. `test-app` 现有数据成功迁移，dev server 下功能行为与 Phase 1 等价（仅术语与呈现变化）。

## Out of scope

- Canvas 树展开/折叠状态持久化（localStorage）。
- 聚合类 API 端点（如一次性返回 apps + canvases）。
- 侧边栏移动端抽屉/响应式细节（沿用 Phase 1 既有响应式约定，未做改动）。
- 多实例数据迁移脚本化（当前只有一个示例 App，手动迁移即可）。

## Spec self-review notes

- Rename map 覆盖了类型/API/磁盘/路由/文档/术语表六个层面，未遗留 TBD。
- 侧边栏数据刷新机制明确为「路由变化 + 轻量事件总线」，避免引入状态管理库这一过度设计。
- 与 Phase 1 spec 的关系是增量优化，不重复其已决策内容（style/layout picker 等仍 out of scope，未受影响）。
