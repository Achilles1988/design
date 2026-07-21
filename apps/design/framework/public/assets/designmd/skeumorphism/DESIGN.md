---
id: skeumorphism
source: crawled
source_url: https://github.com/nexu-io/open-design/blob/main/design-systems/skeumorphism/DESIGN.md
source_date: '2026-05-01'
title: Design System Inspired by Skeumorphism
summary: Real-world mimicry with textured surfaces, 3D effects, and familiar physical
  metaphors for intuitive digital interfaces.
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
source_item_path: design-systems/skeumorphism/DESIGN.md
content_hash: 258614e400520f95a4c1d722ad5633c4a2a10be52de8e326e68837260aabd3ff
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

# Design System Inspired by Skeumorphism

> Category: Morphism & Effects
> Real-world mimicry with textured surfaces, 3D effects, and familiar physical metaphors for intuitive digital interfaces.

## 1. Visual Theme & Atmosphere

Real-world mimicry with textured surfaces, 3D effects, and familiar physical metaphors for intuitive digital interfaces.

- **Visual style:** playful
- **Color stance:** primary, secondary, neutral, success, warning, danger
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#FA3C00` — Token from style foundations.
- **Secondary:** `#F08321` — Token from style foundations.
- **Success:** `#16A34A` — Token from style foundations.
- **Warning:** `#D97706` — Token from style foundations.
- **Danger:** `#DC2626` — Token from style foundations.
- **Surface:** `#FFFFFF` — Token from style foundations.
- **Text:** `#111827` — Token from style foundations.
- **Neutral:** `#FFFFFF` — Derived from the surface token for official format compatibility.

- Favor Primary (#FA3C00) for CTA emphasis.
- Use Surface (#FFFFFF) for large backgrounds and cards.
- Keep body copy on Text (#111827) for legibility.

## 3. Typography

- **Scale:** 12/14/16/20/24/32
- **Families:** primary=Roboto, display=Germania One, mono=JetBrains Mono
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

- Buttons: primary action uses `#FA3C00`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#FA3C00) as the interaction signal.
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
