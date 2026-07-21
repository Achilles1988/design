---
id: top-nav-multicolumn
source: manual
title: Top-nav + Multi-column Content
summary: 顶栏 + 左中右多栏内容流，新闻门户/内容站的经典外壳。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: stacked
nav_model: top
columns: 3
regions:
  - {area: header, position: top, behavior: fixed}
  - {area: aside, position: left, behavior: scroll}
  - {area: main, behavior: scroll}
  - {area: aside, position: right, behavior: scroll}
scene_tags: [news, portal, magazine, media, content-hub]
responsive: {tablet: drop-right-aside, mobile: single-column}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Top-nav + Multi-column Content

> Family: stacked
> 顶栏 + 左中右多栏内容流，新闻门户/内容站的经典外壳。

## 1. Structure Overview

顶栏固定，下方为 2–3 栏内容并列：左栏次要栏目/导航，中栏主内容流，右栏推荐/广告。整体随页面滚动。

```
┌─────────────────────────────┐
│           header            │  ← fixed
├──────┬───────────────┬──────┤
│ left │     main      │ right│  ← 三栏，scroll
│ aside│    content ↓  │ aside│
└──────┴───────────────┴──────┘
```

## 2. Regions

- **header**（top · fixed）：品牌 + 频道导航（可能多层）。
- **aside (left)**（scroll）：栏目/热门/次导航。
- **main**（scroll）：主内容流（头条、列表、专题）。
- **aside (right)**（scroll）：推荐、榜单、广告。

## 3. Navigation Model

顶部多层频道导航为主干；左栏承载栏目二级入口。信息密度高，导航偏"目录式"。

## 4. Responsive Behavior

- **Desktop**：三栏并列。
- **Tablet**：去掉右侧 aside，保留左栏 + 主栏（或两栏）。
- **Mobile**：塌陷为单列，侧栏内容下沉到内容流之间或折叠。

## 5. Content Slots

- **header**：logo、频道导航、搜索。
- **aside (left)**：栏目树、热门标签。
- **main**：头条区、信息流列表、专题卡片。
- **aside (right)**：排行榜、推荐阅读、广告位。

## 6. Best-fit Scenarios

- 适合：新闻门户、杂志/媒体站、综合内容 hub、社区首页。
- 不适合：需要沉浸阅读的单篇（用 top-nav-centered）、应用型后台（用 sidebar-shell）。

## 7. Composition with Style

风格重点在信息密度控制与分栏分隔（分隔线/间距/字号层级）；多栏对排版层级要求高。

## 8. Anti-patterns

- 三栏都塞满、无主次，信息过载。
- 移动端硬塞多栏导致横向滚动。
