# wn-design-requirement

Lean skill: turn a UI requirement into a previewable App Canvas under the App's
style contracts and `tokens.css`.

## Usage

```text
/wn-design-requirement
```

## Checks

Run from the repository root:

```bash
S=.wn-ai/skills/wn-design-requirement/scripts
node $S/find-design-root.mjs <repoRoot>
node $S/list-apps.mjs <designRoot>
node $S/check-app-style.mjs <designRoot> <appId>
node $S/check-app-tokens.mjs <designRoot> <appId>
```

`find-design-root.mjs` prints an absolute path and skips `node_modules`,
`.git`, `.worktrees`, and `worktrees`.

## Docs

- Spec: `docs/dev/superpowers/specs/2026-08-01-wn-design-requirement-design.md`
- API: `docs/dev/api/app-tokens.md`

## Pressure scenarios (verification)

1. No `design.project.json` → agent stops with install hint (does not invent paths).
2. App with empty `style` → agent stops; does not invent style ids.
3. User attaches a screenshot → agent asks mode 1/2/3 before coding; still uses App tokens.
4. App has light+dark slots → Canvas follows `data-theme` for both; no local theme toggle.
5. `tokens.css` missing → agent writes fingerprint-valid file before Canvas paint.
