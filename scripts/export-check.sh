#!/usr/bin/env bash
#
# Unpack what git would ship, install it from the lock file, build it, and run
# the command line against a store it makes itself.
#
# The working tree passing proves less than it looks like it does: it has the
# dev dependencies, the test fixtures, and every file somebody forgot to add.
# This is the only check in the repository that reads what actually ships.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "unpacking the tree git would ship into $work"
git -C "$here" archive HEAD | tar -x -C "$work"

cd "$work"
test -f package.json || { echo "no package.json in the export"; exit 1; }
test -f package-lock.json || { echo "no lock file in the export"; exit 1; }
test -d src || { echo "no source in the export"; exit 1; }
test -d tests || { echo "no tests in the export"; exit 1; }

echo "installing from the lock file"
npm ci --no-audit --no-fund >/dev/null

echo "building"
npm run build >/dev/null

store="$work/district.sqlite"
run() {
  node dist/cli/main.js --store "$store" --actor export-check "$@"
}

echo "filling a district"
run demo >/dev/null
run standing >/dev/null
run summary >/dev/null
run manual --section 'notice ladders' >/dev/null
run doctor >/dev/null
run verify | grep -q 'the file is sound'

echo "checking the exit code of a refusal"
if run connection show SC-99999 >/dev/null 2>&1; then
  echo "a refusal came back zero"
  exit 1
fi

echo "checking the handbook is the one the tables produce"
npx tsx scripts/build-handbook.ts --check >/dev/null
npx tsx scripts/build-command-reference.ts --check >/dev/null

echo "export check passed"
