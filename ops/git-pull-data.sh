#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_NAME="${REMOTE_NAME:-origin}"
BRANCH_NAME="${BRANCH_NAME:-main}"

cd "$ROOT_DIR"

git fetch "$REMOTE_NAME" "$BRANCH_NAME" --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "$REMOTE_NAME/$BRANCH_NAME")

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "Already up to date."
  exit 0
fi

git pull --rebase --autostash "$REMOTE_NAME" "$BRANCH_NAME"
echo "Data updated at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
