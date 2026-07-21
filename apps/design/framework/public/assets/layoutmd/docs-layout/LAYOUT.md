---
id: docs-layout
source: manual
title: Docs Layout
summary: 左侧目录树 + 中间正文 + 右侧页内 TOC，文档站/知识库的三栏阅读外壳。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: multi-pane
nav_model: side
columns: 3
regions:
  - {area: header, position: top, behavior: fixed}
  - {area: sidebar, position: left, behavior: scroll}
  - {area: main, behavior: scroll}
  - {area: aside, position: right, behavior: fixed}
scene_tags: [docs, knowledge-base, api-reference, handbook, wiki]
responsive: {tablet: hide-toc, mobile: sidebar-drawer}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Docs Layout

> Family: multi-pane
> 左侧目录树 + 中间正文 + 右侧页内 TOC，文档站/知识库的三栏阅读外壳。

## 1. Structure Overview

顶栏固定含搜索；左栏是全站目录树（可折叠分组），中栏为正文（限宽阅读），右栏是当前页的页内锚点目录（TOC）。

```
┌─────────────────────────────┐
│        header + search      │  ← fixed
├──────┬───────────────┬──────┤
│ tree │     main      │ toc  │
│ (目录)│    正文  ↓    │(锚点) │
└──────┴───────────────┴──────┘
```

## 2. Regions

- **header**（top · fixed）：logo、版本切换、搜索。
- **sidebar (left)**（scroll）：全站文档目录树。
- **main**（scroll）：正文，限宽利于阅读。
- **aside (right)**（fixed）：本页 TOC（H2/H3 锚点），随滚动高亮。

## 3. Navigation Model

三级信息导航：header 全局/搜索、左栏跨页目录树、右栏页内锚点。`nav_model: side`（以左侧目录为主）。

## 4. Responsive Behavior

- **Desktop**：三栏齐全。
- **Tablet**：隐藏右侧 TOC。
- **Mobile**：左侧目录树收进抽屉，TOC 移到正文顶部折叠。

## 5. Content Slots

- **sidebar**：目录树、分组、版本。
- **main**：标题、正文、代码块、上一页/下一页。
- **aside**：页内锚点导航。

## 6. Best-fit Scenarios

- 适合：产品文档、知识库、API 参考、团队手册、Wiki。
- 不适合：单篇短文（用 top-nav-centered）、应用后台（用 sidebar-shell）。

## 7. Composition with Style

风格重点在正文排版（代码块、表格、引用）与目录/TOC 的层级、当前项高亮；阅读体验优先。

## 8. Anti-patterns

- 目录树层级过深无法快速定位。
- 正文不限宽，代码块与长段落难读。
