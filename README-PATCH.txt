VOID CHRONICLES v0.1.1 — STABILITY & SAVE INTEGRITY

1. Распакуйте этот архив в отдельную папку.
2. Откройте PowerShell в распакованной папке.
3. Выполните:

powershell -ExecutionPolicy Bypass -File .\install-v0.1.1.ps1

По умолчанию проект находится в C:\VoidChronicles.
Другой путь:

powershell -ExecutionPolicy Bypass -File .\install-v0.1.1.ps1 -ProjectPath "D:\Games\VoidChronicles"

Скрипт сам копирует файлы, выполняет npm ci, typecheck, 9 тестов, production build, commit и git push origin main.
