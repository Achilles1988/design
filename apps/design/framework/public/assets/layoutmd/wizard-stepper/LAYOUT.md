---
id: wizard-stepper
source: manual
title: Wizard / Stepper
summary: 分步流程外壳，进度指示 + 单步内容 + 上一步/下一步。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: focused
nav_model: none
columns: 1
regions:
  - {area: header, position: top, behavior: fixed}
  - {area: main, behavior: scroll}
  - {area: footer, position: bottom, behavior: fixed}
scene_tags: [checkout, onboarding, account-setup, multi-step-form, survey]
responsive: {tablet: same, mobile: compact-stepper}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Wizard / Stepper

> Family: focused
> 分步流程外壳，进度指示 + 单步内容 + 上一步/下一步。

## 1. Structure Overview

顶部（或左侧）是步骤进度指示，中间是当前步骤的内容（表单/选择），底部固定操作条放"上一步/下一步/完成"。聚焦线性完成一个流程。

```
┌──────────────────────┐
│ ①──②──③──④ 进度       │  ← header (stepper) fixed
├──────────────────────┤
│      main  ↓          │  ← 当前步骤内容
├──────────────────────┤
│      [上一步] [下一步] │  ← footer fixed
└──────────────────────┘
```

## 2. Regions

- **header**（top · fixed）：步骤进度指示（当前/已完成/未完成）。
- **main**（scroll）：当前步骤的表单/内容，居中限宽。
- **footer**（bottom · fixed）：上一步/下一步/取消/完成。

## 3. Navigation Model

线性导航（`nav_model: none`，无全局导航）：仅在步骤间前进/后退，可点已完成步骤回跳。

## 4. Responsive Behavior

- **Desktop**：横向 stepper + 居中内容。
- **Tablet**：同上。
- **Mobile**：stepper 压缩为"第 n / 共 m 步"或竖排。

## 5. Content Slots

- **header**：步骤标题与序号、进度。
- **main**：当前步骤字段/选项/说明。
- **footer**：导航按钮、进度百分比。

## 6. Best-fit Scenarios

- 适合：结账、开户/实名、账户初始化、多步表单、问卷、安装向导。
- 不适合：可自由跳转的非线性任务（用 tabs 或 sidebar）。

## 7. Composition with Style

风格重点在 stepper 状态（当前/完成/待办）与主 CTA；进度可视化是核心信号。

## 8. Anti-patterns

- 步骤过多且无进度预期，用户中途放弃。
- 不能回退修改上一步。
