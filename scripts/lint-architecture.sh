#!/usr/bin/env bash
#
# Enforces dependency layer rules for the MVRX codebase.
# See docs/architecture.md for the full dependency diagram.
#
# Rules:
#   1. trigger/ must NOT import from app/
#   2. lib/ must NOT import from trigger/
#   3. components/ must NOT import from trigger/
#   4. trigger/ must NOT use console.log (use logger from @trigger.dev/sdk)
#

failed=0

# Rule 1: trigger/ must not import from app/
while IFS= read -r match; do
  if [ -n "$match" ]; then
    echo "ERROR: Trigger task imports from app/"
    echo "  $match"
    echo ""
    echo "  FIX: Trigger tasks run in Trigger.dev's runtime, not Next.js."
    echo "  Move the shared code to src/lib/ and import from there instead."
    echo ""
    failed=1
  fi
done < <(grep -rn 'from ["'"'"']@/app/' src/trigger/ 2>/dev/null || true)

# Rule 2: lib/ must not import from trigger/
while IFS= read -r match; do
  if [ -n "$match" ]; then
    echo "ERROR: lib/ imports from trigger/"
    echo "  $match"
    echo ""
    echo "  FIX: lib/ is lower-level shared code. It must not depend on trigger tasks."
    echo "  If trigger/ and lib/ need shared types, define them in lib/."
    echo ""
    failed=1
  fi
done < <(grep -rn 'from ["'"'"']@/trigger/' src/lib/ 2>/dev/null || true)
while IFS= read -r match; do
  if [ -n "$match" ]; then
    echo "ERROR: lib/ imports from trigger/"
    echo "  $match"
    echo ""
    echo "  FIX: lib/ is lower-level shared code. It must not depend on trigger tasks."
    echo "  If trigger/ and lib/ need shared types, define them in lib/."
    echo ""
    failed=1
  fi
done < <(grep -rn 'from ["'"'"']\.\./trigger/' src/lib/ 2>/dev/null || true)

# Rule 3: components/ must not import from trigger/
while IFS= read -r match; do
  if [ -n "$match" ]; then
    echo "ERROR: Component imports from trigger/"
    echo "  $match"
    echo ""
    echo "  FIX: UI components must not import trigger tasks directly."
    echo "  Use API routes to interact with background jobs instead."
    echo ""
    failed=1
  fi
done < <(grep -rn 'from ["'"'"']@/trigger/' src/components/ 2>/dev/null || true)

# Rule 4: trigger/ must not use console.log/warn/error (use logger from @trigger.dev/sdk)
while IFS= read -r match; do
  if [ -n "$match" ]; then
    echo "ERROR: Trigger task uses console.log instead of logger"
    echo "  $match"
    echo ""
    echo "  FIX: Use 'import { logger } from \"@trigger.dev/sdk\"' and call"
    echo "  logger.info(), logger.warn(), logger.error() instead."
    echo "  This integrates with Trigger.dev's log viewer and dashboard."
    echo ""
    failed=1
  fi
done < <(grep -rn 'console\.\(log\|warn\|error\|info\)' src/trigger/ 2>/dev/null || true)

if [ $failed -eq 0 ]; then
  exit 0
fi

exit 1
