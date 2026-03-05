# Contributing to context-mode-universal

Thanks for contributing. This repository focuses on a cross-platform MCP server with strong safety defaults and deterministic context compression.

## Development Setup

```bash
git clone https://github.com/kasupsri/context-mode-universal.git
cd context-mode-universal
npm install
npm run build
npm test
```

Optional bootstrap:

- Windows: `powershell -ExecutionPolicy Bypass -File .\setup.ps1`
- macOS/Linux: `bash ./setup.sh`

## Project Layout

```text
src/
  adapters/        IDE setup flows (Cursor, Codex, Copilot, Windsurf, Claude Code)
  compression/     Content-aware compression and chunking
  config/          Defaults and env parsing
  knowledge-base/  SQLite indexing and BM25 search
  sandbox/         Runtime resolution and command execution
  security/        Policy rules and evaluation
  tools/           MCP tool handlers
  utils/           Logging, token estimation, stats tracking

tests/
  unit/            Module-level behavior
  integration/     MCP and index/search integration
  benchmarks/      Compression benchmark tests
```

## Quality Gates

Run these before opening a PR:

```bash
npm run lint
npm run format:check
npm run build
npm test
```

If your change affects compression behavior:

```bash
npm run benchmark
```

## Contribution Guidelines

- Keep compression deterministic (no external model/API dependency).
- Preserve cross-platform runtime behavior and OS-aware policy defaults.
- Add/update tests for behavioral changes.
- Keep docs aligned with command names, tool names, and setup flows.
- Avoid broad unrelated refactors in the same PR.

## Adding or Updating an MCP Tool

1. Implement/update tool logic in `src/tools/`.
2. Register schema and handler mapping in `src/server.ts`.
3. Add unit/integration coverage in `tests/`.
4. Update `README.md` tool docs if behavior changes.

## Adding a New IDE Setup Adapter

1. Implement `BaseAdapter` in `src/adapters/`.
2. Add detection/setup behavior and output files.
3. Register it in `src/adapters/generic.ts`.
4. Document setup caveats in `README.md`.
5. Add tests or verification notes in your PR.

## Pull Requests

1. Fork and create a branch (`feat/*`, `fix/*`, `docs/*`).
2. Keep commits focused and descriptive.
3. Include a PR description with:
- what changed
- why it changed
- how it was tested
- OS/shell validation performed (Windows/macOS/Linux where relevant)

## Reporting Issues

Use:

- [Bug report template](.github/ISSUE_TEMPLATE/bug_report.md)
- [Feature request template](.github/ISSUE_TEMPLATE/feature_request.md)

Please include Node.js version, OS, IDE/client details, and a minimal reproduction.
