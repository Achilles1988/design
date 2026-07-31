---
id: enterprise
source: crawled
source_url: https://github.com/nexu-io/open-design/blob/main/design-systems/enterprise/DESIGN.md
source_date: '2026-05-01'
title: Design System Inspired by Enterprise
summary: Clean, high-contrast enterprise design for data-driven workflows with intuitive
  drag-and-drop patterns and structured layouts.
ingested_at: '2026-08-01T02:27:30+08:00'
status: cleaned
tags:
- spec
- light
- corporate
- flat
- high-contrast
- dense
- geometric
tags_content_hash: 1cc87ec1229daa80e1c9a71733db7cad3d8a67cd768e454d5aa2ed54af20a16d
category: spec
design_domain:
- UI
author: nexu-io
origin_site: open-design
source_commit: 517f39acde402c1a7af2189167a8d6957a3dac71
source_item_path: design-systems/enterprise/DESIGN.md
content_hash: 13b943a0c0de43ac84bbb0951ae13f7d613d2cbf2279ff08e0ced3e187b11cf7
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

# Design System Inspired by Enterprise

> Category: Professional & Corporate
> Clean, high-contrast enterprise design for data-driven workflows with intuitive drag-and-drop patterns and structured layouts.

## 1. Visual Theme & Atmosphere

Clean, high-contrast enterprise design for data-driven workflows with intuitive drag-and-drop patterns and structured layouts.

- **Visual style:** clean, high-contrast, enterprise
- **Color stance:** primary, success, warning, danger
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#072C2C` — Token from style foundations.
- **Secondary:** `#FF5F03` — Token from style foundations.
- **Success:** `#16A34A` — Token from style foundations.
- **Warning:** `#D97706` — Token from style foundations.
- **Danger:** `#DC2626` — Token from style foundations.
- **Surface:** `#EDEADE` — Token from style foundations.
- **Text:** `#111827` — Token from style foundations.
- **Neutral:** `#EDEADE` — Derived from the surface token for official format compatibility.

- Favor Primary (#072C2C) for CTA emphasis.
- Use Surface (#EDEADE) for large backgrounds and cards.
- Keep body copy on Text (#111827) for legibility.

## 3. Typography

- **Scale:** desktop-first expressive scale
- **Families:** primary=Ubuntu, display=Oswald, mono=Ubuntu Mono
- **Weights:** 100, 200, 300, 400, 500, 600, 700, 800, 900
- Headings should carry the style personality; body text should optimize scanability and contrast.

## 4. Spacing & Grid

- **Spacing scale:** comfortable density mode
- Keep vertical rhythm consistent across sections and components.
- Align columns and modules to a predictable grid; avoid ad-hoc offsets.

## 5. Layout & Composition

- Prefer clear content blocks with consistent internal padding.
- Keep hierarchy obvious: headline → support text → primary action.
- Use whitespace to separate concerns before adding borders or shadows.

## 6. Components

- Buttons: primary action uses `#072C2C`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#072C2C) as the interaction signal.
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
