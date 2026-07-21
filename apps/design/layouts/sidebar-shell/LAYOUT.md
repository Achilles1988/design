---
id: sidebar-shell
source: manual
title: Sidebar Shell
summary: 左侧固定导航 + 顶栏 + 主内容区滚动，中后台/控制台标准外壳。
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
scene_tags: [admin, saas-console, data-platform, dashboard, backoffice]
responsive: {tablet: sidebar-collapse, mobile: sidebar-drawer}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Sidebar Shell

> Family: sidebar
> 左侧固定导航 + 顶栏 + 主内容区滚动，中后台/控制台标准外壳。

## 1. Structure Overview

左侧固定导航栏承载主导航（长驻），顶栏放全局操作与上下文，主区独立滚动。

```
┌────┬───────────────┐
│    │    header     │  ← header fixed
│ nav├───────────────┤
│    │    main  ↓     │  ← main scroll
│    │               │
└────┴───────────────┘
   ↑ sidebar fixed
```

## 2. Regions

- **sidebar**（left · fixed）：主导航，通常含 logo、导航树、账户区。
- **header**（top · fixed）：面包屑/页标题、搜索、通知、用户菜单。
- **main**（scroll）：当前页内容，独立滚动。

## 3. Navigation Model

左侧单栏导航（`nav_model: side`）承载全部一级（含可展开二级）导航项，适合导航项多、需长驻的场景。

## 4. Responsive Behavior

- **Desktop**：侧栏常驻展开。
- **Tablet**：侧栏折叠为图标条（见 sidebar-collapsible）。
- **Mobile**：侧栏收为抽屉，点击汉堡弹出。

## 5. Content Slots

- **sidebar**：logo、导航分组、底部账户/设置。
- **header**：页面标题/面包屑、全局搜索、操作按钮、通知。
- **main**：数据表、表单、图表、卡片区。

## 6. Best-fit Scenarios

- 适合：管理后台、SaaS 控制台、数据平台、Dashboard（用户图1）。
- 不适合：营销落地页、内容阅读（用 stacked / centered）。

## 7. Composition with Style

风格 token 作用于 sidebar 的选中/悬停态、header 的层次、main 的卡片与表格样式；侧栏选中态是主要品牌信号。

## 8. Anti-patterns

- 侧栏导航层级过深（>2 级）导致迷失。
- 顶栏与侧栏重复放置同类导航。
