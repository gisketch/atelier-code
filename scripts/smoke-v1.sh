#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$mode" == "--dry-run" ]]; then
  echo "smoke-v1 dry run ok"
  exit 0
fi

tmp="${TMPDIR:-/tmp}/atelier-smoke-$$"
repo="$tmp/repo"
db="$tmp/atelier.sqlite"

cleanup() {
  rm -rf "$tmp"
}
trap cleanup EXIT

mkdir -p "$repo"
git -C "$repo" init -b master >/dev/null
git -C "$repo" config user.email smoke@example.com
git -C "$repo" config user.name "Atelier Smoke"
printf '# Smoke\n' > "$repo/README.md"
git -C "$repo" add README.md
git -C "$repo" commit -m initial >/dev/null

ATELIER_DB_PATH="$db" bun --cwd "$root" test src/daemon/store/index.test.ts src/daemon/api/index.test.ts >/dev/null

echo "smoke-v1 ok repo=$repo db=$db"
