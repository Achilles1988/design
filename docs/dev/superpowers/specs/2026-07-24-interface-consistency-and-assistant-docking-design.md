# Interface Consistency and Assistant Docking

Date: 2026-07-24
Status: Approved for implementation planning
Scope: `apps/design/framework`

## 1. Goal

Improve three related product surfaces without changing their underlying product scope:

1. Make the AI assistant a docked workspace panel instead of a modal overlay.
2. Restore useful Markdown rendering and make multi-turn AI prompts update asset filters immediately.
3. Align Settings controls, move Settings navigation to the bottom of the sidebar, and simplify App detail actions.

All user-facing interface copy in the affected surfaces must be English.

## 2. Constraints

- Follow `.wn-ai/lessons/lesson.md` and the `design` App configuration in `apps/design/apps/design/app.json`.
- The configured `dashboard` style is mandatory: existing tokens, IBM Plex Sans, 8pt spacing rhythm, restrained primary color, clear state hierarchy, and 150–250 ms transitions.
- The configured `sidebar-shell` layout is preferred, but the assistant may add a natural right-side workspace region.
- Reuse and extend shared UI patterns rather than creating parallel visual vocabularies.
- Adding the assistant-ui official Markdown renderer is approved as part of the common Markdown option selected during design.
- Public assistant contracts or configuration behavior changed by implementation must be documented under `docs/dev/api/` in the same change.

## 3. Chosen Approach

Use a bounded shared-component refactor before applying the surface changes.

The refactor may introduce reusable form rows, section headers, disclosure behavior, and Markdown rendering, but it must not expand into a general component-library rewrite or unrelated page migration.

## 4. Shared UI Boundaries

### 4.1 Form row

Introduce a shared form-row pattern under `framework/src/ui/` with:

- a fixed label column;
- a flexible control column;
- optional hint and error content;
- accessible label/control association;
- consistent spacing and control states.

Settings Provider, Base URL, API Key, and Model use this structure. Provider is rendered as a segmented or radio control in the same row hierarchy as the text inputs, not as a nested fieldset card.

### 4.2 Section header

Introduce a shared section header that supports a title and optional right-aligned action. App detail uses it for `Canvases` and `Add canvas`.

### 4.3 Disclosure form

Introduce a small controlled disclosure pattern for forms that need collapsed and expanded states. It owns presentation and accessibility state only; App detail continues to own Canvas input values, validation, and requests.

### 4.4 Assistant Markdown

Wrap the official assistant-ui Markdown renderer in a project component. The wrapper owns:

- allowed common Markdown presentation;
- project-token styling;
- safe fallback to plain text;
- typography for headings, emphasis, blockquotes, lists, links, inline code, and code blocks.

User messages remain plain text. Markdown rendering applies only to assistant text.

## 5. Assistant Layout and Interaction

### 5.1 Desktop

The assistant becomes a docked right-side workspace panel:

- no full-page overlay;
- no scrim or background blur;
- no body scroll lock;
- approximately 420 px wide, bounded by the available viewport;
- opening the panel reduces the main workspace width;
- closing it restores the main workspace width;
- the sidebar remains available while the assistant is open.

`SidebarShell` owns the open state and layout. `AssistantPanel` remains business-agnostic and renders only the assistant surface.

### 5.2 Narrow viewports

When the viewport cannot support useful main-content and assistant widths together, the assistant occupies the workspace region as a dedicated view. It does not add a translucent modal scrim. Closing returns to the previous workspace content.

### 5.3 Focus and motion

- `Escape` closes the panel.
- The close control has an English accessible label.
- Focus returns to the launcher after closing.
- Panel transitions use existing dashboard timing and respect reduced-motion preferences.

### 5.4 English copy

Affected copy becomes English, including:

- `AI Assistant`;
- empty-state guidance;
- composer placeholder and `Send`;
- configuration guidance and `Open Settings`;
- filter-change summaries and match counts;
- panel accessible labels.

## 6. Multi-turn Asset Filtering

AI filtering remains tool-driven and applies automatically.

For every relevant turn:

1. The model receives the current filter chips and the currently matching candidate set.
2. The model may call `apply_filter` with an incremental `add/remove` delta.
3. Tool execution reads the latest filter through `filterRef` and merges the delta without replacing earlier-turn filters.
4. The merged filter immediately updates `AssetBrowserPage` state.
5. Chips, package count, and visible asset cards update in the same turn.
6. The tool result reports the applied delta and current match count in English.
7. The next turn receives the updated filter and candidate context, allowing additional filters, removals, or corrections.

A normal assistant reply without an `apply_filter` call does not change the filter. Empty deltas do not claim that filters changed. Tool failure preserves the current filter and produces a retryable assistant error.

## 7. Settings

### 7.1 Page form

The AI Provider section uses one aligned field grid:

- Provider;
- Base URL;
- API Key;
- Model.

All controls share the same width, border, radius, height vocabulary, focus treatment, and label alignment. Base URL remains disabled when it does not apply, with concise helper text explaining availability. Save feedback appears near the action area without causing disruptive layout movement.

### 7.2 Sidebar placement

The sidebar is structured as:

1. primary Apps and Assets navigation;
2. independently scrollable Workspace App/Canvas tree;
3. bottom-anchored System/Settings navigation.

Settings remains reachable when the Workspace tree is long and is visually separated without introducing a second competing navigation style.

## 8. App Detail

### 8.1 Add Canvas

- The form is hidden by default.
- `Add canvas` appears on the right side of the Canvases section header.
- Selecting it expands the existing Name and ID fields in place.
- The expanded form provides `Cancel`.
- Cancel clears temporary form errors and collapses the form.
- Validation failure keeps the form open.
- Successful creation clears inputs, collapses the form, refreshes the Canvas list, and emits the existing sidebar refresh event.

### 8.2 Delete App

Remove `Delete app` from App detail, including its handler and unused navigation dependency. App deletion remains available from the Apps list, preserving a single destructive entry point.

Canvas deletion remains unchanged.

## 9. Error and Empty States

- Missing AI configuration: English guidance with an `Open Settings` link.
- AI request failure: preserve the conversation and current filters; show a retryable error.
- Tool execution failure: preserve filters and return a structured failure result to the assistant runtime.
- Markdown renderer failure: render safe plain text for the affected content.
- Settings validation failure: keep values and show field/form feedback in the aligned form structure.
- Add Canvas validation or request failure: keep the disclosure open and preserve entered values.

## 10. Testing

### Assistant

- `AssistantPanel`: no overlay or scrim, docked shell behavior, close behavior, narrow-viewport mode, and focus return.
- `AssistantThread`: English copy and common Markdown rendering for emphasis, blockquote, list, link, inline code, and code block.
- Reduced-motion behavior is covered by CSS review and browser smoke testing.

### Filtering

- Consecutive `apply_filter` calls merge against the latest filter.
- Add and remove operations update chips, count, and visible assets immediately.
- A turn without a tool call leaves filters unchanged.
- Empty delta and tool failure do not produce misleading success state.

### Shared UI and Settings

- Form row label/control association, hints, errors, and disabled state.
- Provider switching controls Base URL availability.
- Save validation and success feedback remain functional.
- Sidebar renders Settings below the Workspace region.

### App detail

- Add Canvas form is initially hidden.
- Add and Cancel controls toggle the disclosure.
- Validation failure keeps it open.
- Successful creation clears and collapses it.
- App detail does not render Delete App.
- Apps list continues to render and execute App deletion.

### Verification

Run the focused unit/component tests, the complete test suite, and the production build. Perform browser smoke checks at desktop and narrow viewport widths for both themes.

## 11. Documentation Impact

Update `docs/dev/api/assistant-ui-chat.md` if the Markdown renderer contract, panel integration boundary, or tool-result behavior is part of the reusable assistant API. No filesystem API or AI configuration storage schema change is planned.

## 12. Out of Scope

- Resizable assistant width.
- Conversation persistence or multiple assistant threads.
- New AI providers or configuration fields.
- Redesigning the Apps list.
- Changing Canvas deletion.
- Migrating unrelated forms to the new shared components.
- Replacing the existing dashboard tokens or sidebar-shell information architecture.

## 13. Success Criteria

1. Opening AI never masks the workspace on desktop; it occupies a docked right-side region.
2. Common Markdown is visibly rendered in assistant responses.
3. Multi-turn prompts incrementally and automatically update the asset filters and visible results.
4. All affected interface copy is English.
5. Settings fields share one aligned visual structure, and Settings remains fixed at the bottom of the sidebar.
6. Add Canvas is collapsed by default and returns to that state after cancel or successful creation.
7. App detail no longer exposes App deletion, while deletion remains available from Apps.
8. Tests and the production build pass without introducing warnings in modified files.
