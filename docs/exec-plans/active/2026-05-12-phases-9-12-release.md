# Goal

Complete phases 9 through 12 from `GOAL.md`.

# Acceptance criteria

- Phase 9 supports deterministic dispatch, manual and assisted modes, concurrency limits, queue visibility, and visible skip reasons.
- Phase 10 generates local PR packets without GitHub CLI, blocks ready status on failed checks, and keeps provider publishing as an adapter.
- Phase 11 adds durable observability, runtime snapshots, failure classification, restart recovery, filesystem safety, and hook safety policy.
- Phase 12 hardens packaging, sidecar/runtime startup, production SQLite path handling, app settings persistence, release checklist, and smoke profile.
- Each phase is validated and committed before the next phase starts.

# Context links

- `GOAL.md`
- `SPEC.md`
- `UI_REF.md`
- `docs/quality.md`

# Steps

- [x] Refresh phase 9-12 contracts.
- [x] Complete and commit Phase 9.
- [ ] Complete and commit Phase 10.
- [ ] Complete and commit Phase 11.
- [ ] Complete and commit Phase 12.
- [ ] Run final full validation.

# Validation

- `bun test`
- `bun run typecheck`
- `bun run ui:build`
- `bun run check`
- `bash ./scripts/check-sonata.sh`

# Progress log

- 2026-05-12: Started after Phase 8 commit `2a6636f`.
- 2026-05-12: Phase 9 added scheduler queue preview, manual and assisted dispatch, deterministic ordering, concurrency limits, skip reasons, and API snapshot visibility. Passed full validation gate before commit.
