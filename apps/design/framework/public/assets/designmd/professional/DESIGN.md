---
id: professional
source: crawled
source_url: https://github.com/nexu-io/open-design/blob/main/design-systems/professional/DESIGN.md
source_date: '2026-05-01'
title: Design System Inspired by Professional
summary: Polished, business-ready design with modern typography, structured layouts,
  and a trustworthy visual identity.
ingested_at: '2026-08-01T02:27:30+08:00'
status: cleaned
tags:
- spec
- light
- corporate
- minimal
- professional
- flat
tags_content_hash: 850aa8e86c4dcf1a1cc1428ad45e4706c5f8d017b731ac3790710cb39c057fad
category: spec
design_domain:
- UI
author: nexu-io
origin_site: open-design
source_commit: 517f39acde402c1a7af2189167a8d6957a3dac71
source_item_path: design-systems/professional/DESIGN.md
content_hash: c3c652fdf2c08441088b79b859ed0e25a48c0bcd679333b7bc909e7199e61cb6
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

# Design System Inspired by Professional

> Category: Professional & Corporate
> Polished, business-ready design with modern typography, structured layouts, and a trustworthy visual identity.

## 1. Visual Theme & Atmosphere

Polished, business-ready design with modern typography, structured layouts, and a trustworthy visual identity.

- **Visual style:** modern
- **Color stance:** primary, secondary, neutral, success, warning, danger
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#FECE14` — Token from style foundations.
- **Secondary:** `#000000` — Token from style foundations.
- **Success:** `#16A34A` — Token from style foundations.
- **Warning:** `#D97706` — Token from style foundations.
- **Danger:** `#DC2626` — Token from style foundations.
- **Surface:** `#FFFFFF` — Token from style foundations.
- **Text:** `#111827` — Token from style foundations.
- **Neutral:** `#FFFFFF` — Derived from the surface token for official format compatibility.

- Favor Primary (#FECE14) for CTA emphasis.
- Use Surface (#FFFFFF) for large backgrounds and cards.
- Keep body copy on Text (#111827) for legibility.

## 3. Typography

- **Scale:** mobile-first compact scale
- **Families:** primary=Poppins, display=Poppins, mono=IBM Plex Mono
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

- Buttons: primary action uses `#FECE14`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#FECE14) as the interaction signal.
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
