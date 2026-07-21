---
id: dual-sidebar
source: manual
title: Dual Sidebar
summary: 窄图标栏 + 二级导航栏 + 主区，Slack/Discord 式的双层侧导航外壳。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: sidebar
nav_model: dual
columns: 1
regions:
  - {area: icon, position: left, behavior: fixed}
  - {area: nav2, position: left, behavior: scroll}
  - {area: header, position: top, behavior: fixed}
  - {area: main, behavior: scroll}
scene_tags: [team-chat, complex-backoffice, workspace-switcher, community]
responsive: {tablet: hide-icon-rail, mobile: sidebar-drawer}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Dual Sidebar

> Family: sidebar
> 窄图标栏 + 二级导航栏 + 主区，Slack/Discord 式的双层侧导航外壳。

## 1. Structure Overview

最左是窄图标条（切工作区/大模块），其右是二级导航栏（当前模块的频道/列表），再右是主内容区。

```
┌─┬─────┬────────────┐
│▪│     │   header   │
│▪│ nav2├────────────┤
│▪│     │   main  ↓   │
└─┴─────┴────────────┘
 ↑icon  ↑二级导航
```

## 2. Regions

- **icon**（left · fixed）：窄图标栏，切换工作区/顶级模块。
- **nav2**（left · fixed/scroll）：当前模块的二级导航（频道、会话、列表）。
- **header**（top · fixed）：当前上下文标题与操作。
- **main**（scroll）：主内容。

## 3. Navigation Model

双层侧导航（`nav_model: dual`）：图标栏切"空间"，二级栏切"空间内条目"。适合有明显两级归属的产品。

## 4. Responsive Behavior

- **Desktop**：图标栏 + 二级栏并存。
- **Tablet**：隐藏图标栏，仅留二级栏 + 切换器。
- **Mobile**：两栏都收进抽屉，分步切换。

## 5. Content Slots

- **icon**：工作区头像/图标、添加按钮。
- **nav2**：频道/会话列表、分组。
- **header**：频道名、成员、搜索。
- **main**：消息流 / 内容。

## 6. Best-fit Scenarios

- 适合：团队协作/IM（Slack、Discord）、含多工作区的复杂后台、社区。
- 不适合：单一层级导航（用 sidebar-shell）、内容站。

## 7. Composition with Style

风格需区分三层纵向分区的层次（图标栏最重、二级栏中、主区最轻）；工作区选中态是核心信号。

## 8. Anti-patterns

- 图标栏无 tooltip 难辨识。
- 二级栏与图标栏语义重叠造成困惑。
