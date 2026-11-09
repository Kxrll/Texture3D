param([Parameter(Mandatory=$true)][string]$ProjectDirectory, [Parameter(Mandatory=$true)][string]$ToolDirectory, [switch]$Resume)
$ErrorActionPreference = 'Stop'
try {
    $projectPath = (Resolve-Path -LiteralPath $ProjectDirectory).Path
    $metadata = Get-Content -LiteralPath (Join-Path $projectPath 'texture3d-project.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $template = Get-Content -LiteralPath (Join-Path $ToolDirectory 'prepare-photoshop-project.jsx') -Raw -Encoding UTF8
    $photoshopApp = New-Object -ComObject Photoshop.Application
    $photoshopApp.Visible = $true
    $sets = if ($metadata.schema -eq 3) { @($metadata.texture_sets) } else { @($metadata) }
    foreach ($set in $sets) {
        $psdPath = if ($set.document_path) { $set.document_path } else { Join-Path $projectPath $set.document }
        $textureName = if ($set.texture) { $set.texture } else { 'Couleur.png' }
        $uvName = if ($set.uv) { $set.uv } else { 'Reperes_UV.png' }
        $regions = if ($metadata.schema -eq 3) { $null } else { $metadata.material_regions }
        $payload = @{psd=$psdPath;texture=(Join-Path $projectPath $textureName);uv=(Join-Path $projectPath $uvName);resume=[bool]$Resume;regions=$regions;painter=($metadata.source -eq 'painter')} | ConvertTo-Json -Depth 12 -Compress
        $script = $template.Replace('__PROJECT_JSON__', $payload)
        $photoshopApp.DoJavaScript($script)
    }
    exit 0
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
