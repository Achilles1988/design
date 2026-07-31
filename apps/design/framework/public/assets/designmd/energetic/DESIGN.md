---
id: energetic
source: crawled
source_url: https://github.com/nexu-io/open-design/blob/main/design-systems/energetic/DESIGN.md
source_date: '2026-05-01'
title: Design System Inspired by Energetic
summary: Dynamic, vibrant style with thick borders, geometric shapes, high-contrast
  colors, and expressive typography conveying motion and vitality.
ingested_at: '2026-08-01T02:27:30+08:00'
status: cleaned
tags:
- spec
- light
- bold
- geometric
- high-contrast
- neobrutalism
- colorful
tags_content_hash: b4dc25c7b7d347e5ac3fdb48ea42136d717f6fb17094cedb19f8e22841edcdcc
category: spec
design_domain:
- UI
author: nexu-io
origin_site: open-design
source_commit: 517f39acde402c1a7af2189167a8d6957a3dac71
source_item_path: design-systems/energetic/DESIGN.md
content_hash: 86ef6124eccf8d85f9ba66d48cff44031fdeb67b470aea7186da0cdf815ba168
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

# Design System Inspired by Energetic

> Category: Bold & Expressive
> Dynamic, vibrant style with thick borders, geometric shapes, high-contrast colors, and expressive typography conveying motion and vitality.

## 1. Visual Theme & Atmosphere

Dynamic, vibrant style with thick borders, geometric shapes, high-contrast colors, and expressive typography conveying motion and vitality.

- **Visual style:** bold, geometric, vibrant, thick-bordered
- **Color stance:** primary, secondary, neutral
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#EA580B` — Token from style foundations.
- **Secondary:** `#F59E0B` — Token from style foundations.
- **Success:** `#16A34A` — Token from style foundations.
- **Warning:** `#D97706` — Token from style foundations.
- **Danger:** `#DC2626` — Token from style foundations.
- **Background:** `#FFEDD5` — Token from style foundations.
- **Surface:** `#FDBA74` — Token from style foundations.
- **Text:** `#EA580C` — Token from style foundations.
- **Neutral:** `#FDBA74` — Derived from the surface token for official format compatibility.

- Favor Primary (#EA580B) for CTA emphasis.
- Use Surface (#FDBA74) for large backgrounds and cards.
- Keep body copy on Text (#EA580C) for legibility.

## 3. Typography

- **Scale:** 12/14/16/20/24/32/48
- **Families:** primary=Limelight, display=Limelight, mono=JetBrains Mono
- **Weights:** 400
- Headings should carry the style personality; body text should optimize scanability and contrast.

## 4. Spacing & Grid

- **Spacing scale:** 4/8/12/16/24/32/48/64
- Keep vertical rhythm consistent across sections and components.
- Align columns and modules to a predictable grid; avoid ad-hoc offsets.

## 5. Layout & Composition

- Prefer clear content blocks with consistent internal padding.
- Keep hierarchy obvious: headline → support text → primary action.
- Use whitespace to separate concerns before adding borders or shadows.

## 6. Components

- Buttons: primary action uses `#EA580B`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#EA580B) as the interaction signal.
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
