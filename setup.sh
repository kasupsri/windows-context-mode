#!/usr/bin/env bash
set -euo pipefail

SKIP_INSTALL=false
SKIP_BUILD=false
SKIP_TESTS=false
SKIP_DOCTOR=false
SKIP_CURSOR=false
SKIP_CODEX=false

for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=true ;;
    --skip-build) SKIP_BUILD=true ;;
    --skip-tests) SKIP_TESTS=true ;;
    --skip-doctor) SKIP_DOCTOR=true ;;
    --skip-cursor) SKIP_CURSOR=true ;;
    --skip-codex) SKIP_CODEX=true ;;
    *)
      echo "Unknown option: $arg"
      echo "Valid options: --skip-install --skip-build --skip-tests --skip-doctor --skip-cursor --skip-codex"
      exit 1
      ;;
  esac
done

step() {
  printf '\n==> %s\n' "$1"
}

assert_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command '$1' was not found in PATH."
    exit 1
  fi
}

ensure_codex_config_entry() {
  local codex_dir="$HOME/.codex"
  local config_path="$codex_dir/config.toml"
  local block_header='[mcp_servers.context-mode]'
  local block='[mcp_servers.context-mode]
command = "npx"
args = ["-y", "context-mode-universal"]'

  mkdir -p "$codex_dir"

  if [[ ! -f "$config_path" ]]; then
    printf '%s\n' "$block" > "$config_path"
    echo "Wrote Codex MCP config to: $config_path"
    return
  fi

  if grep -Fq "$block_header" "$config_path"; then
    echo "Codex MCP config already contains context-mode entry."
    return
  fi

  printf '\n%s\n' "$block" >> "$config_path"
  echo "Appended context-mode MCP config to: $config_path"
}

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Context Mode Universal setup started."
echo "Project: $PROJECT_ROOT"

cd "$PROJECT_ROOT"

assert_command node
assert_command npm

if [[ "$SKIP_INSTALL" == "false" ]]; then
  step "Installing npm dependencies"
  npm install
fi

if [[ "$SKIP_BUILD" == "false" ]]; then
  step "Building TypeScript"
  npm run build
fi

if [[ "$SKIP_TESTS" == "false" ]]; then
  step "Running test suite"
  npm test
fi

if [[ "$SKIP_DOCTOR" == "false" ]]; then
  step "Running diagnostics"
  npm run doctor
fi

if [[ "$SKIP_CURSOR" == "false" ]]; then
  step "Setting up Cursor files"
  npx -y context-mode-universal setup cursor
fi

if [[ "$SKIP_CODEX" == "false" ]]; then
  step "Configuring Codex MCP server"
  if command -v codex >/dev/null 2>&1; then
    codex mcp add context-mode -- npx -y context-mode-universal
    codex mcp list
  else
    echo "Codex CLI not found. Falling back to ~/.codex/config.toml update."
    ensure_codex_config_entry
    echo "Restart your Codex-enabled editor to pick up MCP config."
  fi
fi

printf '\nSetup complete.\n'
echo "Recommended checks:"
echo "  npm run doctor"
echo "  codex mcp list"
