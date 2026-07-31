## Canvas Assistant development API

Canvas Assistant is a development-only Vite middleware mounted at
`/__design_ai/canvas`. It is available under `npm run dev`; Vite build and
preview do not expose these routes. A client that receives a missing or
non-NDJSON endpoint outside the dev server must show the English failure:
`Canvas Assistant is available only with npm run dev.`

Every `/__design_ai` response, including an error response, uses
`Cache-Control: no-store`. JSON failures use
`{ "error": "<English message>" }`.

## Request security

All `/__design_ai` routes below accept `POST` only and require:

- `Origin` exactly equal to
  `${X-Forwarded-Proto ?? "http"}://${Host}`; otherwise the response is `403`.
- The documented content type; an incorrect media type receives `415`.
- Valid fields and the documented schema; malformed or unexpected input
  receives `400`.

Context, capture, preview-session, and proposal-apply requests use
`application/json`. Their body is limited to 512 KiB across fixed-length and
chunked-transfer requests. Chat instead uses `multipart/form-data`; its
`request` JSON field is limited to 512 KiB, while its bounded binary fields
follow the visual limits documented below.

A normal browser disconnect aborts the active model run. Request bodies, AI API
keys, system prompts, current source, candidate source, and repair source are
never written to server logs. Candidate source is returned only as read-only
proposal-card review data; it is never accepted back by apply. Chat accepts at
most 40 messages.

Unknown paths under `/__design_ai`, unsupported methods, and non-exact route
variants receive `404`.

## URL reference capture

### `POST /__design_ai/references/capture`

The trusted Shell may request screenshots for one to four explicit URLs:

```json
{
  "urls": [
    "https://example.com/design",
    "http://localhost:5173/reference"
  ]
}
```

The endpoint has the same exact-origin, JSON, body-size, no-store, and
development-only requirements as the Canvas routes. It is not exposed to the
opaque Canvas preview origin or through a preview module capability.

Only absolute `http:` and `https:` URLs are accepted by the capture service.
Public hosts, `localhost`, and private-network hosts are allowed. `file:`,
`data:`, `javascript:`, `ftp:`, malformed URLs, and redirects to a non-HTTP(S)
protocol are rejected. A main-frame navigation may follow at most five
HTTP(S) redirects.

Each URL uses a fresh Page in one shared isolated Chromium browser context.
The context is headless, has no default browser profile, cookies, or signed-in
session, disables downloads, and uses a `1440 × 1000` viewport. Popups are
closed, downloads are cancelled, navigation waits for `DOMContentLoaded` for
at most 15 seconds, and all work for one URL is capped at 20 seconds. The PNG
screenshot captures only the viewport with animations disabled. Pages are
always closed; the shared context and browser close when the Vite HTTP server
closes. Disconnecting the request aborts active page work.

Success is `200 application/json`. Results remain in input order, and one
failure does not discard successful siblings:

```json
{
  "results": [
    {
      "url": "https://example.com/design",
      "finalUrl": "https://example.com/final",
      "ok": true,
      "mimeType": "image/png",
      "base64": "iVBORw0KGgo..."
    },
    {
      "url": "http://localhost:5173/reference",
      "ok": false,
      "error": "This page could not be captured."
    }
  ]
}
```

Base64 exists only in this response and only for a successful PNG no larger
than 10 MiB. An oversized PNG becomes an error for that URL. URLs, screenshot
bytes, Base64 response data, and browser errors are not written to server
logs.

## Context readiness

### `POST /__design_ai/canvas/context`

```json
{
  "appId": "design",
  "canvasId": "home"
}
```

The route loads the same trusted authoring context used by chat, including one
Style contract per configured `app.json.style` slot (`light`, `dark`). Every
configured slot must resolve; a configured id whose contract cannot be loaded
and an App with no configured slot both fail the load. Loading is independent
of the Shell theme, so generation always covers every configured slot. It does
not call an AI model.

Only direct same-directory `./*.css` imports are discovered as writable Canvas
CSS. Package CSS and CSS under `components/` are not reclassified as Canvas
files during a reload; proposal dependency validation and the final Vite
transform remain authoritative for those allowed imports. Unsupported relative
CSS paths are still rejected by dependency validation before a candidate write.

Success is `200 application/json`:

```json
{ "ready": true }
```

An unavailable or invalid trusted context receives a sanitized `400`; a loader
error explicitly classified as not found receives `404`.

## Preview module capability

### `POST /__design_ai/canvas/preview-session`

The trusted Shell requests a preview session with only server-resolved
ownership keys:

```json
{
  "appId": "design",
  "canvasId": "home"
}
```

The server resolves `componentFile` from the current `canvases.json`; the
browser cannot select a filename. It verifies the real App/Canvas directories,
requires the current Canvas TSX and directly imported local CSS to be regular
non-symlink files, and verifies every reusable `.ts`, `.tsx`, or `.css`
component without following component symlinks. Success returns:

```json
{
  "moduleBase": "/__design_canvas_preview/<random-uuid>/",
  "componentFile": "Home.tsx",
  "expiresAt": "2026-07-25T12:30:00.000Z"
}
```

The unpredictable session expires after 30 minutes and is bound to that
App/Canvas target. The opaque iframe import map rewrites required Vite module
prefixes through `moduleBase`; this preserves Vite transforms and HMR query
timestamps without treating `Origin: null` as an identity. `CanvasPreview`
uses `expiresAt` to request a fresh capability and remount the iframe one
minute before expiry, so later HMR and lazy module requests do not inherit an
expired token. The remount intentionally clears Canvas-local runtime state.

`GET` or `HEAD /__design_canvas_preview/:token/*` is accepted only when all of
these conditions hold:

- `Origin` is exactly `null` and `Sec-Fetch-Dest` is exactly `script`;
- the token exists and has not expired;
- the path is a fixed preview runtime module, a Vite prebundled `.js`
  dependency, the exact current Canvas/direct CSS, or an exact real shared
  component discovered for the current App;
- every App file still exists as a regular non-symlink file and resolves to
  the same real path recorded when the session was issued; this check runs
  again for every capability request so a post-issuance filesystem
  replacement fails closed;
- the decoded path is normalized and contains no traversal, reserved
  query/fragment characters, NUL, or control characters;
- the query does not request Vite `raw`, `url`, `worker`, `sharedworker`, or
  `inline` transforms.

Only an authorized module response receives
`Access-Control-Allow-Origin: null`. Direct opaque-origin access without the
capability, a guessed/expired token, ordinary `fetch()` destination, another
Canvas/App, `/@fs`, or any privileged `__*` route receives `403`. The module
channel cannot mint sessions or call filesystem/Assistant APIs and exposes no
mutation capability. Its allowed generated code can still execute CPU work,
use the shared dev HMR WebSocket, and make ordinary external network requests;
the iframe is a local privileged-route boundary, not a general untrusted-code
container.

## Chat stream

### `POST /__design_ai/canvas/chat`

The browser sends `multipart/form-data` and does not set `Content-Type`
manually, so the browser supplies the boundary. The exact fields are:

```text
request                 JSON envelope below
attachment:<id>         one referenced PNG, JPEG, or WebP Blob
```

The server bounds the complete multipart transport before `formData()` can
buffer it. The `request` field contains:

```json
{
  "appId": "design",
  "canvasId": "home",
  "aiConfig": {
    "provider": "openai",
    "baseURL": "https://optional-openai-compatible.example/v1",
    "apiKey": "runtime-only-secret",
    "model": "model-name"
  },
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Build an account page" },
        {
          "type": "image",
          "image": "wn-attachment:94cd7aa0-..."
        }
      ]
    }
  ]
}
```

`provider` is `openai` or `anthropic`. `baseURL` is optional. Each message role
is `user`, `assistant`, or `system`; content contains text, user image
references, or tool-call snapshots. A completed human tool call stores
`result` on the same assistant tool-call part so the server can send an AI SDK
assistant tool-call message followed by its tool-result message.

Image parts are accepted only on user messages and contain only a
`wn-attachment:<id>` reference. Every unique referenced ID in the retained
40-message history must have exactly one matching `attachment:<id>` file;
missing files, duplicate fields, unreferenced files, non-image fields, and any
other form field are rejected. A repeated reference uploads one Blob and counts
once toward the retained total.

The current user message may contain at most eight image parts. Only
`image/png`, `image/jpeg`, and `image/webp` are accepted; each file is at most
10 MiB, and all unique referenced files across retained history total at most
30 MiB. Historical images are never trimmed or silently omitted. Exceeding
the retained total returns:

```text
This conversation contains more than 30 MB of visual references. Start a new chat before sending more images.
```

The server converts validated files directly in memory to AI SDK
`Uint8Array` image parts, preserving the user message part order. It does not
write image bytes to disk or logs. For URL captures, the browser adds
`Source URL: <url>` immediately before the corresponding image in the
transmitted message copy; the persisted Runtime image remains only its
`wn-attachment:` reference.

Success is `200 application/x-ndjson`. Each line is one of:

```ts
type CanvasRunEvent =
  | {
      type: 'run-result'
      value: {
        content: Array<
          | { type: 'text'; text: string }
          | {
              type: 'tool-call'
              toolCallId: string
              toolName:
                | 'recommend_canvas_layout'
                | 'propose_canvas_change'
              args: unknown
              argsText: string
            }
        >
        status?: {
          type: 'requires-action'
          reason: 'tool-calls'
        }
        metadata?: { steps: Array<Record<string, never>> }
      }
    }
  | { type: 'error'; error: string }
```

`value.content` is a cumulative LocalRuntime snapshot, not a delta. On either
human tool call the final snapshot has `requires-action`; that server model run
stops immediately. Proposal events contain sanitized card arguments plus the
read-only candidate path/source review copy. That browser-visible copy is not
accepted by apply and cannot replace the authoritative server-side candidate.

Model failures after stream start normally produce one generic English
`error` event. If a provider rejects the image/content type as unsupported,
the run stops before any proposal is staged and returns:

```text
The configured model does not support image input. Choose a vision-capable model or remove the images.
```

The browser does not delete or rewrite the submitted Runtime message or its
attachment references after this error. Pre-stream request failures use JSON
with the status codes described above.

## Human tools

The model receives exactly two server-side tools. Neither tool has an
`execute` function.

### `recommend_canvas_layout`

Model arguments:

```ts
{
  layoutId: string
  reason: string
}
```

The server accepts only a Layout in the trusted resource index that is not
already installed. It ignores model-supplied display metadata and enriches the
card from the index:

```ts
{
  layoutId: string
  title: string
  summary: string
  reason: string
  previewUrl: string
}
```

### `propose_canvas_change`

Model arguments contain `mode`, summary, Layout decision, complete candidate
`files`, reused and new shared components, preserved behavior, and validation
checks. The server stages an authoritative guarded copy in memory and emits a
separate read-only review copy:

```ts
{
  proposalId: string
  mode: 'create' | 'update'
  summary: string[]
  styleIds: { light?: string; dark?: string }
  layout:
    | { kind: 'installed'; id: string; reason: string }
    | { kind: 'temporary'; reason: string }
  changedFiles: string[]
  reusedComponents: string[]
  newSharedComponents: string[]
  preserved: string[]
  validationChecks: string[]
  candidateFiles: Array<{ path: string; source: string }>
  expiresAt: string
}
```

`styleIds` carries every configured slot and always has at least one entry. The
proposal card displays only the slot matching the current Shell theme and shows
`not set` when that slot is empty; unlike preview resolution, display never
falls back to the other slot.

The browser may display or mutate its local review copy, but apply still sends
only `proposalId + aiConfig`; the transaction always uses the server-side
candidate copy.

### Human result

The browser returns exactly one of these results on the original tool-call
snapshot:

```ts
type CanvasToolResult =
  | { status: 'installed'; layoutId: string }
  | { status: 'rejected'; reason: string }
  | { status: 'applied'; proposalId: string }
  | { status: 'failed'; proposalId?: string; error: string }
```

Invalid human results are rejected before being sent to the AI provider.

## Proposal lifetime and ownership

Proposals live only in the dev server process. They expire 30 minutes after
creation and are single-use. Apply claims a proposal before any write. Success,
baseline conflict, validation failure, or rolled-back failure completes it;
the user must generate a new proposal rather than retrying a stale candidate.

Each proposal is bound to the App and Canvas that produced it. Candidate files
may replace only the current Canvas TSX and its direct local CSS files, or create
new `.tsx`/`.css` files under that App's `components/` directory. Existing user
shared components are read-only. Files belonging to another Canvas, existing
shared components, dependencies, global files, and paths outside these roots
are not writable. Component reuse and new-component declarations must match the
trusted context and candidate set exactly.

Before staging, the server parses every candidate TypeScript source with
`typescript.preProcessFile` and the TypeScript compiler AST. Imports may target:

- an npm-style bare package specifier, including legitimate scoped and
  unscoped package subpaths;
- another candidate under the current App's `components/` directory;
- the current Canvas's trusted same-directory CSS, when imported by the current
  Canvas;
- a discovered read-only App component declared in `reusedComponents`.

All other imports are rejected, including another Canvas, Shell/framework
source, Style or Layout implementation, arbitrary App files, absolute paths,
and relative paths outside the App. Extensionless `.ts`, `.tsx`, `.css`, and
matching `index` imports resolve only when exactly one trusted target matches.
Bare package specifiers cannot contain empty, `.` or `..` segments,
backslashes, or percent-encoded separators or traversal. Real
`import.meta.glob` and `import.meta.globEager` calls, including bracket-access
variants, are rejected by AST shape; matching text in comments or strings is
not treated as a call. Every dynamic `import()` must have exactly one string
literal or no-substitution template literal argument. That literal specifier is
then checked by the same package, candidate, CSS, and read-only component
allowlist as a static import; expressions, template substitutions, missing
arguments, and additional arguments are rejected.

Candidate CSS is scanned as CSS syntax. Real `@import` rules are rejected,
including case and CSS-escaped spellings. Matching text in comments and strings
and unrelated at-rules such as `@media`, `@keyframes`, and `@font-face` remain
valid.

The set of directly imported existing read-only App component files must equal
`reusedComponents` exactly: missing, extra, and duplicate declarations are
invalid.

The proposal stores candidate source, file baselines, the raw current
`app.json` fingerprint, one mandatory Style-contract fingerprint per configured
slot (`styleContracts: { light?: { id, hash }, dark?: { id, hash } }`), and the
selected installed Layout-contract fingerprint. A temporary AI Layout has no
installed Layout-contract fingerprint, but remains bound to the App and Style
fingerprints. The proposal also stores only the latest sanitized user intent
plus its authoritative Style ids per slot, Layout decision, and preservation
constraints; it never stores `aiConfig`, API keys, or unrelated chat history.

Read-only baseline enforcement belongs to the apply transaction. It reloads
trusted context at apply start, immediately before and after each asynchronous
Vite validation, immediately after each asynchronous repair, and immediately
before a successful return. Every reload rechecks the App configuration, every
configured Style contract, selected installed Layout contract, current Canvas
identity, and all read-only file baselines. A slot added, cleared, repointed,
or edited after staging rejects the proposal with the normal proposal-conflict
result. Read-only baselines retain their initial absolute path, real path, and
source and are rechecked as regular non-symlink files at every checkpoint.
When the refreshed context still discovers one, its path and source must match
too. A reused component must remain present in the refreshed context; omission
is fail-closed even when the bound path still reads the same source. Only a
same-directory Canvas CSS baseline may disappear from refreshed discovery
while its bound identity and source remain unchanged, because the
transaction's own Canvas candidate can remove that CSS import.

## Apply stream

### `POST /__design_ai/canvas/proposals/:proposalId/apply`

Body:

```json
{
  "aiConfig": {
    "provider": "anthropic",
    "apiKey": "runtime-only-secret",
    "model": "repair-model"
  }
}
```

The route returns `404` for an unknown proposal and `409` for an expired or
already claimed proposal. Once claimed, success is an
`application/x-ndjson` stream. Every transaction callback produces one status
line:

```ts
type CanvasApplyStatus =
  | { type: 'status'; phase: 'checking' }
  | { type: 'status'; phase: 'writing' }
  | { type: 'status'; phase: 'validating' }
  | {
      type: 'status'
      phase: 'repairing'
      attempt: 1 | 2
    }
```

The stream ends with exactly one terminal result:

```ts
type CanvasApplyComplete =
  | {
      type: 'complete'
      result: {
        ok: true
        proposalId: string
        repairAttempts: 0 | 1 | 2
      }
    }
  | {
      type: 'complete'
      result: {
        ok: false
        proposalId: string
        error: string
        rolledBack: boolean
      }
    }
```

Apply checks all candidate and read-only baselines and runs the same candidate
dependency and exact `reusedComponents` validation before writing the initial
candidate set and before writing every repaired candidate set. It then writes
atomically and asks the production Vite server to invalidate and transform every
candidate `.ts`, `.tsx`, and `.css` target in stable relative-path order.
Validation is never limited to the Canvas entry, so a newly created or
otherwise unvisited dependency must transform successfully before apply can
complete. Validation may run at most two AI repairs. A repair must return the
same complete path set. Each repair request is rebuilt after validation from
the latest successfully reloaded context and includes the sanitized original
user intent, every configured current Style contract, selected installed Layout
contract or temporary Layout decision, authoritative preservation constraints,
compact diagnostic, and complete candidate set. The context is reloaded again
after the repair resolves or rejects before any returned candidate can be
written. Browser state is never used to supply repair constraints. The repair
model receives a fully static system authority policy and one JSON data
envelope. Trusted domain requirements and untrusted validation/candidate
evidence occupy separate fields; no dynamic value can change roles, the allowed
path set, the task, or the output protocol. Candidate comments, diagnostics,
strings, and fake delimiters are evidence only, never repair instructions.

The transaction tracks the exact expected source, including expected absence,
for every writable target and binds its expected real path. Immediately before
and after each atomic write in the initial or repaired candidate set, it checks
that an existing target is a regular non-symlink file at that real path, or that
an absent create target still resolves through the bound directory identity,
then compares the exact source. The expectation advances only after that
transaction write succeeds. Immediately after every asynchronous Vite
validation, the transaction repeats the identity and source checks for every
written target before it can report success, request repair, or begin terminal
rollback. A concurrent IDE edit or same-source symlink substitution therefore
cannot be overwritten or mistaken for a successfully applied candidate after a
validation or repair boundary. Repeated context checks do not compare writable
files with the proposal's original hashes: writable targets remain governed by
this `expectedSource` / `lastWrittenSource` state machine, so the transaction's
own atomic writes are not mistaken for context conflicts.
Files staged as `create-shared` also remain candidate dependencies rather than
being reclassified as reused read-only components when a reload discovers the
new file. At every reload checkpoint, dependency and exact
`reusedComponents` validation uses the refreshed file set overlaid on the
approval-time authorized set, with transaction-owned `create-shared` paths
removed. This retains unchanged Canvas CSS that disappeared only because the
candidate removed its import, while fresh files still expose resolution
changes such as a newly introduced `.ts` / `.tsx` extensionless-import
ambiguity. Repaired candidates are additionally checked against the original
approval-time dependency authority before any write.

Exhausted or invalid repairs run a best-effort rollback across every written
target; one restore or delete failure never prevents attempts on the remaining
targets. Rollback also rereads each target and restores or deletes it only when
its file identity still matches and its current source exactly equals the last
source written by this transaction. An intervening IDE edit or same-source
symlink substitution is preserved while rollback continues for other targets.

`rolledBack: true` means every required restore/delete succeeded, or no file
was written before the failure. `rolledBack: false` means at least one restore
or delete failed; the error is
`Canvas proposal rollback was incomplete. Some files may need manual inspection.`
and the user must inspect the affected files manually. This includes a
conditional rollback skipped to preserve a concurrent external edit. Even if
an internal transaction failure rejects unexpectedly after the NDJSON stream
opens, the route permanently completes the proposal and emits exactly one
terminal `complete` event with `rolledBack: false`.

Only after a successful transaction, Vite emits:

```ts
{
  type: 'custom'
  event: 'canvas-assistant:applied'
  data: { appId: string; canvasId: string }
}
```

Failed, conflicted, or incompletely rolled-back transactions never emit this
event.
