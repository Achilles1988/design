---
id: three-pane
source: manual
title: Three-pane
summary: 导航 + 列表 + 详情三栏，邮箱/IM 客户端的经典外壳。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: multi-pane
nav_model: side
columns: 3
regions:
  - {area: sidebar, position: left, behavior: fixed}
  - {area: list, position: left, behavior: scroll}
  - {area: detail, behavior: scroll}
scene_tags: [email, im, chat, feed-reader, ticketing]
responsive: {tablet: collapse-nav, mobile: progressive-drilldown}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Three-pane

> Family: multi-pane
> 导航 + 列表 + 详情三栏，邮箱/IM 客户端的经典外壳。

## 1. Structure Overview

三栏递进：最左导航（文件夹/账户），中间列表（邮件/会话），右侧详情（正文/对话），逐级钻取。

```
┌────┬──────────┬──────────────┐
│nav │  list ↓  │   detail  ↓   │
│文件夹│ (会话)  │   (内容)      │
└────┴──────────┴──────────────┘
```

## 2. Regions

- **sidebar (left)**（fixed）：文件夹/账户/标签导航。
- **list**（scroll）：当前文件夹的条目列表。
- **detail**（scroll）：选中条目的完整内容。

## 3. Navigation Model

三级钻取（nav → list → detail），是 master-detail 的加强版，前面多一层分类导航。`nav_model: side`。

## 4. Responsive Behavior

- **Desktop**：三栏并列。
- **Tablet**：折叠最左导航为图标，保留列表 + 详情。
- **Mobile**：逐级钻取（导航→列表→详情三层页面）。

## 5. Content Slots

- **sidebar**：收件箱/文件夹/标签。
- **list**：条目行（发件人 + 标题 + 时间 + 未读点）。
- **detail**：正文/对话线程 + 操作栏。

## 6. Best-fit Scenarios

- 适合：邮箱、IM/聊天、RSS 阅读器、工单系统。
- 不适合：无三级层次的内容（用 master-detail 或 sidebar-shell）。

## 7. Composition with Style

风格需处理三栏递进的视觉纵深与未读/选中态；分栏边界与列表密度是关键。

## 8. Anti-patterns

- 三栏在窄屏硬挤导致每栏都过窄。
- 未读/选中/已读状态区分不足。
