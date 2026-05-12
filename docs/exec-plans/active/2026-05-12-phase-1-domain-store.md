# Goal

Start Phase 1: durable domain model and SQLite store.

# Acceptance criteria

- SQLite schema covers boards, cards, state, runs, artifacts, settings, event history, token totals, retries, and live session snapshots.
- Migration runner applies schema from an empty database.
- Store access layer can create and reload boards and cards.
- Card states are validated against board states.
- Event history is append-only.
- Store tests cover creation, updates, ordering, and restart persistence.

# Context links

- `GOAL.md`
- `SPEC.md`
- `docs/quality.md`
- `docs/architecture/index.md`

# Steps

- [x] Read Phase 1 and current store shape.
- [x] Add compact UI scale pass.
- [x] Add Phase 1 schema migration.
- [x] Add typed store access and normalization helpers.
- [x] Add store tests.
- [x] Validate with repo checks.

# Validation

- `bun test`
- `bun run typecheck`
- `bun run ui:build`
- `bash ./scripts/check-sonata.sh`

# Decision log

- Keep Phase 1 local to `src/daemon/store` and shared contracts.
- Use SQLite foreign keys and triggers where they enforce invariants cheaply.
- Preserve old UI card contract while adding store-specific domain contracts.

# Progress log

- 2026-05-12: Started from existing bootstrap migration and store initializer.
- 2026-05-12: Scaled the app shell down with a smaller header, tighter metrics, and shorter columns.
- 2026-05-12: Added Phase 1 domain schema migration and typed board/card store access.
- 2026-05-12: Added store tests for migrations, persistence, state validation, ordering, moves, and append-only events.
- 2026-05-12: Passed `bun test`, `bun run typecheck`, `bun run ui:build`, `bun run check`, and `bash ./scripts/check-sonata.sh`.
