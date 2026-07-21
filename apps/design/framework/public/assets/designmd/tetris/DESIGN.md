---
id: tetris
source: crawled
source_url: https://github.com/nexu-io/open-design/blob/main/design-systems/tetris/DESIGN.md
source_date: '2026-05-01'
title: Design System Inspired by Tetris
summary: Classic block-game inspired design with playful colors, bold display fonts,
  and compact, high-energy layouts.
ingested_at: '2026-07-06T17:00:49+02:00'
status: cleaned
tags:
- spec
category: spec
design_domain:
- UI
author: nexu-io
origin_site: open-design
source_commit: 1eb3898795861fd73db4ca027f7abdf9ce117786
source_item_path: design-systems/tetris/DESIGN.md
content_hash: 1df18ad978601796a78740a7705a41b7793fc8ad65041e46218d406b09c5dec8
preview_image: components.html
assets:
- path: components.html
  type: html_snapshot
- path: preview/colors.html
  type: html_snapshot
- path: preview/spacing.html
  type: html_snapshot
- path: preview/typography.html
  type: html_snapshot
license: Apache-2.0
---

# Design System Inspired by Tetris

> Category: Themed & Unique
> Classic block-game inspired design with playful colors, bold display fonts, and compact, high-energy layouts.

## 1. Visual Theme & Atmosphere

Classic block-game inspired design with playful colors, bold display fonts, and compact, high-energy layouts.

- **Visual style:** high-contrast, playful, premium
- **Color stance:** primary, secondary, success, warning, danger, info
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#1C202B` — Token from style foundations.
- **Secondary:** `#7107E7` — Token from style foundations.
- **Success:** `#16A34A` — Token from style foundations.
- **Warning:** `#D97706` — Token from style foundations.
- **Danger:** `#DC2626` — Token from style foundations.
- **Surface:** `#DFE7FF` — Token from style foundations.
- **Text:** `#1C398E` — Token from style foundations.
- **Neutral:** `#DFE7FF` — Derived from the surface token for official format compatibility.

- Favor Primary (#1C202B) for CTA emphasis.
- Use Surface (#DFE7FF) for large backgrounds and cards.
- Keep body copy on Text (#1C398E) for legibility.

## 3. Typography

- **Scale:** desktop-first expressive scale
- **Families:** primary=Bangers, display=Bangers, mono=JetBrains Mono
- **Weights:** 100, 200, 300, 400, 500, 600, 700, 800, 900
- Headings should carry the style personality; body text should optimize scanability and contrast.

## 4. Spacing & Grid

- **Spacing scale:** compact density mode
- Keep vertical rhythm consistent across sections and components.
- Align columns and modules to a predictable grid; avoid ad-hoc offsets.

## 5. Layout & Composition

- Prefer clear content blocks with consistent internal padding.
- Keep hierarchy obvious: headline → support text → primary action.
- Use whitespace to separate concerns before adding borders or shadows.

## 6. Components

- Buttons: primary action uses `#1C202B`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#1C202B) as the interaction signal.
- Default to short, purposeful transitions (150–250ms) with stable easing.
- Ensure hover, focus-visible, active, disabled, and loading states are explicit.

## 8. Voice & Brand

- Tone should reflect the visual style: concise, confident, and product-specific.
- Keep microcopy action-oriented and avoid generic filler language.
- Preserve the style identity in headlines while keeping UI labels literal and clear.

## 9. Anti-patterns

- Do not introduce off-palette colors when an existing token can solve the problem.
- Do not flatten hierarchy by using the same type size/weight for all text.
- Do not add decorative effects that reduce readability or accessibility.
- Do not mix unrelated visual metaphors in the same interface.
