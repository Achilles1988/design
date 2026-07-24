# Canvas AI Multimodal References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the completed Canvas AI authoring core so one message can combine text, multiple pasted screenshots, and multiple server-rendered URL screenshots that persist per Canvas in IndexedDB.

**Architecture:** Store image Blobs in a versioned IndexedDB object store and place only `wn-attachment:<id>` references in assistant-ui messages. A custom attachment adapter and Composer controller enforce limits and render previews. Canvas chat upgrades from JSON to multipart so the server receives the small message envelope plus referenced Blobs; a Playwright-backed endpoint captures explicit `http/https` URLs in an isolated browser context before the user confirms sending.

**Tech Stack:** React 19, TypeScript 5.7, assistant-ui attachment APIs, IndexedDB, Vite middleware, Node Web `Request.formData()`, Playwright Chromium, AI SDK multimodal messages, Vitest/jsdom.

## Global Constraints

- Execute only after `2026-07-24-canvas-ai-authoring-core.md` passes its completion gate.
- Use an isolated worktree and the same mandatory project documentation/read-review rules as the core plan.
- Add exactly one new direct dependency: `playwright` as a dev dependency, plus its managed Chromium.
- Support clipboard PNG, JPEG, and WebP only; do not add a file picker, drag-and-drop, `file:`, local HTML upload, or default-browser Profile access.
- Allow public, localhost, and private-network `http/https` URLs explicitly supplied in the Composer.
- Use a `1440 × 1000` viewport; `DOMContentLoaded` timeout 15 seconds; total capture timeout 20 seconds; at most 5 redirects; viewport screenshot only.
- Allow at most 8 visual references, at most 4 URL references, at most 10 MB per original image, and at most 30 MB visual data per message.
- The multipart chat request also has a 30 MB cap across all unique image references in the retained 40-message history; if restored history exceeds it, keep the Composer intact and ask the user to start a new chat instead of silently dropping old images.
- Persist images in IndexedDB by Canvas page key; never write them to `localStorage`, the user App, or the server filesystem.
- URL capture failures pause generation until the user pastes a replacement screenshot or removes the failed reference.
- If the configured model rejects visual input, do not generate a proposal; retain the Composer and attachments.
- All framework copy remains English.
- Update `docs/dev/api/assistant-ui-chat.md` and `docs/dev/api/canvas-assistant.md` in the same tasks as protocol changes.

---

## File Map

### Browser attachment storage

- Create `apps/design/framework/src/shell/assistant/visualAttachmentStore.ts`: IndexedDB records, page cleanup, reference reconciliation.
- Create `apps/design/framework/src/shell/assistant/visualAttachmentAdapter.ts`: assistant-ui adapter using `wn-attachment:` URIs.
- Create `apps/design/framework/src/shell/assistant/VisualAttachment.tsx`: composer/message thumbnails with object-URL cleanup.
- Create `apps/design/framework/src/shell/assistant/useCanvasReferences.ts`: URL draft state, paste policy, capture-before-send control.
- Modify `AssistantProvider.tsx`, `AssistantThread.tsx`, `AssistantPanel.tsx`, `pageState.ts`, `pageSession.tsx`, and assistant CSS.

### Server URL capture and multipart chat

- Create `apps/design/framework/vite-plugins/canvas-assistant/capture.ts`: Playwright browser lifecycle and screenshot rules.
- Modify `apps/design/framework/vite-plugins/canvas-assistant/plugin.ts`: capture route and multipart parser.
- Modify `apps/design/framework/vite-plugins/canvas-assistant/model.ts`: resolve multipart images into AI SDK image parts.
- Modify `canvasAssistantProtocol.ts`, `canvasAssistantApi.ts`, and `canvasServerAdapter.ts`: attachment references, capture response, multipart chat.
- Modify both API documents.

## Task 1: Add the IndexedDB visual attachment store

**Files:**

- Create: `apps/design/framework/src/shell/assistant/visualAttachmentStore.ts`
- Create: `apps/design/framework/src/shell/assistant/visualAttachmentStore.test.ts`

**Interfaces:**

```ts
type VisualAttachmentRecord = {
  id: string
  pageKey: string
  blob: Blob
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  width: number
  height: number
  origin: 'clipboard' | 'url-capture'
  sourceUrl?: string
  createdAt: string
}

type VisualAttachmentStore = {
  put(record: VisualAttachmentRecord): Promise<void>
  get(id: string): Promise<VisualAttachmentRecord | null>
  delete(id: string): Promise<void>
  deletePage(pageKey: string): Promise<void>
  reconcilePage(pageKey: string, referencedIds: Set<string>): Promise<void>
}

openVisualAttachmentStore(): Promise<VisualAttachmentStore>

attachmentUri(id: string): `wn-attachment:${string}`
parseAttachmentUri(value: string): string | null

getVisualAttachmentStore(): Promise<VisualAttachmentStore>
```

- [ ] **Step 1: Write IndexedDB tests**

Use a small in-memory fake `IDBFactory` injected into the store and cover:

```ts
it('stores and restores a Blob by id')
it('isolates records by pageKey')
it('deletes only one page')
it('reconciles orphaned records without deleting referenced records')
it('upgrades and opens wn.assistant.attachments.v1')
it('returns an English persistence error when IndexedDB is unavailable')
it('round-trips wn-attachment URIs')
```

Representative assertion:

```ts
expect(await store.get('image-1')).toMatchObject({
  id: 'image-1',
  pageKey: '/apps/design/canvases/home',
  origin: 'clipboard',
  mimeType: 'image/png',
})
```

- [ ] **Step 2: Run the failing test**

```bash
cd apps/design
npm run test -- framework/src/shell/assistant/visualAttachmentStore.test.ts
```

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement the versioned store**

Use:

```ts
const DATABASE_NAME = 'wn.assistant.attachments.v1'
const DATABASE_VERSION = 1
const STORE_NAME = 'attachments'
const PAGE_KEY_INDEX = 'by-page-key'
const ATTACHMENT_PREFIX = 'wn-attachment:'
```

Create one object store keyed by `id` and one non-unique `pageKey` index. Every transaction Promise
must reject on `request.onerror`, `transaction.onerror`, or `transaction.onabort`. `deletePage`
iterates the page index only; it must not clear the database. `getVisualAttachmentStore()` memoizes
one successfully opened store Promise for all Shell consumers and clears that memo only when open
fails.

- [ ] **Step 4: Verify and commit**

```bash
cd apps/design
npm run test -- framework/src/shell/assistant/visualAttachmentStore.test.ts
git add apps/design/framework/src/shell/assistant/visualAttachmentStore.ts \
  apps/design/framework/src/shell/assistant/visualAttachmentStore.test.ts
git commit -m "feat: persist assistant visual references"
```

Expected: PASS before commit.

## Task 2: Add the assistant-ui visual attachment adapter and cleanup

**Files:**

- Create: `apps/design/framework/src/shell/assistant/visualAttachmentAdapter.ts`
- Create: `apps/design/framework/src/shell/assistant/visualAttachmentAdapter.test.ts`
- Modify: `apps/design/framework/src/shell/assistant/AssistantProvider.tsx`
- Modify: `apps/design/framework/src/shell/assistant/pageState.ts`
- Modify: `apps/design/framework/src/shell/assistant/pageState.test.ts`
- Modify: `apps/design/framework/src/shell/assistant/pageSession.tsx`
- Modify: `apps/design/framework/src/shell/assistant/pageSession.test.tsx`

**Interfaces:**

- Produces:

```ts
createVisualAttachmentAdapter(input: {
  getPageKey(): string
  store: VisualAttachmentStore
  originForFile(file: File): {
    origin: 'clipboard' | 'url-capture'
    sourceUrl?: string
  }
}): AttachmentAdapter

registerVisualFileOrigin(
  file: File,
  metadata: {
    origin: 'clipboard' | 'url-capture'
    sourceUrl?: string
  },
): void

extractAttachmentIds(messages: readonly PersistedMessage[]): Set<string>
```

- [ ] **Step 1: Write adapter policy tests**

Cover:

```ts
it('accepts only image/png,image/jpeg,image/webp')
it('rejects one file larger than 10 MiB')
it('reads image dimensions before storing')
it('stores the Blob under the current pageKey')
it('returns image content with a wn-attachment URI')
it('removes a pending attachment Blob when the composer removes it')
```

Expected completed attachment:

```ts
{
  id: 'image-1',
  type: 'image',
  name: 'clipboard.png',
  contentType: 'image/png',
  status: { type: 'complete' },
  content: [{ type: 'image', image: 'wn-attachment:image-1' }],
}
```

- [ ] **Step 2: Write page-state cleanup tests**

Add:

```ts
it('persists small wn-attachment references instead of Base64')
it('extracts attachment ids from stable user messages')
it('reconciles attachment records after a successful message snapshot')
it('deletes current-page attachments after New chat')
it('does not delete attachments for another Canvas')
it('keeps in-memory images and reports a warning when IndexedDB fails')
```

- [ ] **Step 3: Run the focused tests**

```bash
cd apps/design
npm run test -- framework/src/shell/assistant/visualAttachmentAdapter.test.ts \
  framework/src/shell/assistant/pageState.test.ts \
  framework/src/shell/assistant/pageSession.test.tsx
```

Expected: FAIL for the new adapter and cleanup behavior.

- [ ] **Step 4: Implement the attachment adapter**

Use exact limits:

```ts
export const VISUAL_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const
export const MAX_VISUAL_BYTES = 10 * 1024 * 1024
```

`add()` validates MIME and size, decodes dimensions with `createImageBitmap`, creates a UUID, stores
the Blob, and returns `requires-action/composer-send`. `send()` returns the small
`wn-attachment:<id>` image part. `remove()` deletes only the attachment currently being removed.
`registerVisualFileOrigin` stores metadata in a module-private `WeakMap<File, Metadata>`;
`originForFile` consumes it once and defaults to `{ origin: 'clipboard' }`.

- [ ] **Step 5: Wire persistence cleanup**

Pass the adapter to LocalRuntime:

```ts
const runtime = useLocalRuntime(modelAdapter, {
  maxSteps: 2,
  unstable_humanToolNames: [
    'recommend_canvas_layout',
    'propose_canvas_change',
  ],
  adapters: { attachments: visualAttachmentAdapter },
})
```

After a successful page message snapshot, call:

```ts
await visualStore.reconcilePage(
  pageKey,
  extractAttachmentIds(serializedMessages),
)
```

During accepted `startNewChat(owner)`, await `visualStore.deletePage(owner.pageKey)` in the same
cleanup command. A failed IndexedDB operation sets the existing English persistence warning but
does not restore deleted Runtime messages.

- [ ] **Step 6: Verify and commit**

```bash
cd apps/design
npm run test -- framework/src/shell/assistant/visualAttachmentAdapter.test.ts \
  framework/src/shell/assistant/pageState.test.ts \
  framework/src/shell/assistant/pageSession.test.tsx
git add apps/design/framework/src/shell/assistant/visualAttachmentAdapter.ts \
  apps/design/framework/src/shell/assistant/visualAttachmentAdapter.test.ts \
  apps/design/framework/src/shell/assistant/AssistantProvider.tsx \
  apps/design/framework/src/shell/assistant/pageState.ts \
  apps/design/framework/src/shell/assistant/pageState.test.ts \
  apps/design/framework/src/shell/assistant/pageSession.tsx \
  apps/design/framework/src/shell/assistant/pageSession.test.tsx
git commit -m "feat: attach persisted images to assistant messages"
```

Expected: PASS before commit.

## Task 3: Render pasted images and enforce per-message limits

**Files:**

- Create: `apps/design/framework/src/shell/assistant/VisualAttachment.tsx`
- Create: `apps/design/framework/src/shell/assistant/VisualAttachment.test.tsx`
- Modify: `apps/design/framework/src/shell/assistant/AssistantThread.tsx`
- Modify: `apps/design/framework/src/shell/assistant/AssistantThread.test.tsx`
- Modify: `apps/design/framework/src/shell/assistant/assistant.css`

**Interfaces:**

- Produces:
  - `VisualAttachment`
  - `validateVisualBatch(existing, incoming)`
  - clipboard paste support without file-picker or dropzone UI.

- [ ] **Step 1: Write UI and policy tests**

Cover:

```ts
it('adds all pasted PNG/JPEG/WebP clipboard files')
it('does not prevent a text-only paste')
it('rejects a ninth visual reference')
it('rejects visual data above 30 MiB total')
it('renders an English thumbnail label and Remove button')
it('revokes object URLs on removal and unmount')
it('renders restored wn-attachment message images')
it('does not render Add file or drag-and-drop controls')
```

Batch constants:

```ts
const MAX_VISUAL_REFERENCES = 8
const MAX_VISUAL_TOTAL_BYTES = 30 * 1024 * 1024
```

- [ ] **Step 2: Run the failing UI tests**

```bash
cd apps/design
npm run test -- framework/src/shell/assistant/VisualAttachment.test.tsx \
  framework/src/shell/assistant/AssistantThread.test.tsx
```

Expected: FAIL because image UI and paste handling are absent.

- [ ] **Step 3: Implement paste-only Composer support**

On `ComposerPrimitive.Input`:

```ts
onPaste={(event) => {
  const files = Array.from(event.clipboardData.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
    .filter((file) => VISUAL_MIME_TYPES.includes(
      file.type as (typeof VISUAL_MIME_TYPES)[number],
    ))
  if (files.length === 0) return
  event.preventDefault()
  void addVisualFiles(files)
}}
```

Validate the whole batch before adding the first file. If invalid, add none and show
`You can attach up to 8 images and 30 MB per message.` with `role="status"`.

- [ ] **Step 4: Render attachment thumbnails**

Inside `ComposerPrimitive.Attachments`, render `AttachmentPrimitive.Root`, a custom thumbnail that
loads the Blob from IndexedDB, `AttachmentPrimitive.Name`, and
`AttachmentPrimitive.Remove` with `aria-label="Remove image"`.

Override user message image parts with a component that resolves `wn-attachment:` through the same
store. Revoke every `URL.createObjectURL` in effect cleanup.

- [ ] **Step 5: Style, verify, and commit**

Use only current tokens for a wrapping thumbnail row, 64-pixel thumbnail, remove control,
focus-visible state, and error/status copy.

```bash
cd apps/design
npm run test -- framework/src/shell/assistant/VisualAttachment.test.tsx \
  framework/src/shell/assistant/AssistantThread.test.tsx
git add apps/design/framework/src/shell/assistant/VisualAttachment.tsx \
  apps/design/framework/src/shell/assistant/VisualAttachment.test.tsx \
  apps/design/framework/src/shell/assistant/AssistantThread.tsx \
  apps/design/framework/src/shell/assistant/AssistantThread.test.tsx \
  apps/design/framework/src/shell/assistant/assistant.css
git commit -m "feat: paste images into assistant composer"
```

Expected: PASS before commit.

## Task 4: Add isolated Playwright URL capture

**Files:**

- Modify: `apps/design/package.json`
- Modify: `apps/design/package-lock.json`
- Create: `apps/design/framework/vite-plugins/canvas-assistant/capture.ts`
- Create: `apps/design/framework/vite-plugins/canvas-assistant/capture.test.ts`
- Modify: `apps/design/framework/vite-plugins/canvas-assistant/plugin.ts`
- Modify: `apps/design/framework/vite-plugins/canvas-assistant/plugin.test.ts`
- Modify: `apps/design/framework/src/lib/canvasAssistantProtocol.ts`
- Modify: `docs/dev/api/canvas-assistant.md`

**Interfaces:**

```ts
type CaptureRequest = { urls: string[] }
type CaptureResult = {
  url: string
  finalUrl?: string
  ok: boolean
  mimeType?: 'image/png'
  bytes?: Uint8Array
  error?: string
}

createUrlCaptureService({ launch, now }): {
  capture(urls: string[], signal: AbortSignal): Promise<CaptureResult[]>
  close(): Promise<void>
}
```

- [ ] **Step 1: Install the approved dependency**

```bash
cd apps/design
npm install --save-dev playwright
npx playwright install chromium
```

Expected: `package.json` and lockfile record Playwright; Chromium installation exits 0.

- [ ] **Step 2: Write capture policy tests with an injected fake browser**

Cover:

```ts
it('accepts public, localhost, and private-network HTTP URLs')
it('rejects file, data, javascript, and ftp URLs')
it('rejects more than four URLs')
it('uses a 1440 by 1000 viewport and captures only that viewport')
it('waits at most 15 seconds for DOMContentLoaded and 20 seconds total')
it('allows at most five HTTP/HTTPS redirects')
it('closes popups and cancels downloads')
it('returns independent success and failure results in input order')
it('closes the shared browser on Vite server shutdown')
it('aborts page work when the request signal aborts')
```

- [ ] **Step 3: Run the failing tests**

```bash
cd apps/design
npm run test -- framework/vite-plugins/canvas-assistant/capture.test.ts \
  framework/vite-plugins/canvas-assistant/plugin.test.ts
```

Expected: FAIL because capture service and route are absent.

- [ ] **Step 4: Implement capture service**

Launch:

```ts
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: false,
})
```

For each URL, create a fresh Page, reject every redirected request whose protocol is not HTTP(S),
count main-frame redirects, close popup Pages immediately, navigate with
`waitUntil: 'domcontentloaded', timeout: 15_000`, and race the complete operation against 20,000 ms
and the caller signal. Capture:

```ts
await page.screenshot({
  type: 'png',
  fullPage: false,
  animations: 'disabled',
})
```

Close the Page in `finally`; close the shared context/browser from Vite's `httpServer.close`.

- [ ] **Step 5: Add the capture endpoint**

Add `POST /__design_ai/references/capture`:

- same-origin and JSON only;
- Zod body `{ urls: z.array(z.string().url()).min(1).max(4) }`;
- return `multipart/mixed` is unnecessary; return JSON with each PNG as Base64 only on this
  capture response, capped by the existing 10 MB per-image rule;
- return per-URL errors rather than failing successful siblings;
- set `Cache-Control: no-store`;
- never log URLs, screenshots, or response bytes.

Document the exact URL policy and capture limits in `canvas-assistant.md`.

- [ ] **Step 6: Verify and commit**

```bash
cd apps/design
npm run test -- framework/vite-plugins/canvas-assistant/capture.test.ts \
  framework/vite-plugins/canvas-assistant/plugin.test.ts
git add apps/design/package.json apps/design/package-lock.json \
  apps/design/framework/vite-plugins/canvas-assistant/capture.ts \
  apps/design/framework/vite-plugins/canvas-assistant/capture.test.ts \
  apps/design/framework/vite-plugins/canvas-assistant/plugin.ts \
  apps/design/framework/vite-plugins/canvas-assistant/plugin.test.ts \
  apps/design/framework/src/lib/canvasAssistantProtocol.ts \
  docs/dev/api/canvas-assistant.md
git commit -m "feat: capture URL design references"
```

Expected: PASS before commit.

## Task 5: Add URL reference draft and review-before-send behavior

**Files:**

- Create: `apps/design/framework/src/shell/assistant/useCanvasReferences.ts`
- Create: `apps/design/framework/src/shell/assistant/useCanvasReferences.test.tsx`
- Modify: `apps/design/framework/src/lib/canvasAssistantApi.ts`
- Modify: `apps/design/framework/src/lib/canvasAssistantApi.test.ts`
- Modify: `apps/design/framework/src/shell/assistant/AssistantThread.tsx`
- Modify: `apps/design/framework/src/shell/assistant/AssistantThread.test.tsx`
- Modify: `apps/design/framework/src/shell/assistant/assistant.css`

**Interfaces:**

```ts
type UrlReferenceDraft = {
  url: string
  state: 'uncaptured' | 'capturing' | 'ready' | 'failed' | 'dismissed'
  attachmentId?: string
  error?: string
}

extractHttpUrls(text: string): string[]
useCanvasReferences(): {
  references: UrlReferenceDraft[]
  prepareAndMaybeSend(): Promise<'sent' | 'review' | 'blocked'>
  dismiss(url: string): void
}
```

- [ ] **Step 1: Write URL extraction and send-gate tests**

Cover:

```ts
it('extracts distinct HTTP and HTTPS URLs in text order')
it('ignores punctuation after a URL')
it('caps references at four and reports an English error')
it('first Send captures URLs and stops for visual review')
it('second Send submits when every URL is ready or dismissed')
it('a failed capture blocks generation')
it('dismissed failed capture allows a manually pasted screenshot to send')
it('changing the URL text removes stale capture draft state')
it('page navigation aborts capture and clears draft state')
```

Expected first-send result:

```ts
expect(await prepareAndMaybeSend()).toBe('review')
expect(composer.send).not.toHaveBeenCalled()
expect(screen.getByText('Review the captured references, then send again.')).toBeTruthy()
```

- [ ] **Step 2: Run failing tests**

```bash
cd apps/design
npm run test -- framework/src/shell/assistant/useCanvasReferences.test.tsx \
  framework/src/shell/assistant/AssistantThread.test.tsx
```

Expected: FAIL because URL draft behavior is absent.

- [ ] **Step 3: Implement capture-before-send**

On Composer submit:

1. extract URLs from current text;
2. if no uncaptured URL exists, validate visual count/bytes and call `composer.send()`;
3. otherwise prevent send, mark URLs `capturing`, call the capture API;
4. convert successful Base64 PNGs to Files, tag their origin as `url-capture`, and add them through
   `registerVisualFileOrigin(file, { origin: 'url-capture', sourceUrl: url })` and the visual adapter;
5. mark successful references `ready` and failures `failed`;
6. display thumbnails and `Review the captured references, then send again.`;
7. block second send while any reference is `failed`;
8. `Remove reference` changes it to `dismissed` without deleting the URL text.

Failed copy:

```text
This page could not be captured. Paste a screenshot or remove this reference.
```

Login guidance shown beside every automatic capture:

```text
If this capture misses a signed-in state, paste a screenshot from your browser.
```

- [ ] **Step 4: Verify and commit**

```bash
cd apps/design
npm run test -- framework/src/shell/assistant/useCanvasReferences.test.tsx \
  framework/src/lib/canvasAssistantApi.test.ts \
  framework/src/shell/assistant/AssistantThread.test.tsx
git add apps/design/framework/src/shell/assistant/useCanvasReferences.ts \
  apps/design/framework/src/shell/assistant/useCanvasReferences.test.tsx \
  apps/design/framework/src/lib/canvasAssistantApi.ts \
  apps/design/framework/src/lib/canvasAssistantApi.test.ts \
  apps/design/framework/src/shell/assistant/AssistantThread.tsx \
  apps/design/framework/src/shell/assistant/AssistantThread.test.tsx \
  apps/design/framework/src/shell/assistant/assistant.css
git commit -m "feat: review URL captures before sending"
```

Expected: PASS before commit.

## Task 6: Send multipart visual messages to the model

**Files:**

- Modify: `apps/design/framework/src/lib/canvasAssistantProtocol.ts`
- Modify: `apps/design/framework/src/lib/canvasAssistantProtocol.test.ts`
- Modify: `apps/design/framework/src/shell/assistant/canvasServerAdapter.ts`
- Modify: `apps/design/framework/src/shell/assistant/canvasServerAdapter.test.ts`
- Modify: `apps/design/framework/vite-plugins/canvas-assistant/plugin.ts`
- Modify: `apps/design/framework/vite-plugins/canvas-assistant/plugin.test.ts`
- Modify: `apps/design/framework/vite-plugins/canvas-assistant/model.ts`
- Modify: `apps/design/framework/vite-plugins/canvas-assistant/model.test.ts`
- Modify: `docs/dev/api/canvas-assistant.md`
- Modify: `docs/dev/api/assistant-ui-chat.md`

**Interfaces:**

- `POST /__design_ai/canvas/chat` changes from JSON to `multipart/form-data`.
- Multipart field `request` contains the JSON envelope.
- Each image field is named `attachment:<id>`.
- Message image parts contain `wn-attachment:<id>` only.

- [ ] **Step 1: Write multipart and model conversion tests**

Cover:

```ts
it('places the JSON envelope in the request field')
it('uploads each referenced Blob once even when history repeats it')
it('rejects a missing referenced Blob')
it('rejects more than eight images in the current user message')
it('rejects one image above 10 MiB or unique retained images above 30 MiB')
it('rejects retained visual history above 30 MiB without dropping old images')
it('rejects an unreferenced multipart image')
it('converts image references to AI SDK Uint8Array image parts in message order')
it('preserves URL source text next to its screenshot')
it('returns a stable English error when the model rejects visual input')
it('retains the Runtime message and attachment references after visual rejection')
```

- [ ] **Step 2: Run focused tests**

```bash
cd apps/design
npm run test -- framework/src/shell/assistant/canvasServerAdapter.test.ts \
  framework/vite-plugins/canvas-assistant/plugin.test.ts \
  framework/vite-plugins/canvas-assistant/model.test.ts
```

Expected: FAIL while chat is still JSON/text-only.

- [ ] **Step 3: Build multipart in the browser adapter**

```ts
const form = new FormData()
form.set('request', JSON.stringify({
  appId,
  canvasId,
  aiConfig: readAiConfig(),
  messages: serializedMessages,
}))
for (const id of uniqueReferencedAttachmentIds(serializedMessages)) {
  const record = await visualStore.get(id)
  if (!record) {
    throw new Error('A referenced image is no longer available.')
  }
  form.set(`attachment:${id}`, record.blob, `${id}.image`)
}
```

Do not set `Content-Type`; `fetch` must add the multipart boundary. Keep the existing AbortSignal
and NDJSON response parser.

- [ ] **Step 4: Parse multipart without another dependency**

Convert Node's incoming stream to a Web Request and call `formData()`:

```ts
const request = new Request(`http://${req.headers.host}${req.url}`, {
  method: 'POST',
  headers: req.headers as HeadersInit,
  body: Readable.toWeb(req) as ReadableStream,
  // Node requires duplex for streaming request bodies.
  duplex: 'half',
} as RequestInit & { duplex: 'half' })
const form = await request.formData()
```

Validate:

- the `request` field is a string and at most 512 KiB;
- every image field maps to exactly one referenced ID;
- the current user message contains no more than eight image parts;
- every file MIME, individual size, and retained-history total meets Global Constraints;
- no extra form fields exist.

Convert each Blob with `new Uint8Array(await blob.arrayBuffer())`.

If the unique referenced Blobs across retained history exceed 30 MiB, return:

```text
This conversation contains more than 30 MB of visual references. Start a new chat before sending more images.
```

Do not trim, summarize, or silently omit historical images.

- [ ] **Step 5: Convert to AI SDK multimodal messages**

For user messages, preserve ordered content:

```ts
[
  { type: 'text', text: userText },
  {
    type: 'image',
    image: imageBytes,
    mimeType: record.mimeType,
  },
]
```

Tool calls/results continue using the core plan conversion. Classify provider errors that mention
unsupported image/content type as:

```text
The configured model does not support image input. Choose a vision-capable model or remove the images.
```

Do not call or stage `propose_canvas_change` after this error.

- [ ] **Step 6: Update both API documents**

Document multipart names, size/count limits, `wn-attachment:` persistence, IndexedDB cleanup,
visual-model error behavior, and backward compatibility for old text-only page state.

- [ ] **Step 7: Verify and commit**

```bash
cd apps/design
npm run test -- framework/src/lib/canvasAssistantProtocol.test.ts \
  framework/src/shell/assistant/canvasServerAdapter.test.ts \
  framework/vite-plugins/canvas-assistant/plugin.test.ts \
  framework/vite-plugins/canvas-assistant/model.test.ts
git add apps/design/framework/src/lib/canvasAssistantProtocol.ts \
  apps/design/framework/src/lib/canvasAssistantProtocol.test.ts \
  apps/design/framework/src/shell/assistant/canvasServerAdapter.ts \
  apps/design/framework/src/shell/assistant/canvasServerAdapter.test.ts \
  apps/design/framework/vite-plugins/canvas-assistant/plugin.ts \
  apps/design/framework/vite-plugins/canvas-assistant/plugin.test.ts \
  apps/design/framework/vite-plugins/canvas-assistant/model.ts \
  apps/design/framework/vite-plugins/canvas-assistant/model.test.ts \
  docs/dev/api/canvas-assistant.md \
  docs/dev/api/assistant-ui-chat.md
git commit -m "feat: send visual references to canvas AI"
```

Expected: PASS before commit.

## Task 7: Prove multimodal persistence, capture, and authoring

**Files:**

- Create: `apps/design/framework/src/preview/canvasMultimodal.integration.test.tsx`
- Create: `apps/design/framework/vite-plugins/canvas-assistant/capture.integration.test.ts`
- Modify: only files exposed as defective by these tests.

**Interfaces:**

- Consumes all prior multimodal tasks and the completed core plan.
- Produces the full approved feature.

- [ ] **Step 1: Add browser integration tests**

Cover:

```ts
it('combines text, two pasted images, and two URL screenshots in one run')
it('restores thumbnails and messages after remount from IndexedDB')
it('New chat deletes only current-Canvas image records')
it('a failed URL blocks send until dismissed or replaced')
it('a poor capture can be dismissed and replaced by a pasted screenshot')
it('switching Canvas cancels capture and keeps sessions isolated')
it('vision-model rejection preserves the message and references')
```

- [ ] **Step 2: Add real Playwright capture integration**

Start a local HTTP fixture server with:

- a styled reference page;
- a five-hop redirect that succeeds;
- a six-hop redirect that fails;
- a slow page that exceeds 15 seconds;
- a popup and download attempt.

Run Chromium against the fixture and assert PNG dimensions `1440 × 1000`, input order, per-URL
errors, timeout, redirect enforcement, popup closure, and download denial.

- [ ] **Step 3: Run integration tests**

```bash
cd apps/design
npm run test -- framework/src/preview/canvasMultimodal.integration.test.tsx \
  framework/vite-plugins/canvas-assistant/capture.integration.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run full verification**

```bash
cd apps/design
npm run test
npm run build
```

Expected: all tests pass and the build exits 0. The Playwright package remains dev-only and no
browser code enters the Canvas bundle.

- [ ] **Step 5: Run browser smoke validation**

Start:

```bash
cd apps/design
npm run dev
```

Validate:

- paste multiple screenshots and remove one by keyboard;
- submit multiple public/local/private-network URLs;
- inspect captures before the second Send;
- replace a signed-in or poor capture with a pasted screenshot;
- refresh and confirm images restore for the same Canvas only;
- generate and apply a proposal informed by all references;
- choose a non-vision model and confirm the exact English error with inputs retained;
- start a new chat and confirm only current-Canvas IndexedDB records are removed;
- inspect narrow width, focus-visible controls, reduced motion, and English Shell copy.

- [ ] **Step 6: Read glossary, request code review, and fix findings**

```bash
sed -n '1,260p' docs/dev/conventions/glossary.md
```

Invoke `requesting-code-review`, correct every confirmed finding, and rerun the focused integration
tests plus `npm run test` and `npm run build`.

- [ ] **Step 7: Commit integration hardening**

```bash
git add apps/design/framework/src/preview/canvasMultimodal.integration.test.tsx \
  apps/design/framework/vite-plugins/canvas-assistant/capture.integration.test.ts \
  apps/design docs/dev/api
git commit -m "test: cover multimodal canvas authoring"
```

## Completion Gate

The multimodal plan is complete only when:

- all seven task commits exist after the completed core plan;
- Chromium is installable through the documented Playwright command;
- focused, full test, and build commands have fresh passing output;
- real capture integration proves viewport, timeout, redirect, popup, download, and abort rules;
- browser smoke validation covers paste, URL review, manual replacement, refresh persistence,
  vision rejection, Canvas isolation, and New chat cleanup;
- both API documents match the multipart and IndexedDB implementation;
- code review findings are resolved.
