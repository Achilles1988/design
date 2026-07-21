---
id: top-nav-subnav-tabs
source: manual
title: Top-nav + Sub-nav (Tabs)
summary: 顶栏 + 二级 Tab 栏 + 内容区，带模块切换的应用外壳。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: stacked
nav_model: top
columns: 1
regions:
  - {area: header, position: top, behavior: fixed}
  - {area: nav2, position: top, behavior: fixed}
  - {area: main, behavior: scroll}
scene_tags: [app, project-detail, settings, profile, saas-lite]
responsive: {tablet: scrollable-tabs, mobile: dropdown-tabs}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Top-nav + Sub-nav (Tabs)

> Family: stacked
> 顶栏 + 二级 Tab 栏 + 内容区，带模块切换的应用外壳。

## 1. Structure Overview

顶栏承载全局导航，其下固定一条二级 Tab 栏用于当前模块内的分页切换，内容区随 Tab 变化并滚动。

```
┌──────────────────────┐
│        header        │  ← fixed
├──────────────────────┤
│ [Tab][Tab][Tab] ···  │  ← nav2 (tabs) fixed
├──────────────────────┤
│        main  ↓        │  ← scroll
└──────────────────────┘
```

## 2. Regions

- **header**（top · fixed）：品牌 + 全局导航/账户。
- **nav2**（top · fixed）：当前区域的二级 Tab（Overview / Settings / Members…）。
- **main**（scroll）：所选 Tab 的内容。

## 3. Navigation Model

两级导航：顶栏切"大模块"，Tab 栏切"模块内子页"（`nav_model: top`，含二级 tab）。适合层级为 2 的应用。

## 4. Responsive Behavior

- **Desktop**：Tab 横向排列。
- **Tablet**：Tab 可横向滚动。
- **Mobile**：Tab 收为下拉选择或分段控件。

## 5. Content Slots

- **header**：logo、全局导航、用户菜单。
- **nav2**：当前对象名 + Tab 组。
- **main**：对应 Tab 的表单/列表/详情。

## 6. Best-fit Scenarios

- 适合：项目/仓库详情页、设置中心、个人主页、轻量 SaaS 的对象详情。
- 不适合：导航项极多（用 sidebar-shell）、纯内容阅读（用 centered）。

## 7. Composition with Style

风格重点在 Tab 的激活态（下划线/底色/权重）与两条栏的层次区分；Tab 状态是主要交互信号。

## 8. Anti-patterns

- Tab 过多导致换行或需要横向滚动却无提示。
- 用 Tab 承载彼此无关的顶级模块（应放顶栏）。
