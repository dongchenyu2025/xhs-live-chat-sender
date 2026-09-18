param([switch]$ValidateOnly)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

function Test-NodeReady {
  $node = Get-Command node -ErrorAction SilentlyContinue
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $node -or -not $npm) { return $false }
  & node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)'
  return $LASTEXITCODE -eq 0
}

if (-not (Test-NodeReady)) {
  if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    throw "WinGet is required to install Node.js automatically. Install or update Microsoft App Installer, then run this script again."
  }
  Write-Host "Installing Node.js LTS with WinGet..."
  & winget.exe install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw "WinGet failed to install Node.js LTS (exit $LASTEXITCODE)." }
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}

if (-not (Test-NodeReady)) { throw "Node.js 18+ and npm are still unavailable after installation." }
if ($ValidateOnly) {
  Write-Host "Windows setup validation passed."
  exit 0
}
& npm.cmd ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw "npm dependency installation failed (exit $LASTEXITCODE)." }

if (-not (Test-Path "xhs_config.json")) {
  Copy-Item "xhs_config.example.json" "xhs_config.json"
}

& node check_config.js
if ($LASTEXITCODE -ne 0) { throw "Configuration validation failed." }
& node xhs_daemon.js start --immediate
if ($LASTEXITCODE -ne 0) { throw "Sender startup failed." }
Write-Host "Setup complete. Keep the independent Chrome window open and scan to log in if prompted."
