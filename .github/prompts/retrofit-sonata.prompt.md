---
description: "Retrofit an existing project into Sonata harness standard: docs map, project brief, architecture, quality checks, execution plans, and agent prompts."
name: "Retrofit Sonata"
argument-hint: "Optional focus, constraints, or agent targets"
agent: "agent"
---

Use the `retrofit-sonata` skill.

Goal: make the current project harness-engineering compatible without losing existing knowledge.

Rules:

- Inventory before moving files.
- Preserve useful existing markdown by moving, linking, or summarizing into `docs/`.
- Keep `AGENTS.md` short.
- Keep Codex first.
- Keep all prompts harness-aligned and caveman-terse by default.
- Do not change app behavior unless explicitly requested.
- Run `./scripts/check-sonata.sh` and relevant checks from `docs/quality.md`.

Output findings first, then compact retrofit summary.