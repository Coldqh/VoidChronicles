VOID CHRONICLES — CI/PAGES HOTFIX

1. Extract this archive into C:\VoidChronicles with replacement enabled.
2. Run PowerShell in C:\VoidChronicles.
3. If GitHub CLI is installed and authenticated:
   powershell -ExecutionPolicy Bypass -File .\apply-pages-hotfix.ps1

Without GitHub CLI, first open:
https://github.com/Coldqh/VoidChronicles/settings/pages
Set Build and deployment -> Source -> GitHub Actions.
Then run the same PowerShell script.
