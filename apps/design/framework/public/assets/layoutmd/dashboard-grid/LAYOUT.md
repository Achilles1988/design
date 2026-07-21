---
id: dashboard-grid
source: manual
title: Dashboard Grid
summary: 顶栏 + 卡片/图表网格的数据总览外壳（BI 仪表盘）。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: focused
nav_model: top
columns: 4
regions:
  - {area: header, position: top, behavior: fixed}
  - {area: main, behavior: scroll}
scene_tags: [dashboard, bi, analytics, monitoring, overview, kpi]
responsive: {tablet: grid-2col, mobile: grid-1col}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Dashboard Grid

> Family: focused
> 顶栏 + 卡片/图表网格的数据总览外壳（BI 仪表盘）。

## 1. Structure Overview

顶栏放标题与时间范围/筛选，主区是自适应的卡片/图表网格：顶部一排 KPI 指标卡，下方是不同尺寸的图表卡片（可跨列跨行）。

```
┌─────────────────────────────┐
│      header + date range    │  ← fixed
├────┬────┬────┬──────────────┤
│KPI │KPI │KPI │ KPI          │  ← 指标卡
├────┴────┼───┴──────────────┤
│ chart   │   chart           │
├─────────┴───────────────────┤
│ chart (宽)                   │
└─────────────────────────────┘
```

## 2. Regions

- **header**（top · fixed）：标题、时间范围、筛选、刷新/导出。
- **main**（scroll）：KPI 指标卡 + 图表卡片网格，卡片可跨列。

## 3. Navigation Model

顶栏导航（`nav_model: top`）；常与 sidebar-shell 组合（此处聚焦网格内容区本身）。交互以筛选/下钻为主。

## 4. Responsive Behavior

- **Desktop**：4 列指标 + 多列图表。
- **Tablet**：2 列。
- **Mobile**：单列纵向堆叠。

## 5. Content Slots

- **header**：标题、时间选择、筛选、操作。
- **main**：KPI 卡（数值 + 趋势）、折线/柱/饼图卡、表格卡。

## 6. Best-fit Scenarios

- 适合：数据总览、BI 仪表盘、监控大盘、KPI 概览。
- 不适合：以录入/流程为主的页面（用 sidebar-shell / wizard）。

## 7. Composition with Style

风格作用于卡片、数据可视化配色与指标层级；需保证图表可读性优先于装饰。

## 8. Anti-patterns

- 卡片尺寸随意导致网格凌乱。
- 图表配色过多、缺乏数据墨水比意识。
