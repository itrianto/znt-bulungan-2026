# ============================================================
# scripts/sync-data.ps1 - Sinkronisasi Data Zona & Sebaran Titik
# Sekali klik/run untuk menyelaraskan data lokal ke publik web (docs/)
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SINKRONISASI DATA ZNT BULUNGAN" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Sinkronisasi Master Zona
$zonaSrc = if (Test-Path "data\geojson\zona\Master_Zona.geojson") { "data\geojson\zona\Master_Zona.geojson" } else { "data\geojson\Master_Zona.geojson" }
$zonaDest = "docs\public-data\Master_Zona.geojson"

if (Test-Path $zonaSrc) {
    Copy-Item $zonaSrc $zonaDest -Force
    $sizeMB = [math]::Round((Get-Item $zonaDest).Length / 1MB, 2)
    Write-Host "[OK] Master_Zona disalin ke $zonaDest ($sizeMB MB)" -ForegroundColor Green
} else {
    Write-Warning "File Master_Zona.geojson tidak ditemukan di data\geojson\zona\!"
}

# 2. Update Surveyor Mapping
Write-Host "`n[..] Memperbarui pemetaan surveyor..." -ForegroundColor Yellow
& "$PSScriptRoot\generate-surveyor-mapping.ps1"

# 3. Sinkronisasi Sebaran Titik
Write-Host "`n[..] Menyinkronkan file sebaran titik..." -ForegroundColor Yellow
$titikDirSrc = "data\geojson\sebaran_titik"
$titikDirDest = "docs\public-data\sebaran_titik"

if (-not (Test-Path $titikDirDest)) {
    New-Item -ItemType Directory -Path $titikDirDest -Force | Out-Null
}

$csvFiles = Get-ChildItem -Path $titikDirSrc -Filter "*.csv" -ErrorAction SilentlyContinue
if ($csvFiles) {
    foreach ($f in $csvFiles) {
        Copy-Item $f.FullName "$titikDirDest\$($f.Name)" -Force
        $lines = (Get-Content $f.FullName).Count - 1
        Write-Host "  + $($f.Name): $lines titik disinkronkan" -ForegroundColor Green
    }
} else {
    Write-Warning "Tidak ada file CSV ditemukan di $titikDirSrc"
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  SINKRONISASI SELESAI DENGAN SUKSES!  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
