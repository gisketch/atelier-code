# Goal

Start Phase 2: workflow and configuration loading.

# Acceptance criteria

- Workflow loader reads `docs/orchestration/workflow.md` or the board workflow path.
- Missing workflow files return an actionable error.
- YAML front matter is parsed and rejected when malformed or not a map.
- Built-in defaults are resolved with workflow config, board settings, operator overrides, and explicit `$VAR` path references.
- Prompt templates render with strict variable handling.
- Tests cover defaults, missing files, invalid front matter, config coercion, env expansion, and template rendering.

# Context links

- `GOAL.md`
- `SPEC.md`
- `docs/quality.md`
- `src/daemon/store/index.ts`

# Steps

- [x] Read Phase 2 spec.
- [x] Add workflow loader module.
- [x] Add config resolver and validation.
- [x] Add strict prompt renderer.
- [x] Add tests.
- [x] Validate.

# Validation

- `bun test`
- `bun run typecheck`
- `bun run ui:build`
- `bash ./scripts/check-sonata.sh`

# Decision log

- Implement a small YAML front matter parser for v1-supported scalar, inline list, and nested map shapes.
- Keep unsupported YAML explicit as parse errors rather than silently guessing.
- Strict templates support dotted paths and fail on unknown variables.

# Progress log

- 2026-05-12: Started from Phase 2 contract in `GOAL.md` and `SPEC.md`.
- 2026-05-12: Added workflow loader, front matter parser, config resolver, strict prompt renderer, and tests.
- 2026-05-12: Passed `bun test`, `bun run typecheck`, `bun run ui:build`, `bun run check`, and `bash ./scripts/check-sonata.sh`.
