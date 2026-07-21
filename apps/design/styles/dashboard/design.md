---
id: dashboard
source: crawled
source_url: https://github.com/nexu-io/open-design/blob/main/design-systems/dashboard/DESIGN.md
source_date: '2026-05-01'
title: Design System Inspired by Dashboard
summary: Dark-themed cloud-platform aesthetic with modular grids, glass-like panels,
  and strong data hierarchy for productivity dashboards.
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
source_item_path: design-systems/dashboard/DESIGN.md
content_hash: b87278ceecc58ad91ac97c14a1b8d657782f498f652e8100b9caf546742de4c2
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

# Design System Inspired by Dashboard

> Category: Professional & Corporate
> Dark-themed cloud-platform aesthetic with modular grids, glass-like panels, and strong data hierarchy for productivity dashboards.

## 1. Visual Theme & Atmosphere

Dark-themed cloud-platform aesthetic with modular grids, glass-like panels, and strong data hierarchy for productivity dashboards.

- **Visual style:** modern, clean, cloud-platform aesthetic (Heroku/Vercel/GitHub inspired), dark theme, subtle gradients, soft shadows, glass-like panels, rounded components
- **Color stance:** primary, neutral, success, warning, danger
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#0C5CAB` — Token from style foundations.
- **Secondary:** `#0A4A8A` — Token from style foundations.
- **Success:** `#10B981` — Token from style foundations.
- **Warning:** `#F59E0B` — Token from style foundations.
- **Danger:** `#EF4444` — Token from style foundations.
- **Surface:** `#09090B` — Token from style foundations.
- **Text:** `#FAFAFA` — Token from style foundations.
- **Neutral:** `#09090B` — Derived from the surface token for official format compatibility.

- Favor Primary (#0C5CAB) for CTA emphasis.
- Use Surface (#09090B) for large backgrounds and cards.
- Keep body copy on Text (#FAFAFA) for legibility.

## 3. Typography

- **Scale:** 12/14/16/20/24/32
- **Families:** primary=IBM Plex Sans, display=IBM Plex Sans, mono=IBM Plex Sans
- **Weights:** 100, 200, 300, 400, 500, 600, 700, 800, 900
- Headings should carry the style personality; body text should optimize scanability and contrast.

## 4. Spacing & Grid

- **Spacing scale:** 8pt baseline grid
- Keep vertical rhythm consistent across sections and components.
- Align columns and modules to a predictable grid; avoid ad-hoc offsets.

## 5. Layout & Composition

- Prefer clear content blocks with consistent internal padding.
- Keep hierarchy obvious: headline → support text → primary action.
- Use whitespace to separate concerns before adding borders or shadows.

## 6. Components

- Buttons: primary action uses `#0C5CAB`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#0C5CAB) as the interaction signal.
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
