---
name: retrofit-sonata
description: "Use when: /retrofit-sonata, retrofitting an existing project into Sonata harness standard, reorganizing docs, understanding a codebase, migrating scattered markdown, or making a project harness-engineering ready. Always preserve harness engineering and caveman style."
argument-hint: "Optional retrofit focus, constraints, or target agent setup"
---

# Retrofit Sonata

Turn an existing or messy project into a Sonata-compatible harness without losing useful project knowledge.

## Core Rule

Do not rewrite blindly. Inventory first, map existing truth, then move or summarize into the harness standard. Preserve useful docs, decisions, commands, and conventions.

## Procedure

1. Read [AGENTS.md](../../../AGENTS.md) if it exists, then [docs/index.md](../../../docs/index.md) if it exists.
2. Inventory the project:
   - Source layout and package/build files.
   - Existing markdown docs.
   - Existing agent files, prompts, skills, or instructions.
   - Test, build, run, lint, and formatting commands.
   - Architecture boundaries and domain concepts.
3. Create or normalize Sonata harness structure:
   - `AGENTS.md` as short map.
   - `docs/index.md` as docs table of contents.
   - `docs/project-brief.md` for product intent.
   - `docs/architecture/index.md` for system map and boundaries.
   - `docs/quality.md` for verified commands.
   - `docs/exec-plans/` for active and completed plans.
   - `docs/references/` for source material and migrated notes.
4. Re-home existing markdown:
   - Keep user-facing `README.md` at root.
   - Move durable project knowledge into `docs/`.
   - Summarize duplicates instead of copying everything.
   - Link to original docs when moving would be risky.
5. Normalize agent surfaces:
   - Keep Codex first through `AGENTS.md` and `.codex/prompts/`.
   - Keep Copilot/Claude compatibility only if present or requested.
   - Ensure prompts preserve harness engineering and caveman style.
6. Add or update `scripts/check-sonata.sh` so another agent can verify the harness.
7. Run checks from `docs/quality.md` plus `./scripts/check-sonata.sh`.
8. Create an execution plan if retrofit requires risky moves or broad rewrites.

## Safety

- Do not delete existing docs unless duplicates are fully merged and obviously obsolete.
- Do not change app behavior while retrofitting harness files unless explicitly requested.
- Do not invent build/test commands. Mark unknown commands as unverified.
- Use normal prose for destructive moves, ambiguity, or user confusion.

## Output

```text
Inventory:
Moved:
Created:
Checks:
Gaps:
Next:
```