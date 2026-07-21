---
id: top-nav-single
source: manual
title: Top-nav Single Column
summary: 顶部固定导航 + 单列内容纵向滚动，最通用的内容型外壳。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: stacked
nav_model: top
columns: 1
regions:
  - {area: header, position: top, behavior: fixed}
  - {area: main, behavior: scroll}
  - {area: footer, position: bottom, behavior: scroll}
scene_tags: [landing, marketing, product, simple-app, portfolio]
responsive: {tablet: full-width, mobile: hamburger-menu}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Top-nav Single Column

> Family: stacked
> 顶部固定导航 + 单列内容纵向滚动，最通用的内容型外壳。

## 1. Structure Overview

顶栏固定吸顶承载全局导航，下方为居中单列内容随页面滚动，底部页脚随内容流。

```
┌──────────────────────┐
│        header        │  ← fixed
├──────────────────────┤
│                      │
│        main  ↓        │  ← scroll（居中容器）
│                      │
├──────────────────────┤
│        footer        │
└──────────────────────┘
```

## 2. Regions

- **header**（top · fixed）：品牌 logo + 主导航 + 全局操作（登录/CTA）。
- **main**（scroll）：单列内容，通常限制最大宽度居中。
- **footer**（bottom · scroll）：次级链接、版权、订阅。

## 3. Navigation Model

单层顶部水平导航（`nav_model: top`）。导航项数量适中（3–7 项），过多时收进「更多」或改用 sidebar 家族。

## 4. Responsive Behavior

- **Desktop**：顶栏横向铺开，内容居中限宽。
- **Tablet**：内容占满宽度，导航项可收缩。
- **Mobile**：导航折叠为汉堡菜单 / 抽屉。

## 5. Content Slots

- **header**：logo、导航、主 CTA。
- **main**：Hero、特性区、内容段落，纵向堆叠。
- **footer**：链接组、法律信息。

## 6. Best-fit Scenarios

- 适合：营销落地页、产品官网、博客首页、作品集、结构简单的应用。
- 不适合：导航项极多的中后台（改用 sidebar-shell）、需并列多栏的门户（改用 top-nav-multicolumn）。

## 7. Composition with Style

风格 token 主要作用于 header（品牌感）与 main 的排版节奏；单列结构对风格几乎无约束，是承载强视觉风格的最佳骨架。

## 8. Anti-patterns

- 顶栏塞入过多导航项导致换行。
- 单列内容不限宽，在宽屏上行长过长影响阅读。
