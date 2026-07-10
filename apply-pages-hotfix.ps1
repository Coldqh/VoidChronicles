$ErrorActionPreference = 'Stop'
$RepoPath = 'C:\VoidChronicles'
$RepoSlug = 'Coldqh/VoidChronicles'

Set-Location $RepoPath

Write-Host '== Checking npm registry ==' -ForegroundColor Cyan
$badRegistry = Select-String -Path 'package-lock.json' -Pattern 'applied-caas-gateway|internal\.api\.openai' -Quiet
if ($badRegistry) {
    Write-Host 'Internal registry found. Regenerating package-lock.json...' -ForegroundColor Yellow
    Remove-Item 'package-lock.json' -Force
    Remove-Item 'node_modules' -Recurse -Force -ErrorAction SilentlyContinue
    npm install --package-lock-only --no-audit --no-fund
}

Write-Host '== Enabling GitHub Pages ==' -ForegroundColor Cyan
if (Get-Command gh -ErrorAction SilentlyContinue) {
    gh auth status | Out-Host
    gh api "repos/$RepoSlug/pages" *> $null
    if ($LASTEXITCODE -eq 0) {
        gh api --method PUT "repos/$RepoSlug/pages" -f build_type=workflow | Out-Null
    } else {
        gh api --method POST "repos/$RepoSlug/pages" -f build_type=workflow | Out-Null
    }
    Write-Host 'GitHub Pages is configured for GitHub Actions.' -ForegroundColor Green
} else {
    Write-Host 'GitHub CLI is not installed.' -ForegroundColor Yellow
    Write-Host 'Open Settings -> Pages and set Source to GitHub Actions, then rerun this script.' -ForegroundColor Yellow
    Start-Process "https://github.com/$RepoSlug/settings/pages"
    exit 1
}

Write-Host '== Clean verification ==' -ForegroundColor Cyan
Remove-Item 'node_modules' -Recurse -Force -ErrorAction SilentlyContinue
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run build

if (-not (Test-Path 'dist/index.html')) { throw 'dist/index.html was not created' }
if (-not (Test-Path 'dist/manifest.webmanifest')) { throw 'PWA manifest was not created' }
if (-not (Test-Path 'dist/sw.js')) { throw 'Service worker was not created' }

Copy-Item 'dist/index.html' 'dist/404.html' -Force

Write-Host '== Commit and push ==' -ForegroundColor Cyan
git add .github/workflows/deploy.yml .npmrc .nvmrc package.json package-lock.json vite.config.ts

git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git commit -m 'fix: harden CI and GitHub Pages deployment'
}

git push
Write-Host 'Hotfix pushed. GitHub Actions should now build and deploy the site.' -ForegroundColor Green
