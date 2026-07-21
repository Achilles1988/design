---
id: holy-grail
source: manual
title: Holy Grail
summary: 顶栏 + 底栏固定，左右侧栏 + 中间主区的经典三栏门户外壳。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: multi-pane
nav_model: top
columns: 3
regions:
  - {area: header, position: top, behavior: fixed}
  - {area: sidebar, position: left, behavior: scroll}
  - {area: main, behavior: scroll}
  - {area: aside, position: right, behavior: scroll}
  - {area: footer, position: bottom, behavior: fixed}
scene_tags: [portal, classic-web, intranet, general-site]
responsive: {tablet: drop-aside, mobile: single-column}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Holy Grail

> Family: multi-pane
> 顶栏 + 底栏固定，左右侧栏 + 中间主区的经典三栏门户外壳。

## 1. Structure Overview

顶栏与底栏固定，中间三栏并列：左栏导航、中栏主内容（自适应铺满剩余空间）、右栏补充。是最经典的整页布局。

```
┌─────────────────────────────┐
│           header            │  ← fixed
├──────┬───────────────┬──────┤
│ left │     main      │ right│
├──────┴───────────────┴──────┤
│           footer            │  ← fixed
└─────────────────────────────┘
```

## 2. Regions

- **header**（top · fixed）：品牌与全局导航。
- **sidebar (left)**（scroll）：次导航/分类。
- **main**（scroll）：主内容，弹性填充。
- **aside (right)**（scroll）：辅助信息/广告。
- **footer**（bottom · fixed）：全站链接。

## 3. Navigation Model

顶栏主导航 + 左栏次导航；右栏为补充信息非导航。经典但偏"信息展示"而非"应用"。

## 4. Responsive Behavior

- **Desktop**：完整三栏 + 顶底。
- **Tablet**：去掉右栏，保留左栏 + 主区。
- **Mobile**：塌陷为单列，侧栏内容前后堆叠。

## 5. Content Slots

- **header**：logo、导航。
- **sidebar**：分类/次导航。
- **main**：主内容。
- **aside**：相关/广告。
- **footer**：链接、版权。

## 6. Best-fit Scenarios

- 适合：传统门户、内网系统、综合信息站。
- 不适合：现代应用型产品（多用 sidebar-shell）、沉浸内容（用 centered）。

## 7. Composition with Style

风格需处理五个分区的层次；这是最"重"的骨架，风格上宜克制，避免拥挤。

## 8. Anti-patterns

- 左右栏都塞满导致主区被挤压。
- 固定顶底占用过多高度，主区可视区域太小。
