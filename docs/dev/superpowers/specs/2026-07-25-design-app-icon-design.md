# Design App Icon

Date: 2026-07-25
Status: Approved for implementation planning
Scope: `apps/design` favicon + sidebar brand mark

## 1. Goal

Give Design Engineering a distinctive app icon that reads as **design as a step in the engineering workflow**, not as a generic design-tool or marketing brand mark.

The same graphic serves:

1. Browser favicon
2. Sidebar header logo (replacing the current letter 「D」 color square)

## 2. Concept

**Design draft handing off into the engineering flow.**

Clean layered mark (not a palette / terminal mashup):

1. **Base** — product blue gradient tile
2. **Depth card** — darker offset layer (package / iteration)
3. **Artboard** — white tilted draft with frame, minimal layout, image-placeholder X
4. **Handoff** — light path into a node (enters the R&D pipeline)

Reads as: design output that continues into engineering — not a standalone art tool.

## 3. Visual Spec

### 3.1 Canvas

- ViewBox: `0 0 64 64` (richer geometry; scales to 16–30px)
- Background: rounded square, fill `#0c5cab`, subtle blueprint grid
- Foreground: multi-layer illustration (terminal + brush + wash); still clipped to the rounded square
- No separate dark/light mark in this change

### 3.2 Layer geometry

1. Blue gradient field (no busy blueprint grid)
2. Darker offset card behind the artboard (depth / package)
3. White tilted artboard with blue inset frame, minimal bars, image-placeholder X
4. Light curved handoff path ending in a node at the lower-right

At 16×16, silhouette is white card + blue field + corner node.

### 3.3 Theme

One mark for light and dark shells.

## 4. Delivery

| Asset | Path / wiring |
|-------|----------------|
| Master SVG | `apps/design/framework/public/icon.svg` (Vite `publicDir`; served as `/icon.svg`) |
| Favicon | `<link rel="icon" href="/icon.svg" type="image/svg+xml" />` in `apps/design/index.html` |
| Sidebar | Replace text 「D」 in `.sidebar-shell__logo` with `<img src="/icon.svg" alt="" />` (or equivalent); keep the existing 30×30 layout box. Prefer dropping the solid CSS background so the SVG tile is the full mark. |

Default is SVG-only. Do not add `favicon.ico` in this change.

Out of scope: PWA manifest icons, Apple touch icon set, animated variants, wordmark redesign.

## 5. Success Criteria

- Favicon and sidebar share one graphic source.
- Composition reads as Xcode-like layers: blue base → coding window → design brush.
- Primary blue matches existing token; coding layer is clearly a terminal/IDE; top layer is clearly a brush with wash.
- Sidebar accessibility: logo remains decorative (`aria-hidden`) beside the 「Design Engineering」 title.

## 6. Non-goals

- Redesigning the full brand system or title typography
- Multi-color or illustrated mascot
- Changing product copy or shell layout beyond the logo slot
