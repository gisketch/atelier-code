# retrofit-sonata

Use to convert an existing project into Sonata harness standard.

Rules:

- Inventory first: source layout, docs, agent files, commands, architecture, tests.
- Preserve useful existing docs. Move, link, or summarize into `docs/`.
- Root `AGENTS.md` stays short map.
- `docs/index.md` becomes documentation table of contents.
- `docs/project-brief.md` captures product intent.
- `docs/architecture/index.md` captures system map and boundaries.
- `docs/quality.md` captures verified commands only.
- `docs/exec-plans/` captures broad or risky work.
- Keep Codex first, compatibility optional.
- Caveman-terse output unless safety or confusion requires normal prose.

Do not change app behavior unless user asks.

Output:

```text
Inventory:
Moved:
Created:
Checks:
Gaps:
Next:
```