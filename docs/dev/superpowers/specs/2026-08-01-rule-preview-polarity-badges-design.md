# Rule Preview Polarity Badges

Date: 2026-08-01  
Status: Approved for implementation planning

## Goal

On the Rule page (`/assets/rule`), every package card preview shows English
`light` / `dark` badges for the slots that package supports. Layout page is
unchanged. Badge meaning matches install adjudication (DESIGN.md frontmatter
tags), not the current Shell theme.

## Context

- Rule cards use `AssetBrowserPage` with `kind="designmd"`; each card has a
  lazy iframe preview (`LazyPreview`) of `components.html`.
- `listAssets` today returns `{ id, name, previewUrl }` only.
- Polarity already exists server-side: `parseStylePolarityFromDesignMd` reads
  frontmatter `tags` (`light` / `dark`) and yields `light` | `dark` | `both`
  (both tags or neither → `both`). Apply uses the same helper.
- AI index (`INDEX.md` / `AssetMeta.tags`) also carries those tags, but Rule
  card list does not depend on the index being loaded; badges must work even
  when the assistant index fails.

## Decisions

| Topic | Decision |
|-------|----------|
| Badge meaning | Supported style slots for that package |
| Data source | Same polarity parse as apply: stock `DESIGN.md` / `design.md` frontmatter tags |
| Shape on list API | Optional `slots: StyleSlot[]` on `AssetEntry` — `['light']`, `['dark']`, or `['light','dark']` |
| When to compute | Only for `kind === 'designmd'` during `listAssets`; `layoutmd` omits `slots` |
| Missing contract on list | If preview file exists but DESIGN.md is missing/unreadable, treat as `both` (show both badges) so the card still labels consistently; apply remains the hard gate |
| UI placement | Overlay on the card preview (top-right), not in meta row |
| Lightbox | No badges (card already showed support); out of scope |
| Layout page | No badges |
| Copy language | English lowercase labels: `light`, `dark` |
| Visual | Compact non-interactive badges; reuse existing token colors (`--color-surface`, `--color-border`, `--color-text` / muted); no new brand palette |

## Architecture

```text
listAssets(designmd)
  └─ for each package with components.html
       └─ read DESIGN.md → parseStylePolarityFromDesignMd
            └─ polarity → slots[] on AssetEntry

AssetsRulePage / AssetBrowserPage
  └─ LazyPreview overlay: map entry.slots → badges
       (only when kind === 'designmd' and slots present)
```

Polarity → slots mapping:

| polarity | slots shown |
|----------|-------------|
| `light` | light |
| `dark` | dark |
| `both` | light + dark |

## API / types

Extend `AssetEntry`:

```ts
export type AssetEntry = {
  id: string
  name: string
  previewUrl: string
  /** Present for designmd: supported theme slots derived from DESIGN.md tags. */
  slots?: StyleSlot[] // 'light' | 'dark'
}
```

Update `docs/dev/api/design-fs.md` in the same change: `GET /assets/designmd`
entries may include `slots`. Layout list response unchanged.

## UI

- On `.assets-card__preview`, absolutely positioned badge row (top-right).
- One badge per supported slot; order always light then dark when both.
- Badges must not intercept the preview click (pointer-events: none on overlay,
  or render as non-button spans inside the existing preview button with
  aria-hidden / decorative treatment; preview `aria-label` stays “Open preview…”).
- Only render when `kind === 'designmd'`.

## Testing

- `assets.test.ts`: designmd list includes expected `slots` for light-only,
  dark-only, and both (tags both / neither).
- `AssetBrowserPage` UI test (or small render test): Rule cards show the right
  badge text; Layout cards show none.
- No change to apply / needsSlot behavior.

## Out of scope

- Making static `components.html` visually respond to Shell theme.
- Filtering the Rule grid by current theme.
- Badges in lightbox or App detail.
- Changing polarity rules or install dialogs.

## Approach rejected

- Client-side fetch of each DESIGN.md or INDEX.md for badges: extra latency and
  duplicated polarity logic.
- Inferring from preview HTML appearance: unreliable vs install contract.
