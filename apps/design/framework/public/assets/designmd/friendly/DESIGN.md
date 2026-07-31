---
id: friendly
source: crawled
source_url: https://github.com/nexu-io/open-design/blob/main/design-systems/friendly/DESIGN.md
source_date: '2026-05-01'
title: Design System Inspired by Friendly
summary: Approachable, intuitive design with rounded elements, ample whitespace, and
  soft pastel color palettes.
ingested_at: '2026-08-01T02:27:30+08:00'
status: cleaned
tags:
- spec
- light
- soft
- rounded
- playful
- colorful
- airy
tags_content_hash: a53f553b77f2d61a9ad97ca725f65eb68e20942f32e7dffafbf5d7d27f09aa7e
category: spec
design_domain:
- UI
author: nexu-io
origin_site: open-design
source_commit: 517f39acde402c1a7af2189167a8d6957a3dac71
source_item_path: design-systems/friendly/DESIGN.md
content_hash: 837c798e10342a6e1281fdeeb05fc80ce4b74d1467543155bf6db13c935c4ce2
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

# Design System Inspired by Friendly

> Category: Creative & Artistic
> Approachable, intuitive design with rounded elements, ample whitespace, and soft pastel color palettes.

## 1. Visual Theme & Atmosphere

Approachable, intuitive design with rounded elements, ample whitespace, and soft pastel color palettes.

- **Visual style:** bold, playful, premium
- **Color stance:** primary, secondary, neutral
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#F2D9DC` — Token from style foundations.
- **Secondary:** `#D9F2D8` — Token from style foundations.
- **Success:** `#16A34A` — Token from style foundations.
- **Warning:** `#D97706` — Token from style foundations.
- **Danger:** `#DC2626` — Token from style foundations.
- **Surface:** `#FFFFFF` — Token from style foundations.
- **Text:** `#111827` — Token from style foundations.
- **Neutral:** `#FFFFFF` — Derived from the surface token for official format compatibility.

- Favor Primary (#F2D9DC) for CTA emphasis.
- Use Surface (#FFFFFF) for large backgrounds and cards.
- Keep body copy on Text (#111827) for legibility.

## 3. Typography

- **Scale:** 14/16/18/24/32/40
- **Families:** primary=Noto Serif Display, display=Noto Serif Display, mono=Space Mono
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

- Buttons: primary action uses `#F2D9DC`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#F2D9DC) as the interaction signal.
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
