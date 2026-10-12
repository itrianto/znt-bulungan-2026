# Add Surveyor field to public GeoJSON
$masterPath = "data\geojson\Master_Zona.geojson"
$publicPath = "docs\public-data\public-zona.geojson"
$outputPath = "docs\public-data\public-zona-new.geojson"

Write-Host "Loading Master_Zona.geojson..."
$master = Get-Content $masterPath -Raw | ConvertFrom-Json

Write-Host "Loading public-zona.geojson..."
$public = Get-Content $publicPath -Raw | ConvertFrom-Json

Write-Host "Mapping surveyor data..."
$surveyorMap = @{}
foreach ($feature in $master.features) {
    $zoneId = $feature.properties.ID_ZONA
    $surveyor = $feature.properties.Surveyor
    $surveyorMap[$zoneId] = $surveyor
}

Write-Host "Adding Surveyor field to public GeoJSON..."
$added = 0
foreach ($feature in $public.features) {
    $zoneId = $feature.properties.ID_ZONA
    if ($surveyorMap.ContainsKey($zoneId)) {
        $feature.properties | Add-Member -NotePropertyName "SURVEYOR" -NotePropertyValue $surveyorMap[$zoneId] -Force
        $added++
    } else {
        Write-Warning "Zone $zoneId not found in master"
    }
}

Write-Host "Added SURVEYOR field to $added zones"

Write-Host "Saving to $outputPath..."
$public | ConvertTo-Json -Depth 100 -Compress | Set-Content $outputPath -Encoding UTF8

$oldSize = (Get-Item $publicPath).Length
$newSize = (Get-Item $outputPath).Length
Write-Host "Old size: $([math]::Round($oldSize/1MB, 2)) MB"
Write-Host "New size: $([math]::Round($newSize/1MB, 2)) MB"
Write-Host "Done!"
