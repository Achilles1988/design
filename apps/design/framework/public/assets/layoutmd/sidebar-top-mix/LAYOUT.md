---
id: sidebar-top-mix
source: manual
title: Sidebar + Top Mix
summary: 顶部一级导航 + 左侧二级导航 + 主区，大型中后台的混合外壳（Ant Pro mix）。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: sidebar
nav_model: mix
columns: 1
regions:
  - {area: header, position: top, behavior: fixed}
  - {area: sidebar, position: left, behavior: fixed}
  - {area: main, behavior: scroll}
scene_tags: [large-backoffice, enterprise-admin, multi-module-saas]
responsive: {tablet: sidebar-collapse, mobile: top-menu-drawer}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Sidebar + Top Mix

> Family: sidebar
> 顶部一级导航 + 左侧二级导航 + 主区，大型中后台的混合外壳（Ant Pro mix）。

## 1. Structure Overview

顶栏放一级模块导航，选中某模块后其二级导航出现在左侧栏，主区展示具体页面。适合模块极多的大型系统。

```
┌─────────────────────────────┐
│  header (一级导航)           │  ← fixed
├──────┬──────────────────────┤
│ side │       main  ↓         │
│ (二级)│                      │
└──────┴──────────────────────┘
```

## 2. Regions

- **header**（top · fixed）：logo + 一级模块导航 + 全局操作。
- **sidebar**（left · fixed）：当前一级模块下的二级导航。
- **main**（scroll）：具体页面内容。

## 3. Navigation Model

混合导航（`nav_model: mix`）：顶栏切一级，侧栏切二级。相比纯 side，能横向容纳更多一级模块。

## 4. Responsive Behavior

- **Desktop**：顶栏 + 左侧二级并存。
- **Tablet**：侧栏折叠为图标。
- **Mobile**：一级进顶部菜单/抽屉，二级随之切换。

## 5. Content Slots

- **header**：logo、一级模块 tabs、搜索、用户。
- **sidebar**：二级导航树。
- **main**：页面内容。

## 6. Best-fit Scenarios

- 适合：大型企业中后台、多业务模块的 SaaS、政企系统。
- 不适合：模块少的小后台（用 sidebar-shell 更简单）。

## 7. Composition with Style

风格需协调「顶栏一级选中」与「侧栏二级选中」两处状态，避免争抢注意力；一级为主、二级为辅。

## 8. Anti-patterns

- 一级、二级导航语义划分不清，用户不知在哪切换。
- 顶栏一级项过多导致换行。
