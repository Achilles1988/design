# Interface Consistency and Assistant Docking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a docked English AI assistant with common Markdown and reliable multi-turn asset filtering, align Settings through shared UI patterns, anchor Settings navigation at the sidebar bottom, and simplify Add Canvas on App detail.

**Architecture:** Add bounded shared UI primitives under `framework/src/ui/`, while business state stays in its feature pages. `SidebarShell` owns the docked assistant column and sidebar regions; assistant message rendering remains reusable and tool execution continues to update `AssetBrowserPage` through its current filter state.

**Tech Stack:** React 19, TypeScript 5.7, React Router 7, assistant-ui 0.14, Vercel AI SDK 4, Vitest 3, Testing Library, project CSS tokens.

## Global Constraints

- Follow `.wn-ai/lessons/lesson.md`, `docs/dev/conventions/mandatory.md`, and `docs/dev/conventions/coding-standards.md`.
- Preserve the configured `dashboard` style and `sidebar-shell` layout contract.
- Use existing CSS tokens, IBM Plex Sans, the 8pt spacing rhythm, and 150–250 ms state transitions.
- All affected user-facing interface copy must be English.
- The approved new dependency is `@assistant-ui/react-markdown`; do not add GFM or syntax-highlighting dependencies.
- Keep shared components presentation-only; Settings, App detail, and Asset Browser retain their business state and requests.
- Update `docs/dev/api/assistant-ui-chat.md` in the same change because the reusable panel and text-rendering contract changes.
- Do not commit during execution unless the user explicitly requests a commit.

## File Map

**Create**

- `apps/design/framework/src/ui/FormRow.tsx` — aligned label/control/hint/error structure.
- `apps/design/framework/src/ui/FormRow.css` — shared form-row layout and responsive behavior.
- `apps/design/framework/src/ui/FormRow.test.tsx` — semantic and optional-content coverage.
- `apps/design/framework/src/ui/SectionHeader.tsx` — title plus optional action layout.
- `apps/design/framework/src/ui/SectionHeader.css` — shared section-header alignment and responsive behavior.
- `apps/design/framework/src/ui/DisclosureForm.tsx` — controlled expanded/collapsed form region.
- `apps/design/framework/src/ui/DisclosureForm.css` — shared disclosure-region presentation.
- `apps/design/framework/src/features/apps/AppDetailPage.test.tsx` — disclosure and delete-entry regression coverage.
- `apps/design/framework/src/shell/SidebarShell.test.tsx` — sidebar-region and assistant-open shell-state coverage.
- `apps/design/framework/src/shell/assistant/AssistantMarkdown.tsx` — project wrapper around the official Markdown primitive.
- `apps/design/framework/src/shell/assistant/AssistantThread.test.tsx` — text renderer and English-copy coverage.

**Modify**

- `apps/design/package.json` and `apps/design/package-lock.json` — add the approved Markdown renderer.
- `apps/design/framework/src/features/settings/AiConfigForm.tsx` — consume `FormRow` and align Provider with other fields.
- `apps/design/framework/src/features/settings/settings.css` — replace nested-card field styling with one field grid.
- `apps/design/framework/src/features/settings/AiConfigForm.test.tsx` — preserve behavior and cover aligned semantics.
- `apps/design/framework/src/features/apps/AppDetailPage.tsx` — remove App deletion and add controlled Add Canvas disclosure.
- `apps/design/framework/src/features/apps/apps.css` — shared section-header/disclosure presentation.
- `apps/design/framework/src/shell/SidebarShell.tsx` — split sidebar regions, own docked-column state, and restore launcher focus.
- `apps/design/framework/src/shell/SidebarShell.css` — docked third column, bottom Settings region, narrow-screen workspace replacement.
- `apps/design/framework/src/shell/assistant/AssistantLauncher.tsx` — English title and forwarded button ref.
- `apps/design/framework/src/shell/assistant/AssistantPanel.tsx` — nonmodal docked complementary region with English copy.
- `apps/design/framework/src/shell/assistant/AssistantPanel.test.tsx` — nonmodal semantics, English guidance, and Escape behavior.
- `apps/design/framework/src/shell/assistant/AssistantThread.tsx` — Markdown text part renderer and English composer copy.
- `apps/design/framework/src/shell/assistant/assistant.css` — remove overlay/scrim styles and add Markdown typography.
- `apps/design/framework/src/features/assets/assistantFilterTool.tsx` — synchronously advance the latest filter ref and render truthful English results.
- `apps/design/framework/src/features/assets/assistantFilterTool.test.tsx` — multi-turn accumulation and empty-delta coverage.
- `apps/design/framework/public/prompts/asset-search.md` — English examples and explicit incremental tool instructions.
- `docs/dev/api/assistant-ui-chat.md` — docked layout, Markdown, and immediate multi-turn filter contract.

---

### Task 1: Shared Form Row and Aligned Settings

**Files:**
- Create: `apps/design/framework/src/ui/FormRow.tsx`
- Create: `apps/design/framework/src/ui/FormRow.css`
- Create: `apps/design/framework/src/ui/FormRow.test.tsx`
- Modify: `apps/design/framework/src/features/settings/AiConfigForm.tsx:1-117`
- Modify: `apps/design/framework/src/features/settings/settings.css:37-127`
- Modify: `apps/design/framework/src/features/settings/AiConfigForm.test.tsx:12-53`

**Interfaces:**
- Produces: `FormRow({ label, hint?, error?, children })` where all slots are `ReactNode` and `children` contains the actual control semantics.
- Consumes: existing Settings state and `readAiConfig`/`writeAiConfig` behavior unchanged.

- [ ] **Step 1: Write the failing shared-component tests**

Create `FormRow.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FormRow } from './FormRow'

afterEach(cleanup)

describe('FormRow', () => {
  it('keeps consumer-provided label semantics and renders the control', () => {
    render(
      <FormRow label={<label htmlFor="model">Model</label>}>
        <input id="model" />
      </FormRow>,
    )
    expect(screen.getByLabelText('Model')).toBeTruthy()
  })

  it('renders optional hint and error content in the control column', () => {
    render(
      <FormRow label={<span>API key</span>} hint="Stored locally" error="Required">
        <input aria-label="API key" />
      </FormRow>,
    )
    expect(screen.getByText('Stored locally')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('Required')
  })
})
```

- [ ] **Step 2: Run the new test and verify the missing module failure**

Run:

```bash
cd /Users/wanderain/_my_git/design/apps/design && npm test -- framework/src/ui/FormRow.test.tsx
```

Expected: FAIL because `./FormRow` does not exist.

- [ ] **Step 3: Implement the shared form-row structure**

Create `FormRow.tsx`:

```tsx
import type { ReactNode } from 'react'
import './FormRow.css'

type FormRowProps = {
  label: ReactNode
  children: ReactNode
  hint?: ReactNode
  error?: ReactNode
}

export function FormRow({ label, children, hint, error }: FormRowProps) {
  return (
    <div className="form-row">
      <div className="form-row__label">{label}</div>
      <div className="form-row__control">
        {children}
        {hint ? <div className="form-row__hint">{hint}</div> : null}
        {error ? <div className="form-row__error" role="alert">{error}</div> : null}
      </div>
    </div>
  )
}
```

Create `FormRow.css` with the fixed label column and a single-column narrow fallback:

```css
.form-row {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: calc(var(--space) * 2);
  align-items: start;
  padding: calc(var(--space) * 1.25) 0;
  border-top: 1px solid var(--color-border);
}
.form-row:first-child { border-top: 0; }
.form-row__label { padding-top: 10px; color: var(--color-muted); font-size: 13px; font-weight: 600; }
.form-row__control { min-width: 0; }
.form-row__hint { margin-top: calc(var(--space) * 0.5); color: var(--color-muted); font-size: 12px; }
.form-row__error { margin-top: calc(var(--space) * 0.5); color: var(--color-danger); font-size: 12px; }
@media (max-width: 560px) {
  .form-row { grid-template-columns: 1fr; gap: calc(var(--space) * 0.75); }
  .form-row__label { padding-top: 0; }
}
```

- [ ] **Step 4: Run the FormRow test and verify it passes**

Run the command from Step 2.

Expected: PASS with 2 tests.

- [ ] **Step 5: Add failing Settings assertions for one visual hierarchy**

Extend `AiConfigForm.test.tsx`:

```tsx
it('renders provider as an aligned radio group and keeps all controls labelled', () => {
  render(<AiConfigForm />)
  expect(screen.getByRole('radiogroup', { name: 'Provider' })).toBeTruthy()
  expect(screen.getByLabelText('Base URL')).toBeTruthy()
  expect(screen.getByLabelText('API Key')).toBeTruthy()
  expect(screen.getByLabelText('Model')).toBeTruthy()
})
```

Run:

```bash
cd /Users/wanderain/_my_git/design/apps/design && npm test -- framework/src/features/settings/AiConfigForm.test.tsx
```

Expected: FAIL because the current Provider fieldset is not the aligned radio-group structure.

- [ ] **Step 6: Refactor `AiConfigForm` to consume `FormRow`**

Import `FormRow`, give inputs stable IDs, and replace the current fieldset plus standalone labels with this structure:

```tsx
<FormRow label={<span id="provider-label">Provider</span>}>
  <div className="settings-form__provider" role="radiogroup" aria-labelledby="provider-label">
    <label className={provider === 'anthropic' ? 'settings-form__provider-option settings-form__provider-option--selected' : 'settings-form__provider-option'}>
      <input type="radio" name="provider" value="anthropic" checked={provider === 'anthropic'} onChange={() => setProvider('anthropic')} />
      Anthropic
    </label>
    <label className={provider === 'openai' ? 'settings-form__provider-option settings-form__provider-option--selected' : 'settings-form__provider-option'}>
      <input type="radio" name="provider" value="openai" checked={provider === 'openai'} onChange={() => setProvider('openai')} />
      OpenAI
    </label>
  </div>
</FormRow>
<FormRow
  label={<label htmlFor="ai-base-url">Base URL</label>}
  hint="Available for OpenAI-compatible providers."
>
  <input id="ai-base-url" className="settings-form__input" type="url" value={baseURL} onChange={(event) => setBaseURL(event.target.value)} disabled={provider !== 'openai'} placeholder={DEFAULT_BASE_URL} />
</FormRow>
<FormRow label={<label htmlFor="ai-api-key">API Key</label>}>
  <input id="ai-api-key" className="settings-form__input" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" placeholder="sk-..." />
</FormRow>
<FormRow label={<label htmlFor="ai-model">Model</label>} hint={modelHint}>
  <input id="ai-model" className="settings-form__input" type="text" value={model} onChange={(event) => setModel(event.target.value)} placeholder={modelHint} />
</FormRow>
```

Keep validation, storage, and success behavior unchanged. Change the action label to `Save settings`.

- [ ] **Step 7: Replace nested-card Settings CSS**

Remove `.settings-form__section`, `.settings-form__legend`, `.settings-form__radio`, `.settings-form__field`, `.settings-form__label`, and `.settings-form__hint`. Add a two-segment provider control using only existing tokens; keep `.settings-form__input`, feedback, and action styles.

- [ ] **Step 8: Run Settings and shared UI tests**

Run:

```bash
cd /Users/wanderain/_my_git/design/apps/design && npm test -- framework/src/ui/FormRow.test.tsx framework/src/features/settings/AiConfigForm.test.tsx
```

Expected: PASS with the existing save/validation tests and the new alignment test.

---

### Task 2: Shared Section Header and Add Canvas Disclosure

**Files:**
- Create: `apps/design/framework/src/ui/SectionHeader.tsx`
- Create: `apps/design/framework/src/ui/SectionHeader.css`
- Create: `apps/design/framework/src/ui/DisclosureForm.tsx`
- Create: `apps/design/framework/src/ui/DisclosureForm.css`
- Create: `apps/design/framework/src/features/apps/AppDetailPage.test.tsx`
- Modify: `apps/design/framework/src/features/apps/AppDetailPage.tsx:1-470`
- Modify: `apps/design/framework/src/features/apps/apps.css:234-249,349-405`

**Interfaces:**
- Produces: `SectionHeader({ title, action? })` and `DisclosureForm({ open, id, labelledBy, children })`.
- Consumes: existing `onAddCanvas`, Canvas validation, `emitCanvasesChanged`, and reload behavior.

- [ ] **Step 1: Write the App detail regression test**

Create `AppDetailPage.test.tsx` with mocked `designApi` methods and a route at `/apps/acme`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const api = vi.hoisted(() => ({
  getApp: vi.fn(async () => ({ id: 'acme', name: 'Acme', path: 'apps/acme', style: 'dashboard', layouts: ['sidebar-shell'] })),
  listCanvases: vi.fn(async () => [{ id: 'home', name: 'Home' }]),
  listAssets: vi.fn(async () => []),
  addCanvas: vi.fn(async () => ({ id: 'reports', name: 'Reports' })),
  deleteCanvas: vi.fn(),
  removeAppLayout: vi.fn(),
  applyAsset: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ designApi: api }))
vi.mock('@/lib/confirmTip', () => ({ confirmTip: vi.fn(async () => true) }))
vi.mock('@/lib/canvasEvents', () => ({ emitCanvasesChanged: vi.fn() }))

import { AppDetailPage } from './AppDetailPage'

afterEach(() => { cleanup(); vi.clearAllMocks() })

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/apps/acme']}>
      <Routes><Route path="/apps/:id" element={<AppDetailPage />} /></Routes>
    </MemoryRouter>,
  )
}

describe('AppDetailPage', () => {
  it('hides Add Canvas fields initially and has no App delete action', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Canvases' })
    expect(screen.queryByLabelText('Name')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete app' })).toBeNull()
  })

  it('expands and cancels Add Canvas in place', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add canvas' }))
    expect(screen.getByLabelText('Name')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('collapses after a successful creation', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add canvas' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Reports' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add canvas', exact: true }))
    await waitFor(() => expect(api.addCanvas).toHaveBeenCalled())
    expect(screen.queryByLabelText('Name')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and verify current behavior fails**

Run:

```bash
cd /Users/wanderain/_my_git/design/apps/design && npm test -- framework/src/features/apps/AppDetailPage.test.tsx
```

Expected: FAIL because the form is always visible and Delete App still exists.

- [ ] **Step 3: Implement the shared presentational components**

Create `SectionHeader.tsx`:

```tsx
import type { ReactNode } from 'react'
import './SectionHeader.css'

export function SectionHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return <div className="section-header"><div className="section-header__title">{title}</div>{action ? <div className="section-header__action">{action}</div> : null}</div>
}
```

Create `SectionHeader.css`:

```css
.section-header { display: flex; align-items: center; justify-content: space-between; gap: calc(var(--space) * 2); }
.section-header__title { min-width: 0; }
.section-header__action { flex: 0 0 auto; }
```

Create `DisclosureForm.tsx`:

```tsx
import type { ReactNode } from 'react'
import './DisclosureForm.css'

export function DisclosureForm({ open, id, labelledBy, children }: { open: boolean; id: string; labelledBy: string; children: ReactNode }) {
  if (!open) return null
  return <div id={id} className="disclosure-form" role="region" aria-labelledby={labelledBy}>{children}</div>
}
```

Create `DisclosureForm.css`:

```css
.disclosure-form { padding-top: calc(var(--space) * 0.5); }
```

- [ ] **Step 4: Refactor App detail state and actions**

In `AppDetailPage.tsx`:

- remove `useNavigate`, `navigate`, `onDeleteApp`, and the header `Delete app` action;
- add `const [addCanvasOpen, setAddCanvasOpen] = useState(false)`;
- set `setAddCanvasOpen(false)` after successful `addCanvas` and reload;
- add `onCancelAddCanvas` that clears `formError`, `canvasName`, `canvasId`, and `canvasIdDirty`, then closes;
- render a `SectionHeader` with heading ID `canvases-heading` and a button with `aria-expanded`, `aria-controls="add-canvas-form"`;
- wrap the existing form in `DisclosureForm`;
- add a neutral `Cancel` button beside the submit action.

Use this header structure:

```tsx
<SectionHeader
  title={<h2 id="canvases-heading" className="apps-section__title">Canvases</h2>}
  action={
    !addCanvasOpen ? (
      <button type="button" className="apps-btn" aria-expanded="false" aria-controls="add-canvas-form" onClick={() => setAddCanvasOpen(true)}>
        Add canvas
      </button>
    ) : null
  }
/>
```

- [ ] **Step 5: Finish App-specific disclosure actions**

Keep the existing `.apps-form` field styles. Render the disclosure footer with the neutral Cancel action before the primary submit action:

```tsx
<div className="apps-form__footer">
  <button type="button" className="apps-btn apps-btn--ghost" onClick={onCancelAddCanvas}>Cancel</button>
  <button className="apps-btn" type="submit" disabled={!canSubmit}>{submitting ? 'Adding…' : 'Add canvas'}</button>
</div>
```

- [ ] **Step 6: Run App detail tests**

Run the command from Step 2.

Expected: PASS with 3 tests.

---

### Task 3: Bottom Settings Region and Docked Assistant Shell

**Files:**
- Create: `apps/design/framework/src/shell/SidebarShell.test.tsx`
- Modify: `apps/design/framework/src/shell/SidebarShell.tsx:1-299`
- Modify: `apps/design/framework/src/shell/SidebarShell.css:1-291`
- Modify: `apps/design/framework/src/shell/assistant/AssistantLauncher.tsx:1-28`
- Modify: `apps/design/framework/src/shell/assistant/AssistantPanel.tsx:1-47`
- Modify: `apps/design/framework/src/shell/assistant/AssistantPanel.test.tsx:1-36`
- Modify: `apps/design/framework/src/shell/assistant/assistant.css:1-103`

**Interfaces:**
- Produces: `AssistantLauncher` as a `forwardRef<HTMLButtonElement, Props>` and a nonmodal `AssistantPanel` complementary region.
- `SidebarShell` uses modifier class `sidebar-shell--assistant-open` and three regions: main nav, scrollable workspace, bottom system nav.

- [ ] **Step 1: Update panel tests to describe the nonmodal English contract**

Replace the existing guidance assertions and add Escape coverage:

```tsx
it('renders a nonmodal English assistant region', () => {
  renderPanel(true)
  expect(screen.getByRole('complementary', { name: 'AI Assistant' })).toBeTruthy()
  expect(screen.getByText('Configure an AI provider before starting a conversation.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Open Settings' })).toBeTruthy()
  expect(document.querySelector('.assistant-overlay__scrim')).toBeNull()
})

it('closes on Escape', () => {
  const onClose = vi.fn()
  render(
    <MemoryRouter><AssistantPanel open onClose={onClose} /></MemoryRouter>,
  )
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(1)
})
```

Expected initial failure: current role/name/copy and overlay scrim do not match.

- [ ] **Step 2: Write a Shell structure test**

Create `SidebarShell.test.tsx`:

```tsx
// @vitest-environment jsdom
import { forwardRef, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/lib/api', () => ({
  designApi: {
    listApps: vi.fn(async () => [{ id: 'acme', name: 'Acme', style: 'dashboard', layouts: ['sidebar-shell'] }]),
    listCanvases: vi.fn(async () => [{ id: 'home', name: 'Home' }]),
  },
}))
vi.mock('@/lib/canvasEvents', () => ({ subscribeCanvasesChanged: () => () => {} }))
vi.mock('@/lib/theme', () => ({
  getTheme: () => 'dark',
  setTheme: vi.fn(),
  subscribeTheme: () => () => {},
}))
vi.mock('./assistant/AssistantProvider', () => ({ AssistantProvider: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('./assistant/AssistantLauncher', () => ({
  AssistantLauncher: forwardRef<HTMLButtonElement, { open: boolean; onToggle: () => void }>(
    ({ open, onToggle }, ref) => <button ref={ref} onClick={onToggle}>{open ? 'Close assistant' : 'Open assistant'}</button>,
  ),
}))
vi.mock('./assistant/AssistantPanel', () => ({
  AssistantPanel: ({ open }: { open: boolean }) => open ? <aside aria-label="AI Assistant" /> : null,
}))

import { SidebarShell } from './SidebarShell'

afterEach(cleanup)

describe('SidebarShell', () => {
  it('anchors Settings in System and marks the assistant-open layout', async () => {
    render(<MemoryRouter><SidebarShell><div>Main content</div></SidebarShell></MemoryRouter>)
    await screen.findByText('Acme')
    const system = screen.getByRole('navigation', { name: 'System' })
    expect(system.querySelector('a[href="/settings"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }))
    expect(document.querySelector('.sidebar-shell--assistant-open')).toBeTruthy()
    expect(screen.getByLabelText('AI Assistant')).toBeTruthy()
  })
})
```

Expected initial failure: System is not a distinct bottom navigation region and the shell lacks the modifier class.

- [ ] **Step 3: Run the focused Shell tests and verify failures**

Run:

```bash
cd /Users/wanderain/_my_git/design/apps/design && npm test -- framework/src/shell/assistant/AssistantPanel.test.tsx framework/src/shell/SidebarShell.test.tsx
```

Expected: FAIL on the new semantics and layout hooks.

- [ ] **Step 4: Convert the assistant panel to a docked region**

Replace the overlay wrapper with:

```tsx
<aside className="assistant-panel" aria-label="AI Assistant">
  <header className="assistant-panel__header">
    <span>AI Assistant</span>
    <button type="button" className="assistant-panel__close" onClick={onClose} aria-label="Close assistant">×</button>
  </header>
  <div className="assistant-panel__body">
    {configured ? <AssistantThread /> : (
      <div className="assistant-panel__guidance">
        <p>Configure an AI provider before starting a conversation.</p>
        <Link to="/settings">Open Settings</Link>
      </div>
    )}
  </div>
</aside>
```

Keep the existing Escape effect. Do not set `role="dialog"`, `aria-modal`, body overflow, or render a scrim.

- [ ] **Step 5: Forward the launcher ref and make its title English**

Use `forwardRef<HTMLButtonElement, AssistantLauncherProps>` and attach the ref to the button. Keep `aria-label`, `aria-pressed`, and availability behavior; change `title` to `AI Assistant`.

- [ ] **Step 6: Split Sidebar into main, Workspace, and System regions**

Restructure the sidebar so primary links and Assets stay at the top, the dynamic App/Canvas tree is inside `.sidebar-shell__workspace`, and Settings is inside:

```tsx
<nav className="sidebar-shell__system" aria-label="System">
  <NavLink to="/settings" className={navLinkClassName}>
    <SettingsIcon />
    <span className="sidebar-shell__nav-link-text">Settings</span>
  </NavLink>
</nav>
```

Add `const launcherRef = useRef<HTMLButtonElement>(null)`, apply the open modifier class, and centralize close behavior:

```tsx
function closeAssistant() {
  setAssistantOpen(false)
  window.requestAnimationFrame(() => launcherRef.current?.focus())
}
```

Pass `ref={launcherRef}` to `AssistantLauncher` and `onClose={closeAssistant}` to the panel.

- [ ] **Step 7: Implement desktop and narrow docked CSS**

Replace fixed overlay CSS with Shell grid placement:

```css
.sidebar-shell--assistant-open { grid-template-columns: var(--sidebar-w) minmax(0, 1fr) minmax(360px, 420px); }
.sidebar-shell__header { grid-column: 1 / -1; }
.sidebar-shell__main { grid-column: 2; min-width: 0; }
.assistant-panel { grid-column: 3; grid-row: 2; min-width: 0; height: 100%; border-left: 1px solid var(--color-border); background: var(--color-surface); }
.sidebar-shell__sidebar { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.sidebar-shell__workspace { flex: 1; min-height: 0; overflow-y: auto; }
.sidebar-shell__system { flex: 0 0 auto; padding-top: calc(var(--space) * 1.5); border-top: 1px solid var(--color-border); }
```

At the existing narrow breakpoint, place `.assistant-panel` in the main workspace cell and hide `.sidebar-shell--assistant-open .sidebar-shell__main`. Remove `.assistant-overlay`, `.assistant-overlay__scrim`, overlay z-index, blur, and wide shadow. Add a reduced-motion rule that disables panel animation.

- [ ] **Step 8: Run Shell tests**

Run the command from Step 3.

Expected: PASS.

---

### Task 4: Common Markdown Rendering and English Thread Copy

**Files:**
- Modify: `apps/design/package.json`
- Modify: `apps/design/package-lock.json`
- Create: `apps/design/framework/src/shell/assistant/AssistantMarkdown.tsx`
- Create: `apps/design/framework/src/shell/assistant/AssistantThread.test.tsx`
- Modify: `apps/design/framework/src/shell/assistant/AssistantThread.tsx:1-44`
- Modify: `apps/design/framework/src/shell/assistant/assistant.css:105-201`

**Interfaces:**
- Produces: `AssistantMarkdown()` using `MarkdownTextPrimitive`.
- `AssistantThread` registers it only as `MessagePrimitive.Parts.components.Text`, preserving tool-call parts.

- [ ] **Step 1: Install the approved Markdown dependency**

Run:

```bash
cd /Users/wanderain/_my_git/design/apps/design && npm install @assistant-ui/react-markdown@^0.14.1
```

Expected: `package.json` and `package-lock.json` add `@assistant-ui/react-markdown`; no GFM or syntax-highlighting package is added.

- [ ] **Step 2: Write the failing thread test with primitive mocks**

Create `AssistantThread.test.tsx` that mocks assistant-ui primitives as semantic wrappers and captures the `components.Text` override:

```tsx
// @vitest-environment jsdom
import type { ComponentType, ReactNode, TextareaHTMLAttributes } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@assistant-ui/react-markdown', () => ({
  MarkdownTextPrimitive: ({ className }: { className?: string }) => <div data-testid="assistant-markdown" className={className} />,
}))
vi.mock('@assistant-ui/react', () => ({
  ThreadPrimitive: {
    Root: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Viewport: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Empty: ({ children }: { children: ReactNode }) => <>{children}</>,
    Messages: ({ children }: { children: (value: { message: { role: string } }) => ReactNode }) => <>{children({ message: { role: 'assistant' } })}</>,
  },
  MessagePrimitive: {
    Root: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Parts: ({ components }: { components?: { Text?: ComponentType } }) => {
      const Text = components?.Text
      return Text ? <Text /> : null
    },
  },
  ComposerPrimitive: {
    Root: ({ children }: { children: ReactNode }) => <form>{children}</form>,
    Input: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
    Send: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  },
}))

import { AssistantThread } from './AssistantThread'

afterEach(cleanup)

describe('AssistantThread', () => {
  it('uses the Markdown text renderer and English composer copy', () => {
    render(<AssistantThread />)
    expect(screen.getByTestId('assistant-markdown')).toBeTruthy()
    expect(screen.getByText(/Describe the design style or layout/)).toBeTruthy()
    expect(screen.getByPlaceholderText('Describe what you need…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
  })
})
```

Run:

```bash
cd /Users/wanderain/_my_git/design/apps/design && npm test -- framework/src/shell/assistant/AssistantThread.test.tsx
```

Expected: FAIL because current copy is Chinese.

- [ ] **Step 3: Implement the Markdown wrapper**

Create `AssistantMarkdown.tsx`:

```tsx
import { memo } from 'react'
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'

function AssistantMarkdownImpl() {
  return <MarkdownTextPrimitive className="aui-md" />
}

export const AssistantMarkdown = memo(AssistantMarkdownImpl)
```

Do not replace `MessagePrimitive.Parts`; override only its text component.

- [ ] **Step 4: Wire Markdown and English copy into the thread**

In `AssistantBubble`:

```tsx
<MessagePrimitive.Parts components={{ Text: AssistantMarkdown }} />
```

Keep `UserBubble` on the default text renderer. Replace empty guidance, placeholder, and send label with:

```tsx
Describe the design style or layout you need, for example: “A dark finance dashboard with cool colors.”
```

```tsx
placeholder="Describe what you need…"
```

```tsx
<ComposerPrimitive.Send className="aui-composer-send">Send</ComposerPrimitive.Send>
```

- [ ] **Step 5: Add token-based Markdown typography**

Remove `white-space: pre-wrap` from assistant message text and add `.aui-md` descendant styles for `p`, `h1`–`h4`, `strong`, `em`, `blockquote`, `ul`, `ol`, `a`, `code`, and `pre`. Use existing text, muted, border, primary, and surface tokens; keep blockquote to a 1px neutral border and keep all message prose within the panel width.

- [ ] **Step 6: Run thread and panel tests**

Run:

```bash
cd /Users/wanderain/_my_git/design/apps/design && npm test -- framework/src/shell/assistant/AssistantThread.test.tsx framework/src/shell/assistant/AssistantPanel.test.tsx
```

Expected: PASS.

---

### Task 5: Reliable Immediate Multi-turn Filtering

**Files:**
- Modify: `apps/design/framework/src/features/assets/assistantFilterTool.tsx:8-90`
- Modify: `apps/design/framework/src/features/assets/assistantFilterTool.test.tsx:11-35`
- Modify: `apps/design/framework/public/prompts/asset-search.md:1-28`
- Verify: `apps/design/framework/src/lib/ai/promptBuild.test.ts`

**Interfaces:**
- `ApplyFilterResult` adds `changed: boolean`.
- `applyFilterExecute` updates `filterRef.current` before invoking `onFilterChange`, so consecutive executions never read stale state.

- [ ] **Step 1: Write the failing consecutive-turn test**

Add to `assistantFilterTool.test.tsx`:

```tsx
it('accumulates consecutive deltas against the latest filter before rerender', () => {
  const filterRef = { current: emptyFilter() }
  const onFilterChange = vi.fn()

  applyFilterExecute(
    { add: [{ kind: 'tag', label: 'dark', value: 'dark' }], remove: [] },
    { index, filterRef, onFilterChange },
  )
  const second = applyFilterExecute(
    { add: [{ kind: 'origin', label: 'x', value: 'x' }], remove: [] },
    { index, filterRef, onFilterChange },
  )

  expect(filterRef.current.chips.map((chip) => chip.id)).toEqual(['tag:dark', 'origin:x'])
  expect(second.changed).toBe(true)
  expect(onFilterChange).toHaveBeenLastCalledWith(filterRef.current)
})

it('reports no change for an empty delta', () => {
  const filterRef = { current: emptyFilter() }
  const result = applyFilterExecute(
    { add: [], remove: [] },
    { index, filterRef, onFilterChange: vi.fn() },
  )
  expect(result.changed).toBe(false)
})
```

- [ ] **Step 2: Run the test and verify stale-ref failure**

Run:

```bash
cd /Users/wanderain/_my_git/design/apps/design && npm test -- framework/src/features/assets/assistantFilterTool.test.tsx
```

Expected: FAIL because the second execution currently starts from the original empty ref and `changed` does not exist.

- [ ] **Step 3: Advance the mutable ref synchronously and report truthful state**

Update `ApplyFilterResult` and `applyFilterExecute`:

```tsx
export type ApplyFilterResult = {
  applied: { add: ApplyFilterArgs['add']; remove: string[] }
  matchCount: number
  changed: boolean
}

export function applyFilterExecute(args: ApplyFilterArgs, ctx: ApplyFilterCtx): ApplyFilterResult {
  const previous = ctx.filterRef.current
  const next = mergeFilterDelta(previous, { add: args.add, remove: args.remove }, 'ai')
  const changed =
    previous.chips.length !== next.chips.length ||
    previous.chips.some((chip, index) => chip.id !== next.chips[index]?.id)
  ctx.filterRef.current = next
  if (changed) ctx.onFilterChange(next)
  return {
    applied: { add: args.add, remove: args.remove },
    matchCount: applyFilter(ctx.index, next).length,
    changed,
  }
}
```

Update `FilterDeltaCard` states to English:

- no result: `Applying filters…`;
- `changed === false`: `No filter changes`;
- changed result: `+label · -id` plus `${matchCount} matches`.

- [ ] **Step 4: Make the system prompt explicit and fully English**

Update the prompt so every user message containing a filter criterion calls `apply_filter`, each call is an incremental delta against Current chips, and follow-up turns may add or remove conditions. Replace Chinese labels/refusal examples with English examples while preserving “answer in the user's language.”

- [ ] **Step 5: Run filtering and prompt tests**

Run:

```bash
cd /Users/wanderain/_my_git/design/apps/design && npm test -- framework/src/features/assets/assistantFilterTool.test.tsx framework/src/lib/ai/promptBuild.test.ts
```

Expected: PASS; the prompt builder still injects updated Current chips and candidates.

---

### Task 6: Public Documentation and Full Verification

**Files:**
- Modify: `docs/dev/api/assistant-ui-chat.md:9-80`
- Verify all files modified in Tasks 1–5.

**Interfaces:**
- Documents the reusable assistant contract after implementation; no new storage or filesystem API is introduced.

- [ ] **Step 1: Update the assistant API documentation**

Document these exact changes:

- `AssistantPanel` is a nonmodal docked Shell region, not an overlay;
- desktop opening reflows the workspace and narrow opening replaces the workspace region without a scrim;
- `AssistantMarkdown` overrides only `MessagePrimitive.Parts.components.Text`, preserving tool parts;
- supported common Markdown elements;
- `apply_filter` execution updates the latest filter ref and visible results immediately;
- consecutive turns merge incremental deltas;
- all affected shell and tool-result copy is English.

- [ ] **Step 2: Run all focused tests together**

Run:

```bash
cd /Users/wanderain/_my_git/design/apps/design && npm test -- framework/src/ui/FormRow.test.tsx framework/src/features/settings/AiConfigForm.test.tsx framework/src/features/apps/AppDetailPage.test.tsx framework/src/shell/SidebarShell.test.tsx framework/src/shell/assistant/AssistantPanel.test.tsx framework/src/shell/assistant/AssistantThread.test.tsx framework/src/features/assets/assistantFilterTool.test.tsx framework/src/lib/ai/promptBuild.test.ts
```

Expected: PASS with no unhandled rejections or React act warnings.

- [ ] **Step 3: Run the complete test suite**

Run:

```bash
cd /Users/wanderain/_my_git/design/apps/design && npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Run the production build**

Run:

```bash
cd /Users/wanderain/_my_git/design/apps/design && npm run build
```

Expected: TypeScript and Vite build complete successfully without warnings introduced by modified files.

- [ ] **Step 5: Browser smoke-test the desktop flow**

Run the dev server, then verify:

1. Open Rule or Layout and launch AI.
2. Confirm the workspace narrows and remains interactive with no scrim.
3. Send a prompt that produces bold text, a blockquote, and a list; confirm rendered Markdown.
4. Ask for a dark style, then add a finance criterion in a second turn; confirm chips and visible cards update after each turn.
5. Remove one condition in a third turn; confirm only that chip is removed.
6. Open Settings; confirm aligned controls and bottom-anchored Settings navigation.
7. Open App detail; confirm no Delete App, Add Canvas is collapsed, Cancel closes it, and successful creation closes it.

- [ ] **Step 6: Browser smoke-test narrow widths and both themes**

At widths below the chosen Shell breakpoint, confirm the assistant replaces the workspace region without a scrim and closes back to content. Repeat the core visual checks in light and dark themes, including focus-visible and reduced-motion behavior.

- [ ] **Step 7: Inspect final changes without committing**

Run:

```bash
cd /Users/wanderain/_my_git/design && git --no-pager diff --check && git --no-pager status --short
```

Expected: no whitespace errors; only the approved dependency, implementation, tests, API documentation, spec, and plan are changed. Leave changes uncommitted unless the user explicitly requests a commit.
