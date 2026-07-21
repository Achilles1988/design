## Overview

This repo hosts `apps/design`, a local Vite + React (TS) engineering app for managing design packages on disk — creating apps, adding pages, and previewing page modules via a `design-fs` dev-only filesystem API. UI/behavior conventions live under the design project on disk and `docs/dev`, plus `docs/product`; project guidance requires reading these before development work.

## Lessons

MUST read and follow `.wn-ai/lessons/lesson.md` before acting in this project.
Do not invent conflicting rules; if unsure, ask.



## Dev Documentation

- MUST read docs/dev/conventions/glossary.md during Code Review (including CR)
- MUST read docs/dev/conventions/coding-standards.md before writing any code
- MUST follow docs/dev/conventions/mandatory.md for the entire development workflow
- When adding or expanding a public API, protocol, or config surface, leave verifiable notes under `docs/dev/api/` in the same change. Never ship code without the matching docs
- When `docs/dev/api/` already covers the topic, implement and call exactly as documented. On conflict, update the docs first, then the code. Never invent behavior from habit

- Superpowers artifacts output: docs/dev/superpowers
- Superpowers design specs output: docs/dev/superpowers/specs/
- Superpowers implementation plans output: docs/dev/superpowers/plans/

```shell
docs/dev
├── api/                         # 公共 API、协议与配置面说明
├── conventions/                 # 术语表、编码规范与强制流程
└── superpowers/                 # Superpowers 产物（specs/、plans/）
```

## Product Documentation

Related module work must read module docs first.

```shell
docs/product
```

## Commands

```shell
# Design App — discover via design.project.json marker; path may differ when installed elsewhere
apps/design    # location in this repo
npm run dev       # dev
npm run test      # test
npm run preview   # prod
npm run build     # package
```
