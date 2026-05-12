# Quality

## Current Checks

| Check | Command | When To Run |
|---|---|---|
| Sonata structure | `./scripts/check-sonata.sh` | After scaffold, docs, or skill changes |

## Retrofit Checks

When `/retrofit-sonata` runs, verify:

- Existing markdown was preserved, moved, linked, or summarized.
- `AGENTS.md` stayed short.
- Project commands in this file are verified or marked unverified.
- Broad migration work has an execution plan.

## Add Stack Checks

Add real commands as soon as the stack exists:

- Install dependencies.
- Format.
- Lint.
- Typecheck or compile.
- Unit tests.
- Integration tests.
- Build.
- Local run or smoke test.

## Quality Bar

- Acceptance criteria exist before broad implementation.
- Validation is reproducible by another agent.
- New decisions update docs.
- Repeated failures become docs, scripts, tests, or tighter prompts.