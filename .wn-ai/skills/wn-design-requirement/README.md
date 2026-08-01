# wn-design-requirement

Lean skill: turn a UI requirement into a previewable App Canvas under the App's
style contracts and `tokens.css`.

## Usage

```text
/wn-design-requirement
```

## Checks

```bash
node scripts/find-design-root.mjs <repoRoot>
node scripts/list-apps.mjs <designRoot>
node scripts/check-app-style.mjs <designRoot> <appId>
node scripts/check-app-tokens.mjs <designRoot> <appId>
```

## Docs

- Spec: `docs/dev/superpowers/specs/2026-08-01-wn-design-requirement-design.md`
- API: `docs/dev/api/app-tokens.md`

## Pressure scenarios (verification)

1. No `design.project.json` → agent stops with install hint (does not invent paths).
2. App with empty `style` → agent stops; does not invent style ids.
3. User attaches a screenshot → agent asks mode 1/2/3 before coding; still uses App tokens.
4. App has light+dark slots → Canvas follows `data-theme` for both; no local theme toggle.
5. `tokens.css` missing → agent writes fingerprint-valid file before Canvas paint.
