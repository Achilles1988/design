---
id: split-screen
source: manual
title: Split-screen 50/50
summary: 左右各半的分屏外壳，一侧品牌/视觉、一侧表单/内容。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: focused
nav_model: none
columns: 2
regions:
  - {area: aside, position: left, behavior: fixed}
  - {area: main, position: right, behavior: scroll}
scene_tags: [login, signup, brand-story, comparison, split-hero]
responsive: {tablet: stack-vertical, mobile: hide-visual}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Split-screen 50/50

> Family: focused
> 左右各半的分屏外壳，一侧品牌/视觉、一侧表单/内容。

## 1. Structure Overview

屏幕左右对半：一侧放品牌视觉/插画/大图（常固定），另一侧放表单或核心内容（可滚动），形成强对比。

```
┌──────────────┬──────────────┐
│              │              │
│   visual     │    main      │
│  (品牌/图)    │  (表单/内容) │
│              │      ↓        │
└──────────────┴──────────────┘
```

## 2. Regions

- **aside (left)**（fixed）：品牌视觉/插画/大图/引语。
- **main (right)**（scroll）：表单或核心内容 + 主操作。

## 3. Navigation Model

无全局导航（`nav_model: none`）；聚焦单一转化目标。左右可互换。

## 4. Responsive Behavior

- **Desktop**：左右 50/50。
- **Tablet**：上下堆叠（视觉在上，内容在下）。
- **Mobile**：隐藏视觉侧，仅留内容侧。

## 5. Content Slots

- **aside**：品牌图/插画/客户引语/产品截图。
- **main**：标题、表单/说明、CTA、次链接。

## 6. Best-fit Scenarios

- 适合：登录/注册、品牌故事、产品对比、强转化落地。
- 不适合：信息量大的多区页面（用 stacked/holy-grail）。

## 7. Composition with Style

风格在视觉侧尽情表达品牌（大图/渐变/色块），内容侧保持克制专注；两侧对比是设计张力来源。

## 8. Anti-patterns

- 两侧都强视觉，注意力争抢。
- 移动端保留大视觉侧，把表单挤到屏幕下方。
