#!/bin/bash
# Source .env.local properly, override DB URL for local Docker
set -a
source .env.local
set +a
export STORAGE_DATABASE_URL="postgres://mvrx:mvrx@localhost:5433/mvrx"
exec "$@"
