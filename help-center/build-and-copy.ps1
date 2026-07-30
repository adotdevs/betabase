$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Rebranding and copying help center to FE/public/help/..."
node (Join-Path $Root "rebrand-and-copy.js")
