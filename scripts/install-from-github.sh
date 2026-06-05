#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REPO_URL="https://github.com/taskovikj/supavibe-panel.git"
REPO_URL="${REPO_URL:-$DEFAULT_REPO_URL}"
REPO_REF="${REPO_REF:-main}"
WORK_DIR="${WORK_DIR:-}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo:"
  echo "  curl -fsSL https://raw.githubusercontent.com/taskovikj/supavibe-panel/main/scripts/install-from-github.sh | sudo bash"
  exit 1
fi

echo "== Supavibe Panel installer =="
echo "Repo: $REPO_URL"
echo "Ref:  $REPO_REF"

apt-get update
apt-get install -y git curl ca-certificates

if [ -z "$WORK_DIR" ]; then
  WORK_DIR="$(mktemp -d)"
  CLEAN_WORK_DIR=1
else
  mkdir -p "$WORK_DIR"
  CLEAN_WORK_DIR=0
fi

cleanup() {
  if [ "${CLEAN_WORK_DIR:-0}" = "1" ] && [ -n "${WORK_DIR:-}" ] && [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

git clone --depth 1 "$REPO_URL" "$WORK_DIR/repo"
cd "$WORK_DIR/repo"

if [ "$REPO_REF" != "main" ]; then
  git fetch --depth 1 origin "$REPO_REF"
  git checkout FETCH_HEAD
fi

exec bash scripts/install.sh
