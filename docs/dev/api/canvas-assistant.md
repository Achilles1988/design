## Canvas Assistant development API

Canvas Assistant is a development-only Vite middleware mounted at
`/__design_ai/canvas`. It is available under `npm run dev`; Vite build and
preview do not expose these routes. A client that receives a missing or
non-NDJSON endpoint outside the dev server must show the English failure:
`Canvas Assistant is available only with npm run dev.`

Every response, including an error response, uses `Cache-Control: no-store`.
JSON failures use `{ "error": "<English message>" }`.

## Request security

All routes below accept `POST` only and require:

- `Origin` exactly equal to
  `${X-Forwarded-Proto ?? "http"}://${Host}`; otherwise the response is `403`.
- `Content-Type: application/json`; otherwise the response is `415`.
- A body no larger than 512 KiB; reading stops and the response is `413` when
  the limit is crossed.
- Valid JSON and the documented schema; invalid JSON or schema receives `400`.

A normal browser disconnect aborts the active model run. Request bodies, AI API
keys, system prompts, current source, candidate source, and repair source are
never written to server logs. Chat accepts at most 40 messages.

Unknown paths under `/__design_ai`, unsupported methods, and non-exact route
variants receive `404`.

## Context readiness

### `POST /__design_ai/canvas/context`

Body:

```json
{
  "appId": "design",
  "canvasId": "home"
}
```

The route loads the same trusted authoring context used by chat, including the
configured Canvas Style contract. It does not call an AI model.

Success is `200 application/json`:

```json
{ "ready": true }
```

An unavailable or invalid trusted context receives a sanitized `400`; a loader
error explicitly classified as not found receives `404`.

## Chat stream

### `POST /__design_ai/canvas/chat`

Body:

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
      "content": [{ "type": "text", "text": "Build an account page" }]
    }
  ]
}
```

`provider` is `openai` or `anthropic`. `baseURL` is optional. Each message role
is `user`, `assistant`, or `system`; content contains text or tool-call
snapshots. A completed human tool call stores `result` on the same assistant
tool-call part so the server can send an AI SDK assistant tool-call message
followed by its tool-result message.

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
stops immediately. Proposal events contain only sanitized card arguments and
never contain candidate file source.

Model failures after stream start produce one generic English `error` event.
Pre-stream request failures use JSON with the status codes described above.

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
checks. The server stages guarded candidate source in memory and emits only:

```ts
{
  proposalId: string
  mode: 'create' | 'update'
  summary: string[]
  styleId: string
  layout:
    | { kind: 'installed'; id: string; reason: string }
    | { kind: 'temporary'; reason: string }
  changedFiles: string[]
  reusedComponents: string[]
  newSharedComponents: string[]
  preserved: string[]
  validationChecks: string[]
  expiresAt: string
}
```

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

The proposal stores candidate source and baseline hashes but never stores
`aiConfig`. Read-only baseline enforcement belongs to the apply transaction,
which reloads trusted context and checks every bound hash immediately before
writing.

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
        rolledBack: true
      }
    }
```

Apply reloads context, checks all candidate and read-only baselines, writes
atomically, and asks Vite to transform the current Canvas. Validation may run
at most two AI repairs. A repair must return the same complete path set.
Exhausted or invalid repairs roll every written target back.

Only after a successful transaction, Vite emits:

```ts
{
  type: 'custom'
  event: 'canvas-assistant:applied'
  data: { appId: string; canvasId: string }
}
```

Failed or conflicted transactions never emit this event.
