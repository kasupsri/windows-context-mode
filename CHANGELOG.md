# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Breaking rename from `windows-context-mode` to `context-mode-universal` (package name, repository URLs, setup templates, and server metadata).
- Expanded shell runtime model to `auto`, `powershell`, `cmd`, `git-bash`, `bash`, `zsh`, and `sh`.
- Added OS-aware auto shell fallback order for Windows/macOS/Linux.
- Renamed environment variables from `WCM_*` to `CMU_*`.
- Rewrote README/HOW_IT_WORKS/CONTRIBUTING and issue templates for cross-platform usage.
- Updated diagnostics, stats headers, and fetch User-Agent branding to `context-mode-universal`.
- Expanded CI test matrix to run on Windows, macOS, and Linux (Node 20 and 22).

### Added
- POSIX bootstrap script (`setup.sh`) with feature parity flags to `setup.ps1`.
- OS-aware security rules for strict/balanced policy modes (Windows + POSIX destructive command patterns).

## [0.1.0] - 2026-03-04

### Added
- Initial `context-mode-universal` release.
- MCP tools: `execute`, `execute_file`, `index`, `search`, `fetch_and_index`, `compress`, `proxy`, `stats_get`, `stats_reset`, `stats_export`, `doctor`.
- Windows-first shell runtime strategy with fallback (`PowerShell -> cmd -> Git Bash`).
- Configurable policy modes: `strict`, `balanced`, `permissive`.
- Content-aware deterministic compression and intent-based filtering.
- Local SQLite FTS5/BM25 knowledge base indexing and search.
- Setup flows for Cursor and Codex plus PowerShell bootstrap script.
- Session token/bytes savings tracking with export support.
- Unit, integration, and benchmark test coverage.
