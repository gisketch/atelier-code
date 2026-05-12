---
name: retrofit-sonata
description: "Use when: /retrofit-sonata, retrofitting an existing project into Sonata harness standard, reorganizing docs, understanding a codebase, migrating scattered markdown, or making a project harness-engineering ready. Always preserve harness engineering and caveman style."
argument-hint: "Optional retrofit focus, constraints, or target agent setup"
---

# Retrofit Sonata

Turn an existing or messy project into a Sonata-compatible harness without losing useful project knowledge.

## Procedure

1. Inventory source layout, package/build files, markdown docs, agent files, commands, tests, and architecture concepts.
2. Preserve useful docs by moving, linking, or summarizing into `docs/`.
3. Keep root `AGENTS.md` short.
4. Normalize `docs/index.md`, `docs/project-brief.md`, `docs/architecture/index.md`, `docs/quality.md`, and `docs/exec-plans/`.
5. Keep Codex first; compatibility targets optional.
6. Do not change app behavior unless explicitly requested.
7. Run `./scripts/check-sonata.sh`.

## Output

```text
Inventory:
Moved:
Created:
Checks:
Gaps:
Next:
```