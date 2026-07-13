# Void Chronicles v0.2 — Deep Discovery

Запуск из PowerShell:

```powershell
cd C:\VoidChronicles-v0.2-Patch
powershell -ExecutionPolicy Bypass -File .\install-v0.2.ps1
```

Установщик сам выполняет:

1. `cd C:\VoidChronicles`
2. `git pull --ff-only origin main`
3. копирование файлов из отдельной папки `files`
4. проверку публичного npm registry
5. `npm ci`
6. `npm run check`
7. `git commit -m "feat: v0.2 Deep Discovery"`
8. `git push origin main`
