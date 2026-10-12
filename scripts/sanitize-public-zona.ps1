param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

# Jalankan hanya setelah pemilik data menyetujui geometri untuk publikasi.
$source = Get-Content -Raw -LiteralPath $InputPath | ConvertFrom-Json
if ($source.type -ne 'FeatureCollection' -or -not $source.features) {
  throw 'Input harus berupa GeoJSON FeatureCollection.'
}

$ids = @($source.features | ForEach-Object { $_.properties.ID_ZONA })
if ($ids.Count -ne @($ids | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique).Count) {
  throw 'ID_ZONA kosong atau duplikat; output publik tidak dibuat.'
}

$public = [ordered]@{
  type = 'FeatureCollection'
  features = @($source.features | ForEach-Object {
    [ordered]@{
      type = 'Feature'
      properties = [ordered]@{ ID_ZONA = $_.properties.ID_ZONA }
      geometry = $_.geometry
    }
  })
}

$public | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $OutputPath -Encoding utf8
Write-Output "GeoJSON publik tersanitasi dibuat: $OutputPath"
