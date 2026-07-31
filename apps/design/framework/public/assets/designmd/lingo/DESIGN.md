---
id: lingo
source: crawled
source_url: https://github.com/nexu-io/open-design/blob/main/design-systems/lingo/DESIGN.md
source_date: '2026-05-01'
title: Design System Inspired by Lingo
summary: Playful, minimal design with bright colors, rounded shapes, tactile 3D borders,
  and friendly illustrations for approachable interfaces.
ingested_at: '2026-08-01T02:27:30+08:00'
status: cleaned
tags:
- spec
- light
- playful
- rounded
- colorful
- 3d
- soft
- illustrated
tags_content_hash: abf47aa24045639a6eb360dd9f572b60b4838b0269af9e64810957ac734e4a1c
category: spec
design_domain:
- UI
author: nexu-io
origin_site: open-design
source_commit: 517f39acde402c1a7af2189167a8d6957a3dac71
source_item_path: design-systems/lingo/DESIGN.md
content_hash: 9d86b1386ecc5d568e5b708b442aa126a6405d94f3b15087b4b75d0c040af4c0
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

# Design System Inspired by Lingo

> Category: Creative & Artistic
> Playful, minimal design with bright colors, rounded shapes, tactile 3D borders, and friendly illustrations for approachable interfaces.

## 1. Visual Theme & Atmosphere

Playful, minimal design with bright colors, rounded shapes, tactile 3D borders, and friendly illustrations for approachable interfaces.

- **Visual style:** bold, playful
- **Color stance:** primary, neutral, success, warning, danger
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#58CC02` — Token from style foundations.
- **Secondary:** `#CE82FF` — Token from style foundations.
- **Success:** `#58CC02` — Token from style foundations.
- **Warning:** `#FFC800` — Token from style foundations.
- **Danger:** `#FF4B4B` — Token from style foundations.
- **Surface:** `#FFFFFF` — Token from style foundations.
- **Text:** `#3C3C3C` — Token from style foundations.
- **Neutral:** `#FFFFFF` — Derived from the surface token for official format compatibility.

- Favor Primary (#58CC02) for CTA emphasis.
- Use Surface (#FFFFFF) for large backgrounds and cards.
- Keep body copy on Text (#3C3C3C) for legibility.

## 3. Typography

- **Scale:** 12/14/16/20/24/32
- **Families:** primary=Nunito, display=Nunito, mono=JetBrains Mono
- **Weights:** 400, 500, 600, 700, 800, 900
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

- Buttons: primary action uses `#58CC02`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#58CC02) as the interaction signal.
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
