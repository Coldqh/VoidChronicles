$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $project

node ".\scripts\apply-v014-deep-history.mjs"

Write-Host ""
Write-Host "v0.14 Deep History Generator applied."
Write-Host "Run npm run typecheck, npm test and npm run build."
