---
id: full-screen-canvas
source: manual
title: Full-screen Canvas
summary: 全屏画布 + 浮动工具栏/面板，设计工具与地图类的沉浸外壳。
ingested_at: '2026-07-08T23:31:00+08:00'
status: cleaned
tags: [layout]
category: layout
shell_family: focused
nav_model: none
columns: 1
regions:
  - {area: main, behavior: fixed}
  - {area: toolbar, position: top, behavior: fixed}
  - {area: panel, position: left, behavior: fixed}
  - {area: panel, position: right, behavior: fixed}
scene_tags: [design-tool, map, whiteboard, editor, diagram, video-editor]
responsive: {tablet: collapsible-panels, mobile: overlay-panels}
assets:
  - {path: preview.html, type: html_snapshot}
---

# Full-screen Canvas

> Family: focused
> 全屏画布 + 浮动工具栏/面板，设计工具与地图类的沉浸外壳。

## 1. Structure Overview

画布占满整个视口作为背景，工具栏与面板以浮层形式叠加其上（左侧图层/工具、顶部菜单、右侧属性），最大化工作区。

```
┌─────────────────────────────┐
│ ▢ toolbar (浮层)             │
│┌──┐                    ┌──┐  │
││pl│      canvas        │pl│  │  ← 面板浮在画布上
│└──┘   (全屏 · main)     └──┘  │
│                              │
└─────────────────────────────┘
```

## 2. Regions

- **main**（fixed · 全屏画布）：无限画布/地图/编辑区，自身可平移缩放。
- **toolbar**（top · fixed）：菜单/模式切换/全局操作。
- **panel (left)**（fixed）：工具/图层/元素库浮层。
- **panel (right)**（fixed）：所选对象的属性/设置浮层。

## 3. Navigation Model

无传统页面导航（`nav_model: none`）；"导航"体现在画布平移缩放与面板内的层级。面板可收起以扩大画布。

## 4. Responsive Behavior

- **Desktop**：面板常驻浮层。
- **Tablet**：面板可折叠为图标/抽屉。
- **Mobile**：面板改为覆盖式浮层，按需弹出。

## 5. Content Slots

- **toolbar**：文件菜单、工具模式、缩放、协作/分享。
- **panel (left)**：图层树、组件库、工具箱。
- **panel (right)**：属性、样式、图层设置。
- **main**：画布内容。

## 6. Best-fit Scenarios

- 适合：设计工具、白板、地图、图表编辑器、视频/音频编辑器。
- 不适合：文档/表单/内容浏览（用 stacked/docs/centered）。

## 7. Composition with Style

风格作用于浮层面板与工具栏（毛玻璃/阴影/圆角），画布本身保持中性以突出内容；面板悬浮层级是关键。

## 8. Anti-patterns

- 面板占用过大挤压画布。
- 浮层遮挡关键画布区域且无法移动/收起。
