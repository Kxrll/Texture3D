param([Parameter(Mandatory=$true)][string]$ProjectDirectory, [Parameter(Mandatory=$true)][string]$ToolDirectory, [switch]$Resume)
$ErrorActionPreference = 'Stop'
try {
    $projectPath = (Resolve-Path -LiteralPath $ProjectDirectory).Path
    $metadata = Get-Content -LiteralPath (Join-Path $projectPath 'texture3d-project.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $psdPath = if ($metadata.document_path) { $metadata.document_path } else { Join-Path $projectPath $metadata.document }
    $basePath = Join-Path $projectPath 'Couleur.png'
    $uvPath = Join-Path $projectPath 'Reperes_UV.png'
    $template = Get-Content -LiteralPath (Join-Path $ToolDirectory 'prepare-photoshop-project.jsx') -Raw -Encoding UTF8
    $payload = @{psd=$psdPath;texture=$basePath;uv=$uvPath;resume=[bool]$Resume;regions=$metadata.material_regions} | ConvertTo-Json -Depth 12 -Compress
    $script = $template.Replace('__PROJECT_JSON__', $payload)
    $photoshopApp = New-Object -ComObject Photoshop.Application
    $photoshopApp.Visible = $true
    $photoshopApp.DoJavaScript($script)
    exit 0
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
