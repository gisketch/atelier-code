# Quality

## Current Checks

| Check | Command | When To Run |
|---|---|---|
| Install dependencies | `bun install` | After package changes |
| TypeScript typecheck | `bun run typecheck` | After UI, daemon, or shared TypeScript changes |
| Rust/Tauri compile check | `cargo check --manifest-path src-tauri/Cargo.toml` | After Tauri shell changes |
| Combined stack check | `bun run check` | Before handoff for stack changes |
| UI production build | `bun run ui:build` | Before packaging or UI handoff |
| Daemon dev server | `bun run daemon:dev` | When changing daemon routes or store bootstrap |
| Sonata structure | `./scripts/check-sonata.sh` | After scaffold, docs, or skill changes |

## Retrofit Checks

When `/retrofit-sonata` runs, verify:

- Existing markdown was preserved, moved, linked, or summarized.
- `AGENTS.md` stayed short.
- Project commands in this file are verified or marked unverified.
- Broad migration work has an execution plan.

## Future Checks

Add these as the implementation grows:

- Format.
- Unit tests.
- Integration tests.
- Tauri packaged build.
- Local run or smoke test against a disposable target repository.

## Quality Bar

- Acceptance criteria exist before broad implementation.
- Validation is reproducible by another agent.
- New decisions update docs.
- Repeated failures become docs, scripts, tests, or tighter prompts.
