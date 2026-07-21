---
id: kanban-board
source: manual
title: Kanban / Board
summary: 横向可滚动的多列看板外壳，卡片在列间流转。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: focused
nav_model: side
columns: 4
regions:
  - {area: header, position: top, behavior: fixed}
  - {area: main, behavior: scroll}
scene_tags: [project-management, crm-pipeline, task-board, workflow, ci]
responsive: {tablet: horizontal-scroll, mobile: single-column-swipe}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Kanban / Board

> Family: focused
> 横向可滚动的多列看板外壳，卡片在列间流转。

## 1. Structure Overview

顶栏放看板标题与筛选，主区是横向排列的多个状态列，每列内卡片纵向堆叠；主区横向滚动容纳更多列。

```
┌─────────────────────────────┐
│        header + filter      │  ← fixed
├───┬───┬───┬───┬─────────────┤
│col│col│col│col│  → 横向滚动  │
│▤ │▤ │▤ │▤ │             │
│▤ │▤ │   │▤ │             │
└───┴───┴───┴───┴─────────────┘
```

## 2. Regions

- **header**（top · fixed）：看板名、视图切换、筛选、成员。
- **main**（scroll·横向）：多状态列，列内卡片纵向滚动。

## 3. Navigation Model

以列（状态/阶段）为导航维度；`nav_model: side`（可搭配左侧看板列表）。核心交互是卡片拖拽跨列。

## 4. Responsive Behavior

- **Desktop**：多列并排，超出横向滚动。
- **Tablet**：横向滚动为主。
- **Mobile**：单列切换（左右滑动切状态）。

## 5. Content Slots

- **header**：标题、筛选、视图切换、添加。
- **main**：列头（状态名 + 计数）+ 卡片（标题 + 标签 + 头像）。

## 6. Best-fit Scenarios

- 适合：项目管理（Trello/Jira）、CRM 销售流水线、任务/工作流、CI 流水线视图。
- 不适合：需精确排序对比的表格数据（用 sidebar-shell + 表格）。

## 7. Composition with Style

风格作用于卡片与列头（标签色、圆角、拖拽态）；卡片密度与列间距决定可用性。

## 8. Anti-patterns

- 列过多且无横向滚动提示。
- 卡片信息过载失去"一眼扫描"优势。
