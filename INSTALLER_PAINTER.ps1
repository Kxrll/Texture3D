param(
    [string]$PluginsDirectory,
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

if (!$PluginsDirectory) {
    $documents = [Environment]::GetFolderPath('MyDocuments')
    if (!$documents) { throw 'Le dossier Documents du compte Windows est introuvable.' }

    $profile = Join-Path $documents 'Adobe\Adobe Substance 3D Painter'
    $exe = Join-Path $env:ProgramFiles 'Adobe\Adobe Substance 3D Painter\Adobe Substance 3D Painter.exe'
    if (!$Remove -and !(Test-Path -LiteralPath $profile -PathType Container) -and !(Test-Path -LiteralPath $exe -PathType Leaf)) {
        return
    }
    $PluginsDirectory = Join-Path $profile 'python\plugins'
} else {
    $PluginsDirectory = (Resolve-Path -LiteralPath $PluginsDirectory).Path
    if ((Split-Path $PluginsDirectory -Leaf) -ne 'plugins' -or (Split-Path (Split-Path $PluginsDirectory -Parent) -Leaf) -ne 'python') {
        throw 'Sélectionne le dossier python\plugins ouvert par Python > Plugins Folder dans Painter.'
    }
}

$plugin = Join-Path $PluginsDirectory 'texture3d_painter'
$config = Join-Path $plugin 'tool-location.json'
$startup = Join-Path (Split-Path $PluginsDirectory -Parent) 'startup'
$loader = Join-Path $startup 'texture3d_autostart.py'
$loaderSource = Join-Path $root 'painter_plugin\texture3d_autostart.py'
$files = @(Get-ChildItem -LiteralPath (Join-Path $root 'painter_plugin\texture3d_painter') -File -Filter '*.py')

if ($Remove) {
    if (!(Test-Path -LiteralPath $config -PathType Leaf)) { return }
    $location = Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
    if ($location.directory -ne $root) { return }
    if ((Test-Path -LiteralPath $loader -PathType Leaf) -and
        (Get-FileHash -LiteralPath $loader).Hash -eq (Get-FileHash -LiteralPath $loaderSource).Hash) {
        Remove-Item -LiteralPath $loader
    }
    foreach ($file in $files) {
        $installed = Join-Path $plugin $file.Name
        if ((Test-Path -LiteralPath $installed -PathType Leaf) -and
            (Get-FileHash -LiteralPath $installed).Hash -eq (Get-FileHash -LiteralPath $file.FullName).Hash) {
            Remove-Item -LiteralPath $installed
        }
    }
    Remove-Item -LiteralPath $config
    return
}

if (!$files.Count -or !(Test-Path -LiteralPath $loaderSource -PathType Leaf)) {
    throw 'Les fichiers du plugin Painter sont incomplets.'
}
New-Item -ItemType Directory -Path $plugin,$startup -Force | Out-Null
$targets = @($files | ForEach-Object { Join-Path $plugin $_.Name }) + @($config, $loader)
$backup = Join-Path (Split-Path $PluginsDirectory -Parent) ('Texture3D-backups\'+[guid]::NewGuid().ToString('N'))
$saved = @{}
foreach ($file in $targets) {
    if (Test-Path -LiteralPath $file -PathType Leaf) {
        New-Item -ItemType Directory -Path $backup -Force | Out-Null
        $copy = Join-Path $backup (Split-Path $file -Leaf)
        Copy-Item -LiteralPath $file -Destination $copy
        $saved[$file] = $copy
    }
}

try {
    foreach ($file in $files) { Copy-Item -LiteralPath $file.FullName -Destination $plugin -Force }
    $location = @{directory=$root} | ConvertTo-Json
    [IO.File]::WriteAllText($config, $location, (New-Object Text.UTF8Encoding($false)))
    Copy-Item -LiteralPath $loaderSource -Destination $loader -Force
} catch {
    foreach ($file in $targets) {
        if ($saved.ContainsKey($file)) {
            Copy-Item -LiteralPath $saved[$file] -Destination $file -Force
        } elseif (Test-Path -LiteralPath $file -PathType Leaf) {
            Remove-Item -LiteralPath $file -Force
        }
    }
    throw
}

Write-Output 'Plugin Substance Painter prêt. Il se chargera à la prochaine ouverture de Painter.'
