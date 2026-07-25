# Canvas Rename, Assistant UX, and README

Date: 2026-07-25
Status: Approved for implementation planning
Scope: `apps/design/framework` (design-fs, assistant shell, canvas apply preview), root `readme.md`, delete `apps/design/README.md`

## 1. Goal

Ship a bounded polish pass covering four product surfaces:

1. Full Canvas rename (`name`, `id`, and component file) from App detail.
2. Visible AI chat progress (generating + tool stages) and GFM Markdown tables in assistant replies.
3. Progressive reveal of the canvas preview after a successful Apply.
4. Root README updates (AI-authored project framing, AI capabilities, library acknowledgements) and removal of the redundant `apps/design/README.md`.

All new user-facing copy in the affected UI surfaces remains English.

## 2. Constraints

- Follow `.wn-ai/lessons/lesson.md` and the `design` App configuration in `apps/design/apps/design/app.json`.
- Configured `dashboard` style is mandatory (tokens, typography, 8pt rhythm, 150–250 ms motion).
- Prefer existing `sidebar-shell` patterns; do not invent a parallel visual vocabulary.
- Public design-fs and assistant contracts changed by this work must be documented under `docs/dev/api/` in the same change.
- Respect `prefers-reduced-motion`.
- Do not auto-navigate away from an old canvas route after rename; prompt the user instead.

## 3. Chosen Approach

Thin cross-cutting delivery: one implementation plan, minimal closed loops per area. Prefer assistant-ui running/streaming primitives and existing apply stage machinery over new frameworks. Progressive reveal is a remount animation, not streamed source generation.

## 4. Canvas Rename

### 4.1 API and storage

Add design-fs rename:

- HTTP: `POST /apps/:appId/canvases/:canvasId/rename`
- Body: `{ "id": string, "name": string }`
- Response: updated `CanvasEntry`

Server behavior:

1. Validate app and source canvas exist; validate new `id` and `name` with the same rules as add-canvas.
2. Derive the target component filename via existing `nameToComponentFile(name, id)`.
3. If another canvas already owns the new `id` or the new `component`, fail with no disk mutation.
4. If `id`, `name`, and `component` are unchanged, return the current entry (no-op).
5. When the component path changes, `fs.rename` the `.tsx` file, then rewrite `canvases.json` for that entry’s `id` / `name` / `component`.
6. If JSON write fails after rename, attempt to rename the file back, then surface the error (avoid half-applied state).

Client:

- `designApi.renameCanvas(appId, canvasId, { id, name })`
- On success: refresh App detail canvases, `emitCanvasesChanged` so the sidebar tree updates.

Document in `docs/dev/api/design-fs.md` (endpoint, body, errors, client helper).

### 4.2 App detail UI

Entry point is App detail only (not the sidebar).

- Each canvas row reveals an **Edit** control on hover and keyboard `focus-within`, in the same action cluster as Delete.
- Edit expands an inline Name + ID form aligned with Add canvas:
  - Changing Name updates ID while ID is not dirty (`slugify`).
  - Manual ID edits mark ID dirty.
- **Save** / **Cancel**; validation or request failure keeps the row in edit mode with English errors.
- Success exits edit mode and refreshes the list.

### 4.3 Open canvas on old route

If the current URL targets the renamed canvas’s old `id`:

- Do not automatically navigate to the new route.
- Show a dismissible English banner such as: Canvas renamed. Open “{name}” with a link to the new route.
- Staying on the old URL may yield empty/not-found preview; the banner is the recovery path.

If the user is not on that canvas route, only refresh lists/sidebar; no banner.

## 5. Assistant Loading and Tool Stages

### 5.1 Generating state

While the assistant runtime is running (including the pre-first-token gap):

- Composer shows a clear busy state (`aria-busy`, disabled send as appropriate).
- Thread shows an explicit **Generating** indicator using assistant-ui running/streaming primitives where possible.
- Existing conversation hydration copy (“Loading conversation…”) stays separate and must not be reused as generating copy.

### 5.2 Tool stages

Keep tool-driven flows; make in-progress states visible:

| Phase | User-visible feedback |
| --- | --- |
| Model calling / waiting on a tool | In-progress label on the tool surface (`Working…` or tool-specific English) |
| Layout recommend / install | Preserve current flow; ensure an in-progress state is visible |
| `propose_canvas_change` awaiting review | Proposal card; not a loading state |
| Apply `checking` → `writing` → `validating` → `repairing` | Existing stage machine; each stage must remain readable (no silent stall) |
| Asset `apply_filter` | Brief in-progress, then existing English filter summary |
| Complete / error | Clear generating; on failure keep conversation and filters, allow retry |

Rule: any non-instant model or tool wait must not present as an empty assistant bubble with no status.

## 6. Markdown Tables

- Enable GFM tables in `AssistantMarkdown` (`@assistant-ui/react-markdown`).
- Assistant messages only; user messages remain plain text.
- Style tables with dashboard tokens; allow horizontal scroll inside the docked panel so wide tables do not blow the layout.
- Unchanged exclusions: task lists, external images, syntax highlighting.
- Renderer failure falls back to plain text for the affected content.
- Update `docs/dev/api/assistant-ui-chat.md` so tables are listed as supported.

## 7. Apply Progressive Reveal

Trigger: `canvas-assistant:applied` for the currently previewed app/canvas, after remount.

Behavior:

1. Mark the preview root for reveal (for example `data-canvas-reveal`).
2. Stagger fade/slide-in on primary content blocks (preview root direct children or an agreed section selector), using dashboard motion (about 150–250 ms per step, restrained total duration).
3. Under `prefers-reduced-motion: reduce`, use a single fade or immediate show—no stagger.
4. Remove temporary reveal attributes after completion so later layout/interaction is unaffected.

Out of scope for reveal: streaming source into the preview, long skeleton overlays that block interaction, changes to the apply transaction itself.

## 8. README and Docs Cleanup

### 8.1 Root `readme.md`

- Overview: state clearly that this engineering app was built with AI collaboration (drafts, tooling, and interaction surfaces), without changing the product positioning.
- Core Features: make AI interaction capabilities explicit—at least **filter assets** and **create canvases**—aligned with existing App / Canvas / Asset bullets (avoid duplicate laundry lists).
- Canvas management bullet: reflect rename support once implemented (add / remove / rename).
- Fold in a short Getting started (or equivalent) so deleting `apps/design/README.md` does not orphan `cd apps/design` / `npm run dev` / scripts pointers. Keep it brief; deep contracts stay in `docs/dev/api/`.
- End with Acknowledgements / Credits naming libraries actually used, with respectful attribution, including at least:
  - Vercel AI SDK (`ai`)
  - assistant-ui (`@assistant-ui/react`, and `@assistant-ui/react-markdown` as used)

### 8.2 Delete `apps/design/README.md`

- Remove `apps/design/README.md`.
- Do not leave the repo depending on it for setup; root `readme.md` carries the minimal run pointers above.
- Historical references inside old `docs/dev/superpowers/plans/*` may remain as archive; no need to rewrite past plans unless a live doc still points readers there as current guidance. Fix any current-facing links (for example AGENTS/CLAUDE/memory pointers) if present.

## 9. Error and Empty States

- Rename validation / conflict / missing file / write failure: English error, edit mode retained; best-effort file rollback after failed JSON write.
- Missing AI config / request failure: existing behavior plus visible busy clearance.
- Markdown table render failure: plain-text fallback for affected content.
- Reveal failure: show the remounted preview without animation; do not block Apply success.
- Old-route-after-rename: banner with link; no forced navigation.

## 10. Testing

### Rename

- Store: rename updates `id` / `name` / `component` and renames the file; conflicts leave disk unchanged; no-op path; rollback path when JSON write fails after file rename.
- HTTP/client wiring for the new endpoint.
- App detail: hover/focus Edit, Save/Cancel, validation retention, list + sidebar refresh via `emitCanvasesChanged`.
- Current old canvas route shows banner and link; other routes do not.

### Assistant

- Generating indicator while `isRunning`, including pre-token gap.
- Tool in-progress visibility for canvas apply stages and asset filter.
- GFM table rendering and horizontal overflow behavior in the dock.
- Reduced-motion path for reveal.

### README

- Manual review that Overview, AI capabilities, Getting started, and Credits are present; `apps/design/README.md` is gone; no broken current-facing links.

### Verification

Focused unit/component tests for touched modules, full test suite, and production build. Browser smoke for App detail rename, assistant generating + table, and apply reveal (with and without reduced motion).

## 11. Documentation Impact

| Doc | Change |
| --- | --- |
| `docs/dev/api/design-fs.md` | Canvas rename endpoint + client helper |
| `docs/dev/api/assistant-ui-chat.md` | Tables supported; generating/running UX contract if part of the reusable surface |
| `docs/dev/api/canvas-assistant.md` | Only if apply/reveal or tool-stage copy becomes part of the documented protocol |
| Root `readme.md` | Overview, AI capabilities, Getting started, Credits |
| `apps/design/README.md` | Deleted |

## 12. Out of Scope

- Sidebar or context-menu rename.
- Auto-navigation to the new canvas id after rename.
- Conversation persistence / multi-thread assistant.
- New AI providers or settings fields.
- Task-list Markdown, external images, or syntax highlighting.
- True token-streamed page generation into the preview.
- Rewriting archived superpowers plans that historically mentioned `apps/design/README.md`.

## 13. Success Criteria

1. From App detail, a canvas can be renamed (name, id, component file) with conflict-safe disk updates and list/sidebar refresh.
2. Renaming the currently opened canvas does not auto-route; a banner offers the new link.
3. While the model or tools run, the user always sees generating or stage feedback—not a blank stall.
4. Assistant Markdown tables render correctly inside the docked panel.
5. After Apply, the matching preview remounts with a restrained progressive reveal (or reduced-motion fallback).
6. Root README states AI authorship, documents filter-assets and create-canvas AI capabilities, includes Getting started, and credits Vercel AI SDK and assistant-ui.
7. `apps/design/README.md` is removed without leaving current-facing setup docs stranded.
8. API docs match the new contracts; tests and production build pass without new warnings in modified files.
