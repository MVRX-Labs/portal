#!/usr/bin/env bash

MAX_LINES=300
ALLOWLIST_FILE=".file-length-allowlist"
failed=0

allowlisted() {
  [ -f "$ALLOWLIST_FILE" ] || return 1
  while IFS= read -r pattern || [ -n "$pattern" ]; do
    pattern="${pattern%%#*}"
    pattern="$(echo "$pattern" | xargs)"
    [ -z "$pattern" ] && continue
    # shellcheck disable=SC2254
    case "$1" in $pattern) return 0 ;; esac
  done < "$ALLOWLIST_FILE"
  return 1
}

for file in "$@"; do
  [ -f "$file" ] || continue
  allowlisted "$file" && continue

  lines=$(wc -l < "$file" | tr -d ' ')
  if [ "$lines" -gt "$MAX_LINES" ]; then
    echo "ERROR: $file has $lines lines (max $MAX_LINES)."
    echo "  Long files hamper agents' ability to understand and work with the codebase."
    echo "  Break it into smaller, focused modules — or add it to $ALLOWLIST_FILE if unavoidable."
    echo ""
    failed=1
  fi
done

exit $failed
