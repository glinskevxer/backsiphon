#!/usr/bin/env bash
#
# Everything ci runs, in the order it runs it, on one machine.
#
# The point is that a red build should never be a surprise. Anybody about to
# push runs this, and it is the same list, so ci telling somebody something
# they could have found out in four minutes is a bug in this file.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

failed=()

step() {
  local name="$1"
  shift
  printf '\n== %s\n' "$name"
  if "$@"; then
    return 0
  fi
  failed+=("$name")
}

step 'formatting' npx prettier --check "src/**/*.ts" "tests/**/*.ts" "scripts/**/*.ts"
step 'lint' npm run lint --silent
step 'types' npm run typecheck --silent
step 'tests' npm test --silent
step 'handbook' npm run handbook:check --silent
step 'command reference' npm run commands:check --silent
step 'release checks' npm run release-check --silent

if [ ${#failed[@]} -eq 0 ]; then
  printf '\nall of it passed\n'
  exit 0
fi

printf '\nfailed: %s\n' "${failed[*]}"
exit 1
