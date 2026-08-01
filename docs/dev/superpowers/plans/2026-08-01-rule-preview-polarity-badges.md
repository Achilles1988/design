# Rule Preview Polarity Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show `light` / `dark` support badges on every Rule page card preview, derived from the same DESIGN.md tag polarity used by install.

**Architecture:** `listAssets('designmd')` reads each package’s DESIGN.md (or `design.md`), runs `parseStylePolarityFromDesignMd`, maps polarity to `slots: StyleSlot[]`, and returns them on `AssetEntry`. Rule UI overlays those slots on `LazyPreview`. Layout list omits `slots`.

**Tech Stack:** Vite design-fs middleware, React 19, TypeScript, Vitest, Testing Library, existing `assets.css` tokens.

## Global Constraints

- Spec: `docs/dev/superpowers/specs/2026-08-01-rule-preview-polarity-badges-design.md`
- Follow `.wn-ai/lessons/lesson.md`, `docs/dev/conventions/mandatory.md`, `docs/dev/conventions/coding-standards.md`
- User-facing badge copy: English lowercase `light` / `dark`
- Public API change updates `docs/dev/api/design-fs.md` in the same task as the list response shape
- Do not commit unless the user explicitly asks in the implementing session
- Do not change apply / needsSlot / polarity rules
- Layout page must not show badges

## File Map

**Modify**

- `apps/design/framework/src/lib/types.ts` — optional `slots` on `AssetEntry`
- `apps/design/framework/vite-plugins/design-fs/stylePolarity.ts` — `slotsForPolarity(polarity)`
- `apps/design/framework/vite-plugins/design-fs/stylePolarity.test.ts` — cover mapping
- `apps/design/framework/vite-plugins/design-fs/assets.ts` — attach `slots` for designmd list
- `apps/design/framework/vite-plugins/design-fs/assets.test.ts` — list polarity cases
- `docs/dev/api/design-fs.md` — document `slots` on designmd list entries
- `apps/design/framework/src/features/assets/AssetBrowserPage.tsx` — badge overlay on preview
- `apps/design/framework/src/features/assets/assets.css` — badge styles
- `apps/design/framework/src/features/assets/AssetBrowserPage.polarityBadges.test.tsx` — new UI test (create)

---

### Task 1: AssetEntry.slots + listAssets polarity

**Files:**
- Modify: `apps/design/framework/src/lib/types.ts`
- Modify: `apps/design/framework/vite-plugins/design-fs/stylePolarity.ts`
- Modify: `apps/design/framework/vite-plugins/design-fs/stylePolarity.test.ts`
- Modify: `apps/design/framework/vite-plugins/design-fs/assets.ts`
- Modify: `apps/design/framework/vite-plugins/design-fs/assets.test.ts`
- Modify: `docs/dev/api/design-fs.md`

**Interfaces:**
- Consumes:
  - `parseStylePolarityFromDesignMd(source: string): StylePolarity`
  - `StyleSlot` from `../../src/lib/styleSlots` (already used via types)
- Produces:
  - `slotsForPolarity(polarity: StylePolarity): StyleSlot[]`
    - `'light'` → `['light']`
    - `'dark'` → `['dark']`
    - `'both'` → `['light', 'dark']`
  - `AssetEntry.slots?: StyleSlot[]` on designmd list results only
  - Missing / unreadable DESIGN.md on list → treat as `'both'` → `['light','dark']`

- [x] **Step 1: Extend the failing listAssets expectation and add polarity list tests**

In `assets.test.ts`, update the existing list assertion to expect `slots: ['light', 'dark']` for a package that has preview but no DESIGN.md (alpha today). Add a focused test:

```ts
it('attaches supported slots from DESIGN.md tags for designmd', async () => {
  const root = await makeTemp()
  async function pkg(id: string, tags: string[]) {
    const dir = path.join(root, 'designmd', id)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'components.html'), '<html></html>')
    const tagLines = tags.map((t) => `- ${t}`).join('\n')
    await fs.writeFile(
      path.join(dir, 'DESIGN.md'),
      `---\ntags:\n${tagLines}\n---\n# ${id}\n`,
    )
  }
  await pkg('sunny', ['light'])
  await pkg('midnight', ['dark'])
  await pkg('dual', ['light', 'dark'])
  await pkg('untagged', ['brand'])

  const list = await createAssetsStore(root).listAssets('designmd')
  expect(list).toEqual([
    {
      id: 'dual',
      name: 'dual',
      previewUrl: '/assets/designmd/dual/components.html',
      slots: ['light', 'dark'],
    },
    {
      id: 'midnight',
      name: 'midnight',
      previewUrl: '/assets/designmd/midnight/components.html',
      slots: ['dark'],
    },
    {
      id: 'sunny',
      name: 'sunny',
      previewUrl: '/assets/designmd/sunny/components.html',
      slots: ['light'],
    },
    {
      id: 'untagged',
      name: 'untagged',
      previewUrl: '/assets/designmd/untagged/components.html',
      slots: ['light', 'dark'],
    },
  ])
})

it('does not attach slots for layoutmd', async () => {
  const root = await makeTemp()
  const dir = path.join(root, 'layoutmd', 'shell')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'preview.html'), '<html></html>')
  const list = await createAssetsStore(root).listAssets('layoutmd')
  expect(list).toEqual([
    {
      id: 'shell',
      name: 'shell',
      previewUrl: '/assets/layoutmd/shell/preview.html',
    },
  ])
})
```

Also add to `stylePolarity.test.ts`:

```ts
import { slotsForPolarity } from './stylePolarity'

describe('slotsForPolarity', () => {
  it('maps polarity to ordered StyleSlot arrays', () => {
    expect(slotsForPolarity('light')).toEqual(['light'])
    expect(slotsForPolarity('dark')).toEqual(['dark'])
    expect(slotsForPolarity('both')).toEqual(['light', 'dark'])
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run from `apps/design`:

```bash
npm run test -- framework/vite-plugins/design-fs/assets.test.ts framework/vite-plugins/design-fs/stylePolarity.test.ts
```

Expected: FAIL — missing `slots` / `slotsForPolarity`, or list equality mismatch.

- [x] **Step 3: Implement types + polarity helper + listAssets**

`types.ts`:

```ts
export type AssetEntry = {
  id: string
  name: string
  previewUrl: string
  /** designmd only: supported theme slots from DESIGN.md tags. */
  slots?: StyleSlot[]
}
```

(`StyleSlot` is already re-exported from `./styleSlots` in this file.)

`stylePolarity.ts` — add:

```ts
import type { StyleApplySlot, StyleSlot } from '../../src/lib/styleSlots'

export function slotsForPolarity(polarity: StylePolarity): StyleSlot[] {
  if (polarity === 'light') return ['light']
  if (polarity === 'dark') return ['dark']
  return ['light', 'dark']
}
```

(Keep existing `StyleApplySlot` import usage; merge imports if already present.)

`assets.ts` — inside `listAssets`, after preview file check, for `kind === 'designmd'` resolve DESIGN.md / design.md, read text, parse polarity (catch → `'both'`), set `slots: slotsForPolarity(polarity)`. Skip for layoutmd.

Concrete loop body shape:

```ts
const entry: AssetEntry = {
  id,
  name: id,
  previewUrl: `/assets/${kind}/${id}/${previewFile}`,
}
if (kind === 'designmd') {
  let polarity: StylePolarity = 'both'
  try {
    let designMdPath: string | null = null
    for (const name of ['DESIGN.md', 'design.md'] as const) {
      const candidate = path.join(kindDir, id, name)
      try {
        await fs.access(candidate)
        designMdPath = candidate
        break
      } catch {
        // try next
      }
    }
    if (designMdPath) {
      const source = await fs.readFile(designMdPath, 'utf8')
      polarity = parseStylePolarityFromDesignMd(source)
    }
  } catch {
    polarity = 'both'
  }
  entry.slots = slotsForPolarity(polarity)
}
entries.push(entry)
```

Update the existing “lists packages…” test expectation to include `slots: ['light', 'dark']` for alpha (no DESIGN.md).

In `docs/dev/api/design-fs.md`, under Assets / list success row or a short note after the Assets table, document:

> For `kind=designmd`, each `AssetEntry` includes `slots: ('light'|'dark')[]` derived from stock DESIGN.md frontmatter tags via the same polarity rules as apply (`light` only / `dark` only / both-or-neither → both slots). `layoutmd` entries omit `slots`.

- [x] **Step 4: Run tests to verify they pass**

```bash
npm run test -- framework/vite-plugins/design-fs/assets.test.ts framework/vite-plugins/design-fs/stylePolarity.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit** (only if the user asked to commit in this session)

```bash
git add apps/design/framework/src/lib/types.ts \
  apps/design/framework/vite-plugins/design-fs/stylePolarity.ts \
  apps/design/framework/vite-plugins/design-fs/stylePolarity.test.ts \
  apps/design/framework/vite-plugins/design-fs/assets.ts \
  apps/design/framework/vite-plugins/design-fs/assets.test.ts \
  docs/dev/api/design-fs.md
git commit -m "$(cat <<'EOF'
feat(design-fs): include supported light/dark slots on Rule asset list

EOF
)"
```

---

### Task 2: Rule card preview badges

**Files:**
- Create: `apps/design/framework/src/features/assets/AssetBrowserPage.polarityBadges.test.tsx`
- Modify: `apps/design/framework/src/features/assets/AssetBrowserPage.tsx`
- Modify: `apps/design/framework/src/features/assets/assets.css`

**Interfaces:**
- Consumes: `AssetEntry.slots?: StyleSlot[]` from Task 1
- Produces: decorative overlay badges on Rule `LazyPreview` only

- [x] **Step 1: Write failing UI test**

Create `AssetBrowserPage.polarityBadges.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AssetEntry } from '@/lib/types'

beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

const api = vi.hoisted(() => ({
  listAssets: vi.fn(),
  listApps: vi.fn(async () => []),
  getApp: vi.fn(),
  applyAsset: vi.fn(),
  downloadAssetUrl: vi.fn(() => '/download'),
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, designApi: api }
})
vi.mock('@/shell/assistant/usePageAssistant', () => ({
  usePageAssistant: () => {},
}))
vi.mock('./usePersistentAssetFilter', () => ({
  usePersistentAssetFilter: () => ({
    filter: { chips: [] },
    filterRef: { current: { chips: [] } },
    owner: { pageKey: 'test', generation: 1 },
    setFilter: vi.fn(),
    resetFilter: vi.fn(),
  }),
}))

import { AssetsLayoutPage, AssetsRulePage } from './AssetBrowserPage'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Rule polarity badges', () => {
  it('shows supported slots on each Rule preview', async () => {
    const entries: AssetEntry[] = [
      {
        id: 'sunny',
        name: 'sunny',
        previewUrl: '/assets/designmd/sunny/components.html',
        slots: ['light'],
      },
      {
        id: 'midnight',
        name: 'midnight',
        previewUrl: '/assets/designmd/midnight/components.html',
        slots: ['dark'],
      },
      {
        id: 'dual',
        name: 'dual',
        previewUrl: '/assets/designmd/dual/components.html',
        slots: ['light', 'dark'],
      },
    ]
    api.listAssets.mockResolvedValue(entries)
    render(
      <MemoryRouter initialEntries={['/assets/rule']}>
        <AssetsRulePage />
      </MemoryRouter>,
    )

    const sunny = await screen.findByRole('button', {
      name: 'Open preview for sunny',
    })
    expect(within(sunny).getByText('light')).toBeTruthy()
    expect(within(sunny).queryByText('dark')).toBeNull()

    const midnight = screen.getByRole('button', {
      name: 'Open preview for midnight',
    })
    expect(within(midnight).getByText('dark')).toBeTruthy()
    expect(within(midnight).queryByText('light')).toBeNull()

    const dual = screen.getByRole('button', {
      name: 'Open preview for dual',
    })
    expect(within(dual).getByText('light')).toBeTruthy()
    expect(within(dual).getByText('dark')).toBeTruthy()
  })

  it('does not show polarity badges on Layout previews', async () => {
    api.listAssets.mockResolvedValue([
      {
        id: 'shell',
        name: 'shell',
        previewUrl: '/assets/layoutmd/shell/preview.html',
      },
    ])
    render(
      <MemoryRouter initialEntries={['/assets/layout']}>
        <AssetsLayoutPage />
      </MemoryRouter>,
    )
    const preview = await screen.findByRole('button', {
      name: 'Open preview for shell',
    })
    expect(within(preview).queryByText('light')).toBeNull()
    expect(within(preview).queryByText('dark')).toBeNull()
  })
})
```

- [x] **Step 2: Run test to verify it fails**

```bash
npm run test -- framework/src/features/assets/AssetBrowserPage.polarityBadges.test.tsx
```

Expected: FAIL — badge text not found inside preview buttons.

- [x] **Step 3: Implement overlay + CSS**

Pass `slots` into `LazyPreview` only for Rule cards. Extend props:

```ts
function LazyPreview({
  src,
  title,
  height,
  theme,
  slots,
  onOpen,
}: {
  src: string
  title: string
  height: number
  theme: ThemeMode
  slots?: StyleSlot[]
  onOpen: () => void
}) {
```

Inside the preview `<button>`, after skeleton / iframe, render:

```tsx
{slots && slots.length > 0 ? (
  <span className="assets-card__slots" aria-hidden="true">
    {slots.map((slot) => (
      <span key={slot} className="assets-card__slot">
        {slot}
      </span>
    ))}
  </span>
) : null}
```

In the masonry map:

```tsx
<LazyPreview
  src={entry.previewUrl}
  title={entry.name}
  height={height}
  theme={theme}
  slots={kind === 'designmd' ? entry.slots : undefined}
  onOpen={() => setLightbox(entry)}
/>
```

Import `StyleSlot` from `@/lib/types` if not already imported.

CSS additions in `assets.css`:

```css
.assets-card__slots {
  position: absolute;
  top: calc(var(--space) * 1);
  right: calc(var(--space) * 1);
  z-index: 1;
  display: flex;
  gap: calc(var(--space) * 0.5);
  pointer-events: none;
}

.assets-card__slot {
  padding: 2px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
  color: var(--color-text);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.4;
  text-transform: none;
}
```

Do not add badges to the lightbox.

- [x] **Step 4: Run tests to verify they pass**

```bash
npm run test -- framework/src/features/assets/AssetBrowserPage.polarityBadges.test.tsx framework/src/features/assets/AssetBrowserPage.runApply.test.tsx
```

Expected: PASS (runApply still green; update its `ENTRY` with `slots: ['light','dark']` only if TypeScript / assertions require it — optional field, so no change needed).

- [ ] **Step 5: Commit** (only if the user asked to commit in this session)

```bash
git add apps/design/framework/src/features/assets/AssetBrowserPage.tsx \
  apps/design/framework/src/features/assets/assets.css \
  apps/design/framework/src/features/assets/AssetBrowserPage.polarityBadges.test.tsx
git commit -m "$(cat <<'EOF'
feat(design-ui): show light/dark support badges on Rule previews

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Badges = supported slots from DESIGN.md tags | Task 1 + 2 |
| `AssetEntry.slots` on designmd list | Task 1 |
| layoutmd omits slots / no Layout badges | Task 1 + 2 |
| Missing DESIGN.md on list → both badges | Task 1 |
| Overlay top-right on card preview | Task 2 |
| English lowercase labels | Task 2 |
| Lightbox / apply unchanged | Out of scope / not touched |
| API docs updated | Task 1 |
