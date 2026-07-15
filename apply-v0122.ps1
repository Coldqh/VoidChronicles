$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $MyInvocation.MyCommand.Path

Set-Location $project
node ".\scripts\apply-v0122-persistence-integrity.mjs"

Write-Host ""
Write-Host "v0.12.2 applied. Run:"
Write-Host "npm run typecheck"
Write-Host "npm test"
Write-Host "npm run build"
