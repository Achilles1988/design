---
id: master-detail
source: manual
title: Master-Detail / Split
summary: 左列表 + 右详情，两侧各自独立滚动的分栏外壳。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: multi-pane
nav_model: side
columns: 2
regions:
  - {area: header, position: top, behavior: fixed}
  - {area: list, position: left, behavior: scroll}
  - {area: detail, behavior: scroll}
scene_tags: [settings, backoffice-detail, records, tickets, contacts]
responsive: {tablet: list-collapse, mobile: list-then-detail}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Master-Detail / Split

> Family: multi-pane
> 左列表 + 右详情，两侧各自独立滚动的分栏外壳。

## 1. Structure Overview

左侧是条目列表（master），右侧是所选条目的详情（detail），两栏各自独立滚动，选中项联动右侧。

```
┌─────────────────────────────┐
│           header            │  ← fixed
├───────────┬─────────────────┤
│  list  ↓  │    detail  ↓     │
│  (选中项) │   (对应内容)     │
└───────────┴─────────────────┘
```

## 2. Regions

- **header**（top · fixed）：标题、筛选、新建。
- **list (left)**（scroll）：条目列表，含选中态。
- **detail**（scroll）：选中条目的完整内容/表单。

## 3. Navigation Model

以"选择 → 查看"为核心：左列表既是导航也是内容索引；`nav_model: side`。

## 4. Responsive Behavior

- **Desktop**：列表与详情并列。
- **Tablet**：列表可收窄。
- **Mobile**：先展示列表，点选后进入详情（两级页面）。

## 5. Content Slots

- **header**：搜索、筛选、批量操作。
- **list**：条目行（标题 + 摘要 + 状态）。
- **detail**：详情字段、编辑表单、关联信息。

## 6. Best-fit Scenarios

- 适合：设置页、后台详情、记录管理、工单、联系人。
- 不适合：无"列表-详情"关系的场景（用 sidebar-shell）。

## 7. Composition with Style

风格重点在列表选中态与列表/详情的分区；两栏留白与分隔线决定清晰度。

## 8. Anti-patterns

- 选中态不明显，不知当前查看的是哪条。
- 详情栏内容过少，浪费大量空间。
