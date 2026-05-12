#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
cd "$repo_root"

required_files=(
  "AGENTS.md"
  "README.md"
  "docs/index.md"
  "docs/core-beliefs.md"
  "docs/agent-targets.md"
  "docs/project-brief.md"
  "docs/quality.md"
  "docs/architecture/index.md"
  "docs/exec-plans/README.md"
  "docs/references/harness-engineering.md"
  "docs/references/caveman.md"
  ".codex/prompts/init-sonata.md"
  ".codex/prompts/caveman-sonata.md"
  ".codex/prompts/retrofit-sonata.md"
  ".codex/skills/init-sonata/SKILL.md"
  ".codex/skills/caveman-sonata/SKILL.md"
  ".codex/skills/retrofit-sonata/SKILL.md"
  ".github/skills/init-sonata/SKILL.md"
  ".github/skills/caveman-sonata/SKILL.md"
  ".github/skills/retrofit-sonata/SKILL.md"
  ".github/prompts/init-sonata.prompt.md"
  ".github/prompts/caveman-sonata.prompt.md"
  ".github/prompts/retrofit-sonata.prompt.md"
  ".github/prompts/review-sonata.prompt.md"
  "src/README.md"
  "tests/README.md"
  "config/README.md"
)

missing=0

for file in "${required_files[@]}"; do
  if [[ ! -s "$file" ]]; then
    printf 'missing or empty: %s\n' "$file"
    missing=1
  fi
done

if [[ $missing -ne 0 ]]; then
  exit 1
fi

printf 'sonata ok\n'