---
id: centered-single
source: manual
title: Centered Single Column
summary: 居中窄栏、无侧导航的专注型外壳，用于登录/表单/阅读。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: focused
nav_model: none
columns: 1
regions:
  - {area: main, behavior: scroll}
scene_tags: [auth, login, signup, form, onboarding, reading]
responsive: {tablet: same, mobile: full-width-padding}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Centered Single Column

> Family: focused
> 居中窄栏、无侧导航的专注型外壳，用于登录/表单/阅读。

## 1. Structure Overview

无全局导航干扰，一个居中的窄容器承载全部内容（卡片/表单/正文），上下左右留白，聚焦单一任务。

```
┌──────────────────────┐
│                      │
│      ┌────────┐      │
│      │  main  │      │  ← 居中窄容器
│      └────────┘      │
│                      │
└──────────────────────┘
```

## 2. Regions

- **main**（scroll）：居中容器，含 logo、标题、表单/内容、主操作。

## 3. Navigation Model

无全局导航（`nav_model: none`）；顶多有返回/切换链接。刻意减少干扰以聚焦当前任务。

## 4. Responsive Behavior

- **Desktop**：窄卡片居中，四周留白。
- **Tablet**：同上，容器略窄于屏。
- **Mobile**：容器占满，保留舒适内边距。

## 5. Content Slots

- **main**：品牌 logo、标题/说明、表单字段或正文、主 CTA、次链接。

## 6. Best-fit Scenarios

- 适合：登录/注册、找回密码、单步表单、onboarding、专注阅读、空状态。
- 不适合：需要持续导航的应用（用 sidebar/stacked）。

## 7. Composition with Style

风格几乎全部落在这一个卡片/容器上：圆角、阴影、留白、按钮，是风格的高浓度展示位。

## 8. Anti-patterns

- 在专注页塞入无关导航/广告。
- 容器过宽失去"聚焦"意义。
