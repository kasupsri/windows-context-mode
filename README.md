# windows-context-mode

`windows-context-mode` is a Windows-first MCP server for safe command execution, output compression, and searchable context retrieval.

## Why This Project Is Windows-First

Most context-management MCP servers are Linux-first. This project is built for Windows developer workflows:

- PowerShell is the default shell runtime (`pwsh` or `powershell`).
- Fallback order for shell commands is `PowerShell -> cmd -> Git Bash`.
- Security rules are tuned for risky Windows command patterns.
- Setup scripts and examples target Cursor and Codex on Windows.

## What It Provides

- Sandboxed execution with strict policy checks before runtime invocation.
- Algorithmic output compression (no LLM/API dependency inside compression).
- Local BM25 knowledge base indexing and search.
- Stats telemetry for bytes/tokens saved in the current session.
- Diagnostics (`doctor`) to validate runtime resolution and policy behavior.

## Requirements

- Windows 10/11 (primary target; non-Windows works best-effort)
- Node.js 18+
- `npm` / `npx`
- Optional: `codex` CLI if you want one-command Codex registration

## Installation

### Recommended: Run from source (local path)

```powershell
git clone https://github.com/kasupsri/windows-context-mode.git
cd windows-context-mode
npm install
npm run build
npm run doctor
```

Register the built server with your MCP client:

- command: `node` (or full path to `node.exe`)
- args: `["<absolute-path>\\dist\\index.js"]`

#### Cursor local-path example (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "context-mode": {
      "command": "node",
      "args": ["C:\\Work\\Kasup\\windows-context-mode\\dist\\index.js"]
    }
  }
}
```

#### Cursor merged example (with other MCP servers)

```json
{
  "mcpServers": {
    "MCP_DOCKER": {
      "command": "docker",
      "args": ["mcp", "gateway", "run"],
      "env": {
        "LOCALAPPDATA": "C:\\Users\\<you>\\AppData\\Local",
        "ProgramData": "C:\\ProgramData",
        "ProgramFiles": "C:\\Program Files"
      }
    },
    "context7": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "mcp/context7"]
    },
    "context-mode": {
      "command": "node",
      "args": ["C:\\Work\\Kasup\\windows-context-mode\\dist\\index.js"]
    }
  }
}
```

#### Codex local-path example (`%USERPROFILE%\\.codex\\config.toml`)

```toml
[mcp_servers.context-mode]
command = "C:\\Program Files\\nodejs\\node.exe"
args = ["C:\\Work\\Kasup\\windows-context-mode\\dist\\index.js"]
```

If `node` is already in PATH for your IDE, you can use:

```toml
[mcp_servers.context-mode]
command = "node"
args = ["C:\\Work\\Kasup\\windows-context-mode\\dist\\index.js"]
```

### Optional: Use npm package (if published)

```powershell
npx -y windows-context-mode setup cursor
codex mcp add context-mode -- npx -y windows-context-mode
codex mcp list
```

If `npx -y windows-context-mode` returns `npm ERR! 404 Not Found`, switch to the local-path setup above.

## One-Command Bootstrap (Windows)

`setup.ps1` installs dependencies, builds, tests, runs diagnostics, and sets up Cursor/Codex.

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

Optional flags:

- `-SkipInstall`
- `-SkipBuild`
- `-SkipTests`
- `-SkipDoctor`
- `-SkipCursor`
- `-SkipCodex`

If `codex` CLI is not installed, `setup.ps1` automatically falls back to `%USERPROFILE%\.codex\config.toml`.

## MCP Tools

- `execute`: Run code in a sandboxed subprocess with Windows-first shell resolution.
- `execute_file`: Analyze/process file content in a sandboxed JavaScript runtime.
- `compress`: Compress large text using content-aware strategies.
- `index`: Index markdown/text content into BM25 chunks.
- `search`: Search indexed content.
- `fetch_and_index`: Fetch a URL, convert to markdown/text, and index it.
- `proxy`: Proxy common tool-like actions, then compress output.
- `stats_get`: Show session compression savings.
- `stats_reset`: Reset in-memory session stats.
- `stats_export`: Export stats JSON (default `%TEMP%`).
- `doctor`: Run local diagnostics for runtime and safety checks.

## Environment Variables

| Variable | Default | Notes |
|---|---|---|
| `WCM_THRESHOLD_BYTES` | `5120` | Minimum output size before compression is applied |
| `WCM_MAX_OUTPUT_BYTES` | `8192` | Target max size of compressed output |
| `WCM_TIMEOUT_MS` | `30000` | Default sandbox timeout |
| `WCM_MEMORY_MB` | `256` | Max memory hint for Node runtime |
| `WCM_MAX_FILE_BYTES` | `1048576` | Max size for `execute_file` / `proxy(read_file)` |
| `WCM_ALLOW_AUTH_PASSTHROUGH` | `false` | Pass host auth tokens/credentials into subprocess env |
| `WCM_SHELL` | `powershell` | `powershell`, `cmd`, or `git-bash` |
| `WCM_POLICY_MODE` | `strict` | `strict`, `balanced`, `permissive` |
| `WCM_ALLOW_PRIVATE_NETWORK_FETCH` | `false` | Allow `fetch_and_index` to access localhost/private IPs |
| `WCM_DB_PATH` | OS temp path | SQLite DB path for indexed content |
| `WCM_SEARCH_TOP_K` | `5` | Default search result count |
| `WCM_MAX_FETCH_BYTES` | `5242880` | Max fetch size for `fetch_and_index` |
| `WCM_STATS_FOOTER` | `true` | Set to `false` to hide stats footer |
| `WCM_STATS_EXPORT_PATH` | unset | Default export path override |
| `WCM_STATS_MAX_EVENTS` | `1000` | Max in-memory compression events retained |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

## Security Model

- Default mode is `strict`.
- `strict` blocks destructive commands and script-download-execute chains.
- `balanced` allows more commands but prompts on risky destructive operations.
- `permissive` disables command deny rules but still protects sensitive file paths.
- Subprocess auth credential passthrough is **disabled by default** (`WCM_ALLOW_AUTH_PASSTHROUGH=false`).
- `fetch_and_index` blocks localhost/private-network targets by default to reduce SSRF risk.

Policy logic is implemented in `src/security/`.

## Development

```powershell
npm install
npm run build
npm test
npm run lint
npm run benchmark
```

Additional docs:

- [howitworks.md](./howitworks.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [BENCHMARK.md](./BENCHMARK.md)

## Credits

This project is a Windows-focused adaptation of [universal-context-mode](https://github.com/phanindra208/universal-context-mode) by [phanindra208](https://github.com/phanindra208).

Core concepts reused and adapted under the MIT License include:

- algorithmic compression strategy design
- local knowledge-base indexing/search architecture
- MCP-oriented tool composition patterns

Windows-specific runtime resolution, policy tuning, setup flow, and developer UX have been extended in this fork.

## License

MIT
