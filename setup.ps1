param(
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$SkipTests,
  [switch]$SkipDoctor,
  [switch]$SkipCursor,
  [switch]$SkipCodex
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [string]$Title,
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  & $Action
}

function Assert-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

function Ensure-CodexConfigEntry {
  param([string]$ProjectRoot)

  $codexDir = Join-Path $env:USERPROFILE ".codex"
  $configPath = Join-Path $codexDir "config.toml"
  $blockHeader = "[mcp_servers.context-mode]"
  $block = @"
[mcp_servers.context-mode]
command = "npx"
args = ["-y", "context-mode-universal"]
"@

  if (-not (Test-Path $codexDir)) {
    New-Item -ItemType Directory -Path $codexDir | Out-Null
  }

  if (-not (Test-Path $configPath)) {
    Set-Content -Path $configPath -Value $block
    Write-Host "Wrote Codex MCP config to: $configPath" -ForegroundColor Yellow
    return
  }

  $existing = Get-Content -Raw $configPath
  if ($existing -match [regex]::Escape($blockHeader)) {
    Write-Host "Codex MCP config already contains context-mode entry." -ForegroundColor Yellow
    return
  }

  Add-Content -Path $configPath -Value "`r`n$block"
  Write-Host "Appended context-mode MCP config to: $configPath" -ForegroundColor Yellow
}

Write-Host "Context Mode Universal setup started." -ForegroundColor Green
Write-Host "Project: $PSScriptRoot"

Push-Location $PSScriptRoot
try {
  Assert-Command "node"
  Assert-Command "npm"

  if (-not $SkipInstall) {
    Invoke-Step "Installing npm dependencies" { npm install }
  }

  if (-not $SkipBuild) {
    Invoke-Step "Building TypeScript" { npm run build }
  }

  if (-not $SkipTests) {
    Invoke-Step "Running test suite" { npm test }
  }

  if (-not $SkipDoctor) {
    Invoke-Step "Running diagnostics" { npm run doctor }
  }

  if (-not $SkipCursor) {
    Invoke-Step "Setting up Cursor files" { npx -y context-mode-universal setup cursor }
  }

  if (-not $SkipCodex) {
    Invoke-Step "Configuring Codex MCP server" {
      if (Get-Command codex -ErrorAction SilentlyContinue) {
        codex mcp add context-mode -- npx -y context-mode-universal
        codex mcp list
      } else {
        Write-Host "Codex CLI not found. Falling back to ~/.codex/config.toml update." -ForegroundColor Yellow
        Ensure-CodexConfigEntry -ProjectRoot $PSScriptRoot
        Write-Host "Restart VS Code Codex extension to pick up MCP config." -ForegroundColor Yellow
      }
    }
  }

  Write-Host ""
  Write-Host "Setup complete." -ForegroundColor Green
  Write-Host "Recommended checks:"
  Write-Host "  npm run doctor"
  Write-Host "  codex mcp list"
} finally {
  Pop-Location
}
