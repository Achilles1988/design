# Dual Theme Styles (light / dark) on Apps

Date: 2026-07-31  
Status: Approved for implementation planning

## Goal

把 App 的单一 `style` 字符串改成按 **light / dark** 两个槽位配置；安装交互按库存 `DESIGN.md` frontmatter 的 `light`/`dark` tags 自动写入或弹窗选择；预览与生成消费规则分开；全站直接改用新结构，**不做**旧字符串兼容。面向用户的 UI 文案一律 **English**。

## Context

- 现状：`app.json.style` 为单个 id；`POST …/assets/designmd/:id/apply` **替换**该字段；App 详情一行 Style + Edit 进 Rule 库；Layouts 已是可追加数组。
- 库存 `framework/public/assets/designmd/*/DESIGN.md` 已在 `tags` 中标注 `light` / `dark`（可仅一侧、可两侧、理论上可都无）。
- Shell 已有 `ThemeMode = 'light' | 'dark'`（`data-theme`），与 App style 槽位应对齐语义，但生成侧不跟当前主题绑死。

## Decisions

| Topic | Decision |
|-------|----------|
| 存储形状 | `style: { light?: string, dark?: string }` |
| 同 id | 允许两侧相同 |
| 缺侧 | 允许一侧或两侧暂时为空 |
| 旧格式 | **不兼容**：代码与文档只认对象；仓库内现有 `app.json` 一次改掉 |
| 本仓 design App | `light: "default"`, `dark: "dashboard"` |
| 新建 App | `style: {}` |
| 裁决位置 | **服务端**（design-fs）：读库存 tags，决定自动写 / needsSlot / 不支持 |
| 无 slot 安装 | 仅 light → 写 light；仅 dark → 写 dark；都有或都无 → 需选择 light / dark / both |
| 有 slot 安装（含详情 Edit deep-link） | 支持该槽则直接写；不支持则错误提示、不写盘；`both` 仅在 polarity 允许时把同一 id 写入两侧 |
| 预览 | 能跟 Shell 主题则跟；仅一侧有值则始终用该侧 |
| Assistant / wn-design-prd | **生成**覆盖所有已配置槽位（与当前主题无关）；**展示**契约跟随当前 Shell 主题对应槽 |
| Layouts | 不变 |
| 用户文案语言 | English |

## Architecture

```text
DESIGN.md tags ──► polarity (light | dark | both)
                         │
Asset apply (optional slot) ──► design-fs store ──► app.json.style.{light,dark}
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   Preview (theme)   Assistant/PRD    App detail UI
   resolve one id    generate all     edit/clear slots
                     configured slots
```

Approach: server-side adjudication (chosen). Browser only renders English dialogs for `needsSlot` and unsupported-slot errors, then retries with `slot`.

## Data model

```json
{
  "id": "design",
  "name": "design",
  "style": {
    "light": "default",
    "dark": "dashboard"
  },
  "layouts": ["sidebar-shell"]
}
```

- Each of `light` / `dark` is an optional non-empty trimmed stock id under `stylesRoot`.
- Contract path per slot: `<designRoot>/<stylesRoot>/<id>/DESIGN.md` or `design.md`.
- `normalizeApp`: `style` must be an object (default `{}`); keep only non-empty string `light` / `dark`. A legacy `style` string is **invalid** — do not coerce; in-repo apps are rewritten in the same change so loaders never see it.
- Types: `AppStyleSlots = { light?: string; dark?: string }`; `AppConfig.style: AppStyleSlots`.

## Polarity

Derived only from frontmatter `tags` (lowercase string match for exact tag `light` / `dark`):

| tags contain | polarity |
|--------------|----------|
| only `light` | `light` |
| only `dark` | `dark` |
| both or neither | `both` |

`both` means the client may choose `light`, `dark`, or `both` (write same id to both slots).

## design-fs API

### Apply style

`POST /__design_fs/assets/designmd/:id/apply`

Body:

```json
{ "appId": "<id>", "slot"?: "light" | "dark" | "both" }
```

| Case | Result |
|------|--------|
| no `slot`, polarity `light` or `dark` | 200, write that slot |
| no `slot`, polarity `both` | no write; **409** with `{ "error": "<English message>", "needsSlot": true, "options": ["light","dark","both"] }` |
| `slot` supported | 200; `light`/`dark` merge one side; `both` set both sides to this package id |
| `slot` unsupported | no write; **400** with English error |

Layout apply (`layoutmd`) unchanged (append to `layouts`).

### Clear style slot

`DELETE /__design_fs/apps/:id/style/:slot` where `slot` is `light` or `dark` → clears that key; both may be empty.

### Store helpers

- `setAppStyle(appId, patch: { light?: string | null, dark?: string | null })` — `null` clears; at least one key required.
- Replace former `setAppStyle(id, style: string)`.

### Client

- `designApi.applyAsset(kind, id, appId, slot?)`
- `designApi.removeAppStyle(appId, slot)`
- Handle `needsSlot` → English Light / Dark / Both dialog → retry with `slot`.

## UI

User-facing copy: English only.

### App detail

- Two rows: **Light** and **Dark**.
- Set: `<code>id</code>`, Edit → `/assets/rule?appId=…&slot=light|dark`, Clear → DELETE.
- Unset: placeholder `—`, Edit with same deep-link.

### Rule library (`AssetBrowserPage` designmd)

- Apply label: install semantics (e.g. **Install style**), not “Replace style”.
- With URL `slot`: apply with that slot; unsupported → English alert, no write.
- Without `slot`: auto-install or English choice dialog (Light / Dark / Both).
- Update tips (`STYLE_REPLACE_TIP` → dual-slot / Both wording).

## Consumers

### Preview

1. Read Shell theme (`light` | `dark`).
2. If that slot has an id → use it.
3. Else if the other slot has an id → use the other (single-theme app stays as-is).
4. Else → no style contract (explicit empty / error consistent with missing style).

### Canvas Assistant / `wn-design-prd` / design-review

- **Generate / constrain:** for every configured slot, include that style contract (if both set, both must be covered). Independent of current Shell theme. If **no** slots are set, hard-stop as missing style (same bar as today’s mandatory style). If exactly one is set, generate for that slot only.
- **Display** of which contract is “active” in chrome: follow Shell theme slot; if that slot empty, show English “not set”. Unlike preview, display does **not** fall back to the other slot (avoids implying the empty theme is configured).

### Docs / skills / lessons

Update in the same change:

- `docs/dev/api/design-fs.md`
- `docs/dev/api/design-project.md`
- `wn-design-prd` / design-review / lessons / any `app.style` string assumptions

## Error handling

| Condition | Behavior |
|-----------|----------|
| needsSlot | 409 + options; UI dialog; retry |
| unsupported slot | 400; UI alert; no write |
| missing stock package | existing 404 behavior |
| clear slot | always allowed (including last style) |
| empty style object at generate time | hard-stop (missing style); one slot set → generate that slot only |

## Testing

- Store normalize/read/write object `style`; no string branch.
- Apply: auto light, auto dark, needsSlot, slot ok, slot unsupported, `both` writes both.
- DELETE style slot; createApp → `style: {}`.
- Fixture design App: `default` / `dashboard`.
- UI: dual rows, deep-link slot, English dialogs.
- Preview resolution matrix (theme × which slots filled).
- Assistant/context loads all configured style contracts.

## Non-goals

- Retagging stock packages (already tagged).
- Runtime compatibility with `style: string`.
- Changing layout multi-install model.
- Building a separate polarity index file (read tags from DESIGN.md at apply time).

## Implementation order (planning hint)

1. Types + store + API docs + in-repo `app.json` rewrites + tests  
2. Client API + App detail + Asset apply UI/dialogs  
3. Preview resolution  
4. Canvas assistant / wn-design-prd / review / lessons  
5. Sweep remaining string `style` references
