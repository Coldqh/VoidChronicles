$ErrorActionPreference = 'Stop'

$Project = 'C:\VoidChronicles'
$Files = Join-Path $PSScriptRoot 'files'

if (-not (Test-Path $Project)) {
    throw "Папка проекта не найдена: $Project"
}
if (-not (Test-Path (Join-Path $Project '.git'))) {
    throw "В $Project нет git-репозитория"
}
if (-not (Test-Path $Files)) {
    throw "Папка патча files не найдена: $Files"
}

Write-Host '=== Void Chronicles v0.2 Deep Discovery ===' -ForegroundColor Cyan
Write-Host "Патч: $Files"
Write-Host "Проект: $Project"

Set-Location $Project
Write-Host "`n[1/8] cd C:\VoidChronicles" -ForegroundColor Yellow

Write-Host '[2/8] Проверка текущей ветки и обновление main' -ForegroundColor Yellow
$branch = git branch --show-current
if ($branch -ne 'main') {
    git switch main
}
git pull --ff-only origin main

Write-Host '[3/8] Копирование файлов патча' -ForegroundColor Yellow
Copy-Item (Join-Path $Files '*') $Project -Recurse -Force

Write-Host '[4/8] Проверка npm registry и lock-файла' -ForegroundColor Yellow
$lock = Get-Content (Join-Path $Project 'package-lock.json') -Raw
if ($lock -match 'internal\.api\.openai|applied-caas') {
    throw 'В package-lock.json остались внутренние registry URL. Установка остановлена.'
}
Set-Content (Join-Path $Project '.npmrc') "registry=https://registry.npmjs.org/`nfund=false`naudit=false`n"

Write-Host '[5/8] Чистая установка зависимостей: npm ci' -ForegroundColor Yellow
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci завершился с ошибкой' }

Write-Host '[6/8] TypeScript, 14 тестов и production/PWA build' -ForegroundColor Yellow
npm run check
if ($LASTEXITCODE -ne 0) { throw 'npm run check завершился с ошибкой' }

Write-Host '[7/8] Git commit' -ForegroundColor Yellow
git add .
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git commit -m "feat: v0.2 Deep Discovery"
    if ($LASTEXITCODE -ne 0) { throw 'git commit завершился с ошибкой' }
} else {
    Write-Host 'Изменений для коммита нет.' -ForegroundColor DarkYellow
}

Write-Host '[8/8] Push origin main' -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'git push завершился с ошибкой' }

Write-Host "`nГОТОВО: v0.2 отправлена в origin/main" -ForegroundColor Green
Write-Host 'Проверка: https://github.com/Coldqh/VoidChronicles/actions'
Write-Host 'Игра: https://coldqh.github.io/VoidChronicles/'
