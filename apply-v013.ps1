$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $project

node ".\scripts\apply-v013-deep-time.mjs"

Write-Host ""
Write-Host "v0.13 Deep Time Foundation applied."
Write-Host "Run npm run typecheck, npm test and npm run build."
