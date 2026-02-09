param(
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"

Write-Host "Building Canvas Downloader .exe with $Python"

& $Python -m pip install --upgrade pip | Out-Host
& $Python -m pip install pyinstaller python-dotenv requests matplotlib | Out-Host

if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
if (Test-Path "build") { Remove-Item -Recurse -Force "build" }
if (Test-Path "canvas-downloader.spec") { Remove-Item -Force "canvas-downloader.spec" }

& $Python -m PyInstaller `
    --onefile `
    --windowed `
    --name "canvas-downloader" `
    --add-data "canvas_downloader/assets;canvas_downloader/assets" `
    "main.py" | Out-Host

$zipName = "canvas-downloader-windows.zip"
if (Test-Path $zipName) { Remove-Item -Force $zipName }

Compress-Archive -Path "dist/canvas-downloader.exe", ".env.example" -DestinationPath $zipName

Write-Host "Build complete: $zipName"
