# Design App Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one SVG mark for Design Engineering as favicon and sidebar logo.

**Architecture:** Single master SVG in Vite `publicDir`; HTML favicon link + sidebar `<img>` both point at `/icon.svg`. No second colorway, no ICO.

**Tech Stack:** SVG, Vite public assets, React sidebar shell.

## Global Constraints

- Primary fill `#0c5cab`; glyph white only
- Concept: canvas frame + pipeline polyline + nodes (design in eng workflow)
- Must remain legible at 16×16
- Spec: `docs/dev/superpowers/specs/2026-07-25-design-app-icon-design.md`

---

## File map

| File | Role |
|------|------|
| `apps/design/framework/public/icon.svg` | Master mark |
| `apps/design/index.html` | Favicon link |
| `apps/design/framework/src/shell/SidebarShell.tsx` | Replace 「D」 with img |
| `apps/design/framework/src/shell/SidebarShell.css` | Logo box: no solid bg fill (SVG is the tile) |

---

### Task 1: Create master SVG

- [x] Create `apps/design/framework/public/icon.svg` (32×32 viewBox): rounded primary square, white open canvas frame left-center, pipeline polyline with mid + end nodes
- [x] Open the file / preview at 16 and 32 to confirm frame+line+dots read clearly

### Task 2: Wire favicon and sidebar

- [x] Add `<link rel="icon" href="/icon.svg" type="image/svg+xml" />` to `apps/design/index.html`
- [x] In `SidebarShell.tsx`, replace letter 「D」 with `<img src="/icon.svg" alt="" width={30} height={30} />` inside `.sidebar-shell__logo` (keep `aria-hidden` on the logo container)
- [x] Update `.sidebar-shell__logo` CSS: remove solid `background` / white text styles so the SVG fills the 30×30 box (`overflow: hidden` + `border-radius` optional if SVG already has rounded corners — prefer SVG corners, CSS `border-radius: 0` / transparent bg)

### Task 3: Verify

- [x] Confirm `/icon.svg` is reachable under Vite publicDir
- [x] Spot-check sidebar brand area markup

---
