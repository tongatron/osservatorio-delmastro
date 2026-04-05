#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_NAME="${REMOTE_NAME:-origin}"
BRANCH_NAME="${BRANCH_NAME:-main}"

cd "$ROOT_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Repository has local changes; aborting automated update." >&2
  exit 1
fi

git checkout -q "$BRANCH_NAME"
git pull --rebase --autostash "$REMOTE_NAME" "$BRANCH_NAME"

npm run update

TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
printf '{\n  "lastCheckedAt": "%s",\n  "lastCheckedBy": "raspberry.local"\n}\n' "$TIMESTAMP" > data/status.json

if git diff --quiet -- data/articles.json data/status.json; then
  echo "No dataset changes detected."
  exit 0
fi

ARTICLES_CHANGED=0
if ! git diff --quiet -- data/articles.json; then
  ARTICLES_CHANGED=1
fi

git config user.name "raspberrypi-bot"
git config user.email "raspberrypi-bot@local"
git add data/articles.json data/status.json

if [ "$ARTICLES_CHANGED" -eq 1 ]; then
  git commit -m "Update articles dataset (${TIMESTAMP})"
else
  git commit -m "Update check status (${TIMESTAMP})"
fi

if ! git push "$REMOTE_NAME" "$BRANCH_NAME"; then
  echo "Initial push failed, syncing latest remote changes and retrying once." >&2
  git pull --rebase --autostash "$REMOTE_NAME" "$BRANCH_NAME"
  git push "$REMOTE_NAME" "$BRANCH_NAME"
fi
