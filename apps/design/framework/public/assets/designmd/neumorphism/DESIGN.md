---
id: neumorphism
source: crawled
source_url: https://github.com/nexu-io/open-design/blob/main/design-systems/neumorphism/DESIGN.md
source_date: '2026-05-01'
title: Design System Inspired by Neumorphism
summary: Soft, extruded UI elements with inner and outer shadows on monochromatic
  surfaces for a tactile, embedded look.
ingested_at: '2026-08-01T02:27:30+08:00'
status: cleaned
tags:
- spec
- light
- neumorphism
- soft
- monochrome
- minimal
- muted
tags_content_hash: 1733d9e3a9816833c56ca74fa51faf67c029af45fa7dea6a9cbf5920545b2f5f
category: spec
design_domain:
- UI
author: nexu-io
origin_site: open-design
source_commit: 517f39acde402c1a7af2189167a8d6957a3dac71
source_item_path: design-systems/neumorphism/DESIGN.md
content_hash: e0dbc739d3ddedcc43e04462a29cedb4ab97ab4fc4c68c7692fbdbf853334863
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

# Design System Inspired by Neumorphism

> Category: Morphism & Effects
> Soft, extruded UI elements with inner and outer shadows on monochromatic surfaces for a tactile, embedded look.

## 1. Visual Theme & Atmosphere

Soft, extruded UI elements with inner and outer shadows on monochromatic surfaces for a tactile, embedded look.

- **Visual style:** minimal, clean, high-contrast, playful, matrix
- **Color stance:** primary, secondary, success, warning, danger, info
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#006666` — Token from style foundations.
- **Secondary:** `#F1F2F5` — Token from style foundations.
- **Success:** `#00A63D` — Token from style foundations.
- **Warning:** `#FE9900` — Token from style foundations.
- **Danger:** `#FF2157` — Token from style foundations.
- **Surface:** `#E7E5E4` — Token from style foundations.
- **Text:** `#1E2938` — Token from style foundations.
- **Neutral:** `#E7E5E4` — Derived from the surface token for official format compatibility.

- Favor Primary (#006666) for CTA emphasis.
- Use Surface (#E7E5E4) for large backgrounds and cards.
- Keep body copy on Text (#1E2938) for legibility.

## 3. Typography

- **Scale:** desktop-first expressive scale
- **Families:** primary=Space Mono, display=Space Mono, mono=JetBrains Mono
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

- Buttons: primary action uses `#006666`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#006666) as the interaction signal.
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
