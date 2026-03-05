#!/usr/bin/env bash
# context-mode-universal — Claude Code one-liner installer
set -euo pipefail

echo "Installing context-mode-universal for Claude Code..."

# Add MCP server
claude mcp add context-mode -- npx -y context-mode-universal

echo ""
echo "✓ context-mode installed!"
echo ""
echo "Verify with:"
echo "  claude mcp list"
echo ""
echo "Usage in Claude Code:"
echo "  The context-mode tools are now available in any Claude Code session."
echo "  Tools: execute, execute_file, index, search, fetch_and_index, compress, proxy"
