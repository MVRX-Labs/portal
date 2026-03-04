#!/usr/bin/env bash

npx prettier --write "$@" 2>/dev/null
git add "$@"
exit 0
