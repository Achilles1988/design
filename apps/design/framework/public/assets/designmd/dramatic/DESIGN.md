---
id: dramatic
source: crawled
source_url: https://github.com/nexu-io/open-design/blob/main/design-systems/dramatic/DESIGN.md
source_date: '2026-05-01'
title: Design System Inspired by Dramatic
summary: High-contrast, theatrical design with bold layouts, immersive visuals, and
  unconventional compositions that command attention.
ingested_at: '2026-08-01T02:27:30+08:00'
status: cleaned
tags:
- spec
- light
- dark
- high-contrast
- maximalist
- dramatic
- bold
tags_content_hash: a6b42deb0d6c56de7c934affaf9c257d8c5f792b6a5bc7fb553b9abb542da8c7
category: spec
design_domain:
- UI
author: nexu-io
origin_site: open-design
source_commit: 517f39acde402c1a7af2189167a8d6957a3dac71
source_item_path: design-systems/dramatic/DESIGN.md
content_hash: 40756ea224d42ae4a579cc6c771226b0d9d20e48b953f49e221dfd1382791d16
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

# Design System Inspired by Dramatic

> Category: Bold & Expressive
> High-contrast, theatrical design with bold layouts, immersive visuals, and unconventional compositions that command attention.

## 1. Visual Theme & Atmosphere

High-contrast, theatrical design with bold layouts, immersive visuals, and unconventional compositions that command attention.

- **Visual style:** modern, clean, high-contrast
- **Color stance:** primary, neutral, success, warning, danger
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#8B5CF6` — Token from style foundations.
- **Secondary:** `#F43F5E` — Token from style foundations.
- **Success:** `#16A34A` — Token from style foundations.
- **Warning:** `#D97706` — Token from style foundations.
- **Danger:** `#DC2626` — Token from style foundations.
- **Surface:** `#09090B` — Token from style foundations.
- **Text:** `#FAFAFA` — Token from style foundations.
- **Neutral:** `#09090B` — Derived from the surface token for official format compatibility.

- Favor Primary (#8B5CF6) for CTA emphasis.
- Use Surface (#09090B) for large backgrounds and cards.
- Keep body copy on Text (#FAFAFA) for legibility.

## 3. Typography

- **Scale:** 12/14/16/20/24/32
- **Families:** primary=Outfit, display=Outfit, mono=JetBrains Mono
- **Weights:** 400, 900
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

- Buttons: primary action uses `#8B5CF6`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#8B5CF6) as the interaction signal.
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
