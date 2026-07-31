---
id: bento
source: crawled
source_url: https://github.com/nexu-io/open-design/blob/main/design-systems/bento/DESIGN.md
source_date: '2026-05-01'
title: Design System Inspired by Bento
summary: Modular grid layout with card-like blocks, clear hierarchy, soft spacing,
  and subtle visual contrast for organized, scannable interfaces.
ingested_at: '2026-08-01T02:27:30+08:00'
status: cleaned
tags:
- spec
- light
- minimal
- geometric
- flat
- soft
- rounded
tags_content_hash: ba839605ce432160a98ffc61ea38eb82e5ce79fb98808e0308a941daecec1a09
category: spec
design_domain:
- UI
author: nexu-io
origin_site: open-design
source_commit: 517f39acde402c1a7af2189167a8d6957a3dac71
source_item_path: design-systems/bento/DESIGN.md
content_hash: ee9bf8da9e4f7615e22d4417a39540891b9312ce63b318ce480dfb6441ca8f59
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

# Design System Inspired by Bento

> Category: Layout & Structure
> Modular grid layout with card-like blocks, clear hierarchy, soft spacing, and subtle visual contrast for organized, scannable interfaces.

## 1. Visual Theme & Atmosphere

Modular grid layout with card-like blocks, clear hierarchy, soft spacing, and subtle visual contrast for organized, scannable interfaces.

- **Visual style:** modern, clean
- **Color stance:** primary, neutral, success, warning, danger
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#FAD4C0` — Token from style foundations.
- **Secondary:** `#80A1C1` — Token from style foundations.
- **Success:** `#16A34A` — Token from style foundations.
- **Warning:** `#D97706` — Token from style foundations.
- **Danger:** `#DC2626` — Token from style foundations.
- **Surface:** `#FFF5E6` — Token from style foundations.
- **Text:** `#111827` — Token from style foundations.
- **Neutral:** `#FFF5E6` — Derived from the surface token for official format compatibility.

- Favor Primary (#FAD4C0) for CTA emphasis.
- Use Surface (#FFF5E6) for large backgrounds and cards.
- Keep body copy on Text (#111827) for legibility.

## 3. Typography

- **Scale:** 12/14/16/20/24/32
- **Families:** primary=Inter, display=Inter, mono=JetBrains Mono
- **Weights:** 100, 200, 300, 400, 500, 600, 700, 800, 900
- Headings should carry the style personality; body text should optimize scanability and contrast.

## 4. Spacing & Grid

- **Spacing scale:** 4/8/12/16/24/32
- Keep vertical rhythm consistent across sections and components.
- Align columns and modules to a predictable grid; avoid ad-hoc offsets.

## 5. Layout & Composition

- Prefer clear content blocks with consistent internal padding.
- Keep hierarchy obvious: headline → support text → primary action.
- Use whitespace to separate concerns before adding borders or shadows.

## 6. Components

- Buttons: primary action uses `#FAD4C0`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#FAD4C0) as the interaction signal.
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
