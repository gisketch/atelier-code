# Goal

Complete phases 4 through 8 from `GOAL.md` against `SPEC.md` and `UI_REF.md`.

# Acceptance criteria

- Phase 4: orchestration state machine, eligibility, run attempts, retries, and startup reconciliation work against SQLite.
- Phase 5: daemon exposes local API operations with typed envelopes and Tauri keeps a stable daemon bridge.
- Phase 6: React board consumes live daemon data and presents board, details, runs, logs, artifacts, settings, and state surfaces in the dark glass UI.
- Phase 7: runner protocol builds prompts, handles fake agent execution, tracks events, and accounts tokens.
- Phase 8: Sonata context loading and artifact writers produce plan, verification, and PR packet artifacts safely.
- Every phase is validated and committed before the next phase starts.

# Context links

- `SPEC.md`
- `UI_REF.md`
- `GOAL.md`
- `docs/quality.md`

# Steps

- [x] Read full `SPEC.md`.
- [x] Read full `UI_REF.md`.
- [x] Complete and commit Phase 4.
- [x] Complete and commit Phase 5.
- [x] Complete and commit Phase 6.
- [x] Complete and commit Phase 7.
- [x] Complete and commit Phase 8.
- [x] Run final full validation.

# Validation

- `bun test`
- `bun run typecheck`
- `bun run ui:build`
- `bun run check`
- `bash ./scripts/check-sonata.sh`

# Progress log

- 2026-05-12: Started combined Phase 4-8 execution after Phase 3 commit `622abdd`.
- 2026-05-12: Phase 4 added store-backed orchestration transitions, eligibility, retries, and startup reconciliation. Passed full validation gate before commit.
- 2026-05-12: Phase 5 added local API envelopes, board/card/run/artifact endpoints, snapshot output, and a Tauri daemon endpoint command. Passed full validation gate before commit.
- 2026-05-12: Phase 6 replaced static UI data with daemon snapshot loading, card detail, run history, artifact list, dispatch actions, plan-gate state, and settings/status surfaces. Passed full validation gate before commit.
- 2026-05-12: Phase 7 added the runner protocol, compact prompt construction, fake transport, event emission, workspace launch guard, and token delta handling. Passed full validation gate before commit.
- 2026-05-12: Phase 8 added Sonata context loading and safe plan, verification, and PR packet artifact writers. Passed full validation gate before commit.
