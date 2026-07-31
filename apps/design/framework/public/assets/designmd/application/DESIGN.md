---
id: application
source: crawled
source_url: https://github.com/nexu-io/open-design/blob/main/design-systems/application/DESIGN.md
source_date: '2026-05-01'
title: Design System Inspired by Application
summary: App dashboard with purple-themed aesthetic, top-bar navigation, card-based
  layouts, and developer-first workflows.
ingested_at: '2026-08-01T02:27:30+08:00'
status: cleaned
tags:
- spec
- dark
- glassmorphism
- rounded
- soft
- colorful
- high-contrast
tags_content_hash: bb59d0ee1dbddc6975da4aa289301a89bb065f3f81e1a0235910d4cd8ed95efe
category: spec
design_domain:
- UI
author: nexu-io
origin_site: open-design
source_commit: 517f39acde402c1a7af2189167a8d6957a3dac71
source_item_path: design-systems/application/DESIGN.md
content_hash: 129690c16ee13cc430e7fd4bbc310078ca058269990f800f7142f9c5c7628ed8
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

# Design System Inspired by Application

> Category: Professional & Corporate
> App dashboard with purple-themed aesthetic, top-bar navigation, card-based layouts, and developer-first workflows.

## 1. Visual Theme & Atmosphere

App dashboard with purple-themed aesthetic, top-bar navigation, card-based layouts, and developer-first workflows.

- **Visual style:** modern, clean, high-contrast, glass-like panels, soft shadows, rounded components
- **Color stance:** primary (purple), neutral, success, warning, danger
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#9333EA` — Token from style foundations.
- **Secondary:** `#A855F7` — Token from style foundations.
- **Success:** `#10B981` — Token from style foundations.
- **Warning:** `#F59E0B` — Token from style foundations.
- **Danger:** `#EF4444` — Token from style foundations.
- **Surface:** `#FFFFFF` — Token from style foundations.
- **Text:** `#09090B` — Token from style foundations.
- **Neutral:** `#FFFFFF` — Derived from the surface token for official format compatibility.

- Favor Primary (#9333EA) for CTA emphasis.
- Use Surface (#FFFFFF) for large backgrounds and cards.
- Keep body copy on Text (#09090B) for legibility.

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

- Buttons: primary action uses `#9333EA`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#9333EA) as the interaction signal.
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
