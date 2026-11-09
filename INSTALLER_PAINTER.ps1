param([Parameter(Mandatory=$true)][string]$PluginsDirectory)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$directory=(Resolve-Path -LiteralPath $PluginsDirectory).Path
if((Split-Path $directory -Leaf) -ne 'plugins'){throw 'Sélectionne le dossier plugins ouvert par Python > Plugins Folder dans Painter.'}
$destination=Join-Path $directory 'texture3d_painter'
if(Test-Path -LiteralPath $destination){
    $backup=$destination+'.backup-'+[guid]::NewGuid().ToString('N')
    Copy-Item -LiteralPath $destination -Destination $backup -Recurse
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item -Path (Join-Path $root 'painter_plugin\texture3d_painter\*.py') -Destination $destination -Force
$location=@{directory=$root}|ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $destination 'tool-location.json'),$location,(New-Object Text.UTF8Encoding($false)))
Write-Output 'Plugin copié. Dans Painter : Python > texture3d_painter. Le dossier Texture3D doit rester à son emplacement.'
