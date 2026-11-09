# Package a local UXP prototype with the service's local configuration.
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
if(!(Test-Path -LiteralPath (Join-Path $root 'companion-config.json'))){
    throw 'Lance node init-config.cjs avant de construire le prototype.'
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$distribution=Join-Path $root 'distribution'
New-Item -ItemType Directory -Path $distribution -Force | Out-Null
$output=Join-Path $distribution 'Texture3D-Painter-prototype.ccx'
if(Test-Path -LiteralPath $output){Remove-Item -LiteralPath $output}
$archive=[IO.Compression.ZipFile]::Open($output,[IO.Compression.ZipArchiveMode]::Create)
try{
    $manifest=Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Raw -Encoding UTF8|ConvertFrom-Json
    $manifest.name='Texture3D - prototype Painter'
    $entry=$archive.CreateEntry('manifest.json')
    $writer=New-Object IO.StreamWriter($entry.Open(),(New-Object Text.UTF8Encoding($false)))
    try{$writer.Write(($manifest|ConvertTo-Json -Depth 12))}finally{$writer.Dispose()}
    foreach($name in @('main.js','index.html','companion-config.json')){
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $root $name),$name)|Out-Null
    }
}finally{$archive.Dispose()}
Write-Output "PROTOTYPE=$output"
