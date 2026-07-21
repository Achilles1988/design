---
id: top-nav-feed-grid
source: manual
title: Top-nav + Feed/Grid
summary: 顶栏 + 卡片流/网格主体，商品与信息流的列表型外壳。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: stacked
nav_model: top
columns: 3
regions:
  - {area: header, position: top, behavior: fixed}
  - {area: main, behavior: scroll}
scene_tags: [ecommerce, social, gallery, marketplace, feed]
responsive: {tablet: grid-2col, mobile: grid-1col}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Top-nav + Feed/Grid

> Family: stacked
> 顶栏 + 卡片流/网格主体，商品与信息流的列表型外壳。

## 1. Structure Overview

顶栏固定（常含搜索/筛选入口），主体是响应式卡片网格随页面滚动，可分页或无限加载。

```
┌──────────────────────┐
│   header + search    │  ← fixed
├──────────────────────┤
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐  │
│ └──┘ └──┘ └──┘ └──┘  │  ← 卡片网格 scroll
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐  │
│ └──┘ └──┘ └──┘ └──┘  │
└──────────────────────┘
```

## 2. Regions

- **header**（top · fixed）：logo、搜索、筛选/排序、账户/购物车。
- **main**（scroll）：卡片网格，列数随视口自适应。

## 3. Navigation Model

顶部导航 + 内联筛选/分类（可作为顶栏下方的一条筛选带）。深层分类可用左侧临时筛选抽屉。

## 4. Responsive Behavior

- **Desktop**：3–4 列网格。
- **Tablet**：2 列。
- **Mobile**：1 列，筛选进抽屉。

## 5. Content Slots

- **header**：搜索框、筛选、排序、购物车/通知。
- **main**：卡片（图 + 标题 + 元信息 + 操作），分页或无限滚动。

## 6. Best-fit Scenarios

- 适合：电商列表页、社交信息流、图库、市场/目录、搜索结果。
- 不适合：单篇长文（用 top-nav-centered）、强调左侧导航的后台（用 sidebar-shell）。

## 7. Composition with Style

风格重点在卡片样式（圆角、阴影、间距）与网格节奏；卡片是风格表达的主要载体。

## 8. Anti-patterns

- 卡片尺寸不一致导致网格错位。
- 无骨架屏/占位，加载时布局跳动。
