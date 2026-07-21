---
id: sidebar-collapsible
source: manual
title: Collapsible / Mini Sidebar
summary: 侧栏可在完整与图标条之间折叠，信息密集后台的省空间外壳。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: sidebar
nav_model: side
columns: 1
regions:
  - {area: sidebar, position: left, behavior: fixed}
  - {area: header, position: top, behavior: fixed}
  - {area: main, behavior: scroll}
scene_tags: [admin, data-platform, dense-backoffice, monitoring, ide-like]
responsive: {tablet: mini-sidebar, mobile: sidebar-drawer}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Collapsible / Mini Sidebar

> Family: sidebar
> 侧栏可在完整与图标条之间折叠，信息密集后台的省空间外壳。

## 1. Structure Overview

在 sidebar-shell 基础上，侧栏支持折叠为「仅图标」的迷你条，把宽度让给主区；展开时显示图标 + 文字。

```
展开态                折叠态(mini)
┌────┬──────────┐     ┌─┬────────────┐
│    │  header  │     │ │  header    │
│ nav├──────────┤     │▪├────────────┤
│    │  main ↓  │     │▪│  main ↓     │
└────┴──────────┘     └─┴────────────┘
```

## 2. Regions

- **sidebar**（left · fixed）：可折叠导航，展开=图标+文字，折叠=仅图标（hover 出浮层）。
- **header**（top · fixed）：含折叠切换按钮。
- **main**（scroll）：主内容，随侧栏宽度变化重排。

## 3. Navigation Model

同 sidebar-shell 的单侧栏导航，额外提供折叠态；折叠后二级菜单以 hover 浮层呈现。

## 4. Responsive Behavior

- **Desktop**：默认展开，用户可手动折叠。
- **Tablet**：默认折叠为 mini。
- **Mobile**：改为抽屉。

## 5. Content Slots

- **sidebar**：图标 + 标签（折叠时仅图标）。
- **header**：折叠按钮、搜索、用户。
- **main**：内容区。

## 6. Best-fit Scenarios

- 适合：信息密集后台、监控大屏入口、IDE 类工具、需要在导航与工作区间权衡的应用。
- 不适合：导航项极少（直接用 sidebar-shell 或 stacked）。

## 7. Composition with Style

风格需同时定义展开/折叠两态的图标与选中态；注意折叠态浮层的层级与阴影。

## 8. Anti-patterns

- 折叠后无 tooltip/浮层，用户看不懂图标。
- 折叠切换导致主区内容大幅跳动无过渡。
