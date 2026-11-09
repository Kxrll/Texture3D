$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root=Split-Path $PSScriptRoot -Parent
$version='0.8.0'
$release=Join-Path $root "distribution\Texture3D-$version"
$stage=Join-Path $env:TEMP ('Texture3D-build-'+[guid]::NewGuid().ToString('N'))
$app=Join-Path $stage 'app'
New-Item -ItemType Directory -Path $app,$release -Force | Out-Null
$node='C:\Program Files\nodejs\node.exe'
& $node (Join-Path $root 'build.cjs')
if($LASTEXITCODE -ne 0){throw 'Build du viewer impossible.'}
$names=@('companion.cjs','painter-bridge.cjs','INSTALLER_PAINTER.ps1','OUVRIR_VIEWER.vbs','open-photoshop-project.ps1','prepare-photoshop-project.jsx','install-blender-addon.py','THREE-LICENSE.txt')
foreach($name in $names){Copy-Item -LiteralPath (Join-Path $root $name) -Destination $app}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'LISEZ-MOI-RELEASE.txt') -Destination (Join-Path $app 'LIRE_MOI.txt')
foreach($folder in @('viewer','assets')){Copy-Item -LiteralPath (Join-Path $root $folder) -Destination $app -Recurse}
New-Item -ItemType Directory -Path (Join-Path $app 'painter_plugin\texture3d_painter') -Force | Out-Null
Copy-Item -Path (Join-Path $root 'painter_plugin\texture3d_painter\*.py') -Destination (Join-Path $app 'painter_plugin\texture3d_painter')
New-Item -ItemType Directory -Path (Join-Path $app 'distribution'),(Join-Path $app 'runtime'),(Join-Path $app 'blender_addon\texture3d_blender') -Force | Out-Null
# Build with a fresh distribution token; never embed the developer's configuration.
$bytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($bytes);$rng.Dispose()
$config=@{port=18743;token=([BitConverter]::ToString($bytes).Replace('-','').ToLower())}|ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $app 'companion-config.json'),$config,(New-Object Text.UTF8Encoding($false)))
$plugin=Join-Path $stage 'plugin';New-Item -ItemType Directory -Path $plugin|Out-Null
$manifest=Get-Content (Join-Path $root 'manifest.json') -Raw|ConvertFrom-Json
$manifest.id='fr.texture3d.studio';$manifest.name='Texture3D Studio';$manifest.version=$version
$manifest|Add-Member -NotePropertyName author -NotePropertyValue @{name='Texture3D'} -Force
$manifest|Add-Member -NotePropertyName icons -NotePropertyValue @(@{width=48;height=48;path='icon.png';scale=@(1);theme=@('all');species=@('pluginList')}) -Force
[IO.File]::WriteAllText((Join-Path $plugin 'manifest.json'),($manifest|ConvertTo-Json -Depth 10),(New-Object Text.UTF8Encoding($false)))
foreach($name in @('main.js','index.html')){Copy-Item -LiteralPath (Join-Path $root $name) -Destination $plugin}
Copy-Item -LiteralPath (Join-Path $app 'companion-config.json') -Destination $plugin
Copy-Item -LiteralPath (Join-Path $root 'assets\plugin.png') -Destination (Join-Path $plugin 'icon.png')
[IO.Compression.ZipFile]::CreateFromDirectory($plugin,(Join-Path $app 'distribution\fr.texture3d.studio_PS.ccx'))
Copy-Item -Path (Join-Path $root 'blender_addon\texture3d_blender\*.py') -Destination (Join-Path $app 'blender_addon\texture3d_blender')
Copy-Item -LiteralPath $node -Destination (Join-Path $app 'runtime')
Invoke-WebRequest 'https://raw.githubusercontent.com/nodejs/node/v22.17.1/LICENSE' -OutFile (Join-Path $app 'runtime\LICENSE.txt') -UseBasicParsing
foreach($name in @('uninstall.ps1','uninstall-addon.py')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $app}
foreach($name in @('setup.ps1','files.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $stage}
$files=@(Get-ChildItem -LiteralPath $app -Recurse -File | ForEach-Object {$_.FullName.Substring($app.Length+1)})+@('package-files.json','installation.json')
$files|ConvertTo-Json|Set-Content (Join-Path $app 'package-files.json') -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $app 'package-files.json') -Destination $stage
# Only the explicitly staged runtime and scripts enter the installer.
$payloadStage=Join-Path $env:TEMP ('Texture3D-payload-root-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $payloadStage|Out-Null
foreach($name in @('app','setup.ps1','files.ps1','package-files.json')){Copy-Item -LiteralPath (Join-Path $stage $name) -Destination $payloadStage -Recurse}
$payload=$payloadStage+'.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($payloadStage,$payload)
$output=Join-Path $release "Texture3D-Setup-$version.exe"
& 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' /nologo /target:winexe /platform:x64 ('/win32manifest:'+(Join-Path $PSScriptRoot 'app.manifest')) ('/win32icon:'+(Join-Path $root 'assets\texture3d.ico')) /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll ('/resource:'+$payload+',payload.zip') ('/out:'+$output) (Join-Path $PSScriptRoot 'Setup.cs')
if($LASTEXITCODE -ne 0){throw 'Compilation échouée'}
$portable=Join-Path $stage 'Texture3D portable'
Copy-Item -LiteralPath $app -Destination $portable -Recurse
Copy-Item -Path (Join-Path $PSScriptRoot 'portable\*') -Destination $portable
Copy-Item -LiteralPath (Join-Path $root 'INSTALLER_PHOTOSHOP.ps1') -Destination $portable
$portableZip=Join-Path $release "Texture3D-Portable-$version.zip"
if(Test-Path -LiteralPath $portableZip){Remove-Item -LiteralPath $portableZip}
[IO.Compression.ZipFile]::CreateFromDirectory($portable,$portableZip)
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'LISEZ-MOI-RELEASE.txt') -Destination $release
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'NOTES-0.8.0.md') -Destination $release
$hashes=Get-FileHash -LiteralPath $output,$portableZip -Algorithm SHA256|ForEach-Object {$_.Hash.ToLower()+'  '+[IO.Path]::GetFileName($_.Path)}
$hashes|Set-Content (Join-Path $release 'SHA256SUMS.txt') -Encoding ASCII
Write-Output "RELEASE=$release"
Write-Output "STAGE=$stage"
Write-Output $hashes
