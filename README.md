# Atelier

Local-first Sonata Orchestrator desktop app.

Atelier turns local Kanban cards into isolated Codex planning, implementation,
verification, and PR-packet runs while preserving repository-owned Sonata
context.

## Quick Start

1. Read [AGENTS.md](AGENTS.md).
2. Fill or refine [docs/project-brief.md](docs/project-brief.md).
3. Use `/init-sonata` to turn a rough idea into repo-local context.
4. Use `/retrofit-sonata` when adapting an existing project or messy docs into the harness standard.
5. Use `/caveman-sonata` for terse, harness-aware implementation work.
6. Run `./scripts/check-sonata.sh` before handing work to another agent.

## Development

Install dependencies:

```powershell
bun install
```

Run the daemon:

```powershell
bun run daemon:dev
```

Run the Tauri app:

```powershell
bun run tauri:dev
```

Validate the current stack:

```powershell
bun run check
```

## Project Shape

- Kind: local desktop app.
- Stack: Tauri v2, Rust, React, TypeScript, Vite, Bun, SQLite.
- Package manager: Bun.
- First milestone: Phase 0 bootstrap from [GOAL.md](GOAL.md).

## Principle

Terse chat. Explicit repo memory. Checks over vibes.
