---
id: main-right-aside
source: manual
title: Main + Right Aside
summary: 主内容区 + 右侧上下文/属性栏，详情页与编辑器的属性面板外壳。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: sidebar
nav_model: side
columns: 2
regions:
  - {area: sidebar, position: left, behavior: fixed}
  - {area: header, position: top, behavior: fixed}
  - {area: main, behavior: scroll}
  - {area: aside, position: right, behavior: fixed}
scene_tags: [detail-page, editor, properties-panel, inspector, crm-detail]
responsive: {tablet: aside-collapse, mobile: aside-bottom-sheet}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Main + Right Aside

> Family: sidebar
> 主内容区 + 右侧上下文/属性栏，详情页与编辑器的属性面板外壳。

## 1. Structure Overview

在常规导航之外，主区右侧增加一条固定的上下文栏（属性/详情/活动），主区与右栏可各自滚动。

```
┌────┬───────────┬─────┐
│    │  header   │     │
│nav ├───────────┤aside│  ← 右侧上下文栏 fixed
│    │  main  ↓  │  ↓  │
└────┴───────────┴─────┘
```

## 2. Regions

- **sidebar**（left · fixed）：主导航（可选，编辑器场景可无）。
- **header**（top · fixed）：标题、操作。
- **main**（scroll）：主内容/画布/正文。
- **aside**（right · fixed）：属性、详情、评论、活动记录。

## 3. Navigation Model

导航以左侧为主；右侧 aside 不是导航而是"上下文/检视器（inspector）"。

## 4. Responsive Behavior

- **Desktop**：右侧 aside 常驻。
- **Tablet**：aside 可折叠/浮出。
- **Mobile**：aside 变为底部抽屉或独立页。

## 5. Content Slots

- **sidebar**：导航。
- **main**：内容主体。
- **aside**：属性表单、元信息、相关项、评论。

## 6. Best-fit Scenarios

- 适合：详情页、编辑器属性面板、CRM/工单详情、检视器类界面。
- 不适合：无上下文信息可放（右栏空置则删掉，用 sidebar-shell）。

## 7. Composition with Style

风格需让 aside 与 main 分区清晰（分隔线/底色），但 aside 不喧宾夺主；表单密度在 aside 中偏高。

## 8. Anti-patterns

- 右栏塞入本该在主区的核心内容。
- 三栏都可滚动却无边界提示，用户滚错区域。
