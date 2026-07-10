$ErrorActionPreference = "Stop"
$project = "C:\VoidChronicles"
$patch = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path "$project\package.json")) {
  throw "Проект не найден в $project"
}

Copy-Item "$patch\src\App.tsx" "$project\src\App.tsx" -Force
Copy-Item "$patch\src\main.tsx" "$project\src\main.tsx" -Force
Copy-Item "$patch\src\components\*" "$project\src\components\" -Force
Copy-Item "$patch\src\game\store.ts" "$project\src\game\store.ts" -Force
Copy-Item "$patch\src\persistence\*" "$project\src\persistence\" -Force
Copy-Item "$patch\src\tests\snapshot.test.ts" "$project\src\tests\snapshot.test.ts" -Force
Copy-Item "$patch\src\styles-app.css" "$project\src\styles\app.css" -Force
Copy-Item "$patch\vite.config.ts" "$project\vite.config.ts" -Force

Set-Location $project
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run build

git add src vite.config.ts
git commit -m "fix: stabilize startup saves and runtime"
git push origin main

Write-Host "Runtime hotfix applied and pushed." -ForegroundColor Green
