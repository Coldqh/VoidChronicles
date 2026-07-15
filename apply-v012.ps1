$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
node .\scripts\apply-v012-snapshot-schema.mjs
Write-Host 'v0.12 integration applied. Run npm run typecheck, npm test and npm run build.' -ForegroundColor Green
