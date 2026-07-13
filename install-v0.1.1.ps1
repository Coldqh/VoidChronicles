param(
  [string]$ProjectPath = "C:\VoidChronicles",
  [switch]$SkipPush
)

$ErrorActionPreference = "Stop"
$PatchRoot = Join-Path $PSScriptRoot "patch"

if (-not (Test-Path $PatchRoot)) {
  throw "Папка patch не найдена рядом с установщиком."
}
if (-not (Test-Path $ProjectPath)) {
  throw "Проект не найден: $ProjectPath"
}
if (-not (Test-Path (Join-Path $ProjectPath ".git"))) {
  throw "В $ProjectPath нет Git-репозитория."
}

Write-Host "[1/7] Копирование v0.1.1 в $ProjectPath" -ForegroundColor Cyan
$relativeFiles = @()
Get-ChildItem $PatchRoot -File -Recurse | ForEach-Object {
  $relative = $_.FullName.Substring($PatchRoot.Length).TrimStart('\', '/')
  $destination = Join-Path $ProjectPath $relative
  $destinationDirectory = Split-Path $destination -Parent
  New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
  Copy-Item $_.FullName $destination -Force
  $relativeFiles += $relative.Replace('\', '/')
}

Set-Location $ProjectPath

Write-Host "[2/7] Проверка публичного npm registry" -ForegroundColor Cyan
npm config set registry https://registry.npmjs.org/
$badRegistry = Select-String -Path package-lock.json -Pattern "applied-caas-gateway|internal.api.openai" -Quiet
if ($badRegistry) {
  throw "package-lock.json всё ещё содержит внутренний registry."
}

Write-Host "[3/7] Чистая установка зависимостей" -ForegroundColor Cyan
npm ci --no-audit --no-fund

Write-Host "[4/7] TypeScript" -ForegroundColor Cyan
npm run typecheck

Write-Host "[5/7] Тесты" -ForegroundColor Cyan
npm test

Write-Host "[6/7] Production build" -ForegroundColor Cyan
npm run build

Write-Host "[7/7] Commit и push" -ForegroundColor Cyan
git add -- $relativeFiles
$staged = git diff --cached --name-only
if ($staged) {
  git commit -m "fix: v0.1.1 stability and save integrity"
} else {
  Write-Host "Изменений для commit нет — патч уже применён." -ForegroundColor Yellow
}

if (-not $SkipPush) {
  git push origin main
} else {
  Write-Host "Push пропущен параметром -SkipPush." -ForegroundColor Yellow
}

Write-Host "v0.1.1 установлен. Открой GitHub Actions и дождись зелёной сборки." -ForegroundColor Green
