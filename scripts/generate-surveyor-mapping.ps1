# Generate surveyor-zone mapping JSON
$masterPath = if (Test-Path "data\geojson\zona\Master_Zona.geojson") { "data\geojson\zona\Master_Zona.geojson" } else { "data\geojson\Master_Zona.geojson" }
$outputPath = "docs\public-data\surveyor-zones.json"

Write-Host "Loading Master_Zona.geojson..."
$master = Get-Content $masterPath -Raw | ConvertFrom-Json

Write-Host "Generating surveyor-zone mapping..."
$surveyorData = @{}

foreach ($feature in $master.features) {
    $surveyor = if ($feature.properties.Surveyor) { $feature.properties.Surveyor } else { $feature.properties.SURVEYOR }
    $zoneId = if ($feature.properties.Zona_ID) { $feature.properties.Zona_ID } else { $feature.properties.ID_ZONA }
    
    if (-not $surveyorData.ContainsKey($surveyor)) {
        $surveyorData[$surveyor] = @{
            displayName = $surveyor
            zones = @()
            zoneCount = 0
        }
    }
    
    $surveyorData[$surveyor].zones += $zoneId
    $surveyorData[$surveyor].zoneCount++
}

# Convert to array and sort by zone count
$surveyorArray = $surveyorData.Values | Sort-Object -Property zoneCount -Descending

$output = @{
    generatedAt = (Get-Date -Format "o")
    totalSurveyors = $surveyorArray.Count
    totalZones = $master.features.Count
    surveyors = $surveyorArray
}

Write-Host "Saving to $outputPath..."
$output | ConvertTo-Json -Depth 10 | Set-Content $outputPath -Encoding UTF8

$size = (Get-Item $outputPath).Length
Write-Host "Generated: $([math]::Round($size/1KB, 2)) KB"
Write-Host "Surveyors: $($surveyorArray.Count)"
foreach ($s in $surveyorArray) {
    Write-Host "  - $($s.displayName): $($s.zoneCount) zona"
}
Write-Host "Done!"
