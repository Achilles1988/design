---
id: full-bleed-hero
source: manual
title: Full-bleed Hero
summary: 全出血英雄区 + 分段滚动的营销落地外壳。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: focused
nav_model: top
columns: 1
regions:
  - {area: header, position: top, behavior: sticky}
  - {area: main, behavior: scroll}
  - {area: footer, position: bottom, behavior: scroll}
scene_tags: [landing, marketing, product-launch, campaign, brand]
responsive: {tablet: stack-sections, mobile: single-column}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Full-bleed Hero

> Family: focused
> 全出血英雄区 + 分段滚动的营销落地外壳。

## 1. Structure Overview

首屏是通栏（full-bleed）大英雄区（大图/大标题/CTA），向下是一段段全宽内容区块（特性/社会证明/价格/CTA），顶栏透明或吸附。

```
┌──────────────────────┐
│ header (透明/吸附)    │
│░░░░░ HERO 全出血 ░░░░░│
├──────────────────────┤
│      section  ↓       │
├──────────────────────┤
│      section          │
├──────────────────────┤
│      footer           │
└──────────────────────┘
```

## 2. Regions

- **header**（top · sticky）：透明起、滚动后吸附变实。
- **main**（scroll）：Hero + 多个全宽分段区块。
- **footer**（bottom · scroll）：链接、订阅、法律。

## 3. Navigation Model

顶部导航（`nav_model: top`），常配锚点跳转到各分段区块。以转化为目标。

## 4. Responsive Behavior

- **Desktop**：Hero 大幅通栏，分段左右可分栏。
- **Tablet**：分段内分栏减少。
- **Mobile**：全部单列堆叠，Hero 高度收敛。

## 5. Content Slots

- **header**：logo、导航、主 CTA。
- **main**：Hero（标题/副标/CTA/大图）、特性区、证言、价格、结尾 CTA。
- **footer**：链接组、订阅、社媒。

## 6. Best-fit Scenarios

- 适合：产品官网首页、发布/活动落地页、品牌站。
- 不适合：应用型界面、信息检索类（用 stacked/sidebar）。

## 7. Composition with Style

风格在 Hero 与各分段的视觉表达上最放得开（大字体、渐变、动效）；是展示强视觉风格的旗舰骨架。

## 8. Anti-patterns

- Hero 信息过载，CTA 不明确。
- 分段之间节奏雷同，缺乏视觉起伏。
