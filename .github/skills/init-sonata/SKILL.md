---
name: init-sonata
description: "Use when: /init-sonata, initializing this project, turning rough app or mod ideas into repo-local context, filling project brief, defining first milestone, or setting harness direction. Always preserve harness engineering and caveman style."
argument-hint: "Describe the project, users, constraints, and first useful version"
---

# Init Sonata

Convert rough intent into durable repo context.

## Procedure

1. Read [AGENTS.md](../../../AGENTS.md), [docs/project-brief.md](../../../docs/project-brief.md), [docs/architecture/index.md](../../../docs/architecture/index.md), and [docs/quality.md](../../../docs/quality.md).
2. Extract project intent, users, constraints, stack, first milestone, and non-goals from the user's prompt.
3. Update `docs/project-brief.md` first.
4. Update architecture only with facts that are known.
5. Add missing validation commands to `docs/quality.md` when the stack is clear.
6. Create an execution plan under `docs/exec-plans/active/` if implementation spans multiple steps.
7. Run `./scripts/check-sonata.sh`.
8. Respond in caveman style unless safety, irreversible actions, or confusion require normal prose.

## Output

Return terse summary:

```text
Context written:
Plan:
Checks:
Open questions:
```

Only ask questions that block the first useful version.