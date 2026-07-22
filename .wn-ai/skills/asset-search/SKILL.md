# Asset Search (IDE)

Skill for locating a design-rule or layout asset id under `apps/design/framework/public/assets/{designmd,layoutmd}/INDEX.md` through a short dialogue with the developer.

## When to use

- Developer asks "help me pick a style / layout for this app" from inside the IDE
- Developer wants to remember what tags / origins exist without opening the browser

## Steps

1. Ask which kind: `designmd` (style) or `layoutmd`.
2. Read the matching `INDEX.md` from disk (path shown above). Extract `dir / title / summary / tags / origin / preview` per row.
3. Ask ONE targeted narrowing question at a time (mood / domain / colors / density). Stop when candidates <= 8.
4. Return the final list as `id — title (origin)`, and offer to copy the id to the app's `app.json` (edit or point out the file).

## Output contract

- Never invent an id. Only surface ids present in `INDEX.md`.
- If the request is unrelated to asset selection, decline and suggest the correct tool / doc instead.

## Notes

- This IDE skill is intentionally independent from the browser prompt at `apps/design/framework/public/prompts/asset-search.md`. Update both if the taxonomy changes.
