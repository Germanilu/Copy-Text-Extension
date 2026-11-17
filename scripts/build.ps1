# Builds the Chrome Web Store zip with ONLY the extension files.
# Usage (from repo root):  powershell -ExecutionPolicy Bypass -File scripts/build.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$version = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
$include = @("manifest.json", "background.js", "icons", "ui", "ai", "clean", "popup", "panel")

# Safety net: never ship a developer API key.
$leak = Get-ChildItem -Recurse -File $include | Select-String -Pattern "gsk_|AIza[0-9A-Za-z_-]{20}|sk-[A-Za-z0-9]{20}" -List
if ($leak) { throw "Possible API key found in: $($leak.Path -join ', ')" }

$stage = Join-Path $root "dist/stage"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null
foreach ($item in $include) { Copy-Item -Recurse $item $stage }

$zip = Join-Path $root "dist/cleanwrite-$version.zip"
if (Test-Path $zip) { Remove-Item -Force $zip }
# tar (bundled with Windows 10+) writes forward-slash paths; Compress-Archive on PS 5.1 writes backslashes.
Push-Location $stage
& (Join-Path $env:SystemRoot "System32/tar.exe") -a -c -f $zip *
$tarExit = $LASTEXITCODE
Pop-Location
if ($tarExit -ne 0) { throw "tar failed with exit code $tarExit" }
Remove-Item -Recurse -Force $stage

Write-Host "Built $zip"
