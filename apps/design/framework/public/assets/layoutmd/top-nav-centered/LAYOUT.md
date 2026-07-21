---
id: top-nav-centered
source: manual
title: Top-nav + Centered Container
summary: 顶栏 + 居中窄栏正文，专注长文阅读的内容详情外壳。
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
scene_tags: [blog, article, docs-article, content-detail, reading]
responsive: {tablet: full-width, mobile: hamburger-menu}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Top-nav + Centered Container

> Family: stacked
> 顶栏 + 居中窄栏正文，专注长文阅读的内容详情外壳。

## 1. Structure Overview

顶栏固定，正文用更窄的阅读容器（约 640–760px）居中，最大化可读性；两侧留白。

```
┌──────────────────────┐
│        header        │  ← fixed
├──────────────────────┤
│      ┌────────┐      │
│      │  main  │  ↓   │  ← 窄栏居中，scroll
│      └────────┘      │
└──────────────────────┘
```

## 2. Regions

- **header**（top · fixed）：logo + 轻量导航，常含阅读进度条。
- **main**（scroll）：窄栏正文，行长受控，含标题、正文、图片。

## 3. Navigation Model

顶部单层导航为主，正文内可有浮动的页内小目录（可选），但不占独立栏。

## 4. Responsive Behavior

- **Desktop**：正文居中窄栏，两侧大留白。
- **Tablet**：容器适度加宽。
- **Mobile**：容器占满，左右留最小内边距。

## 5. Content Slots

- **header**：品牌、返回、分享/阅读进度。
- **main**：文章标题、作者/日期、正文富文本、配图、结尾 CTA。

## 6. Best-fit Scenarios

- 适合：博客文章、新闻详情、单篇文档、帮助文章、阅读类页面。
- 不适合：需要侧边目录树的大型文档（改用 docs-layout）、列表/网格页（改用 top-nav-feed-grid）。

## 7. Composition with Style

风格重点在正文排版 token（字体、字号阶、行高、链接色）；窄栏结构让排版风格成为主角。

## 8. Anti-patterns

- 行长过宽（超过约 75 字符）降低阅读效率。
- 在窄栏里强塞多栏内容。
