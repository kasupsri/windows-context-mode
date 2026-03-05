# context-mode-universal

`context-mode-universal` is a cross-platform MCP server for safe command execution, output compression, and searchable context retrieval.

## Why This Project

- Works across Windows, macOS, and Linux.
- Enforces security policy checks before command execution.
- Optimizes all tool responses for minimal token usage.
- Provides local BM25 indexing/search for docs and large text.

## What It Provides

- Sandboxed execution with policy gates.
- Deterministic, algorithmic output compression (no LLM/API dependency).
- Global response optimization under `max_output_tokens`.
- Local SQLite knowledge-base indexing + search.
- Session stats telemetry for bytes/tokens saved.
- Diagnostics (`doctor`) for runtime/policy/config visibility.

## Requirements

- Node.js 18+
- `npm` / `npx`
- Optional: `codex` CLI for one-command Codex registration

## Installation

### Run From Source

```bash
git clone https://github.com/kasupsri/context-mode-universal.git
cd context-mode-universal
npm install
npm run build
npm run doctor
```

Register the built server with your MCP client:

- command: `node`
- args: `[/absolute/path/to/dist/index.js]`

### Install With npx

```bash
npx -y context-mode-universal setup cursor
codex mcp add context-mode -- npx -y context-mode-universal
codex mcp list
```

## Bootstrap Scripts

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

macOS/Linux:

```bash
bash ./setup.sh
```

`setup.sh` supports:

- `--skip-install`
- `--skip-build`
- `--skip-tests`
- `--skip-doctor`
- `--skip-cursor`
- `--skip-codex`

`setup.ps1` supports:

- `-SkipInstall`
- `-SkipBuild`
- `-SkipTests`
- `-SkipDoctor`
- `-SkipCursor`
- `-SkipCodex`

## MCP Tools

- `execute`: Run code in a sandboxed subprocess with OS-aware shell resolution.
- `execute_file`: Analyze/process file content in a sandboxed JavaScript runtime.
- `compress`: Re-optimize text using content-aware strategy hints.
- `index`: Index markdown/text into BM25 chunks.
- `search`: Query indexed content.
- `fetch_and_index`: Fetch URL content, convert to markdown/text, and index it.
- `proxy`: Proxy tool-like actions and return optimized output.
- `stats_get`: Show in-memory session compression savings.
- `stats_reset`: Reset in-memory session stats.
- `stats_export`: Export stats JSON to disk.
- `doctor`: Run runtime and safety diagnostics.

All tools accept optional `max_output_tokens`.

## Shell Runtime Resolution

`execute({ language: "shell" })` uses `shell_runtime: "auto"` by default.

Auto order by platform:

- Windows: `powershell -> cmd -> git-bash -> bash -> sh`
- macOS: `zsh -> bash -> sh -> powershell`
- Linux: `bash -> sh -> zsh -> powershell`

You can override with `shell_runtime`:

- `auto`
- `powershell`
- `cmd`
- `git-bash`
- `bash`
- `zsh`
- `sh`

## Environment Variables

| Variable | Default | Notes |
|---|---|---|
| `CMU_MAX_OUTPUT_BYTES` | `8192` | Target max compressed output bytes |
| `CMU_TIMEOUT_MS` | `30000` | Sandbox timeout |
| `CMU_MEMORY_MB` | `256` | Node runtime memory hint |
| `CMU_MAX_FILE_BYTES` | `1048576` | Max size for `execute_file` / `proxy(read_file)` |
| `CMU_ALLOW_AUTH_PASSTHROUGH` | `false` | Pass host auth env vars into subprocess |
| `CMU_SHELL` | `auto` | `auto`, `powershell`, `cmd`, `git-bash`, `bash`, `zsh`, `sh` |
| `CMU_POLICY_MODE` | `strict` | `strict`, `balanced`, `permissive` |
| `CMU_ALLOW_PRIVATE_NETWORK_FETCH` | `false` | Allow localhost/private network fetches |
| `CMU_DB_PATH` | OS temp path | SQLite DB path |
| `CMU_SEARCH_TOP_K` | `5` | Default search results |
| `CMU_MAX_FETCH_BYTES` | `5242880` | Max bytes for `fetch_and_index` |
| `CMU_STATS_EXPORT_PATH` | unset | Default `stats_export` output path override |
| `CMU_STATS_MAX_EVENTS` | `1000` | Max retained in-memory optimization events |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

## Security Model

- Default mode: `strict`
- `strict`: blocks destructive commands and download-execute chains.
- `balanced`: blocks high-risk commands and marks destructive commands as `ask`.
- `permissive`: disables command deny rules but still protects sensitive file paths.
- Sensitive file rules (for example `.env`, private keys) are always enforced.
- Private-network URL fetches are blocked by default.

## Breaking Migration (from `windows-context-mode`)

This release is an immediate-break rename with no alias wrapper.

### 1) Package/CLI rename

- `npx -y windows-context-mode ...` -> `npx -y context-mode-universal ...`
- `codex mcp add context-mode -- npx -y windows-context-mode` -> `codex mcp add context-mode -- npx -y context-mode-universal`

### 2) Environment variable prefix rename

All `WCM_*` variables are now `CMU_*`.

Examples:

- `WCM_TIMEOUT_MS` -> `CMU_TIMEOUT_MS`
- `WCM_SHELL` -> `CMU_SHELL`
- `WCM_POLICY_MODE` -> `CMU_POLICY_MODE`

### 3) MCP config rename

Update package references in MCP configs:

```json
{
  "mcpServers": {
    "context-mode": {
      "command": "npx",
      "args": ["-y", "context-mode-universal"]
    }
  }
}
```

### 4) Migration checklist

- Remove old `windows-context-mode` server entries from MCP config.
- Add/update `context-mode-universal` entries.
- Rename `WCM_*` env vars to `CMU_*`.
- Re-run `npm run doctor` and verify resolved shell + policy mode.

## Development

```bash
npm install
npm run build
npm test
npm run lint
npm run benchmark
```

Additional docs:

- [HOW_IT_WORKS.md](./HOW_IT_WORKS.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [BENCHMARK.md](./BENCHMARK.md)

## License

MIT
