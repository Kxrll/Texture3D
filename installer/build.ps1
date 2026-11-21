$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root=Split-Path $PSScriptRoot -Parent
$version=(Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$release=Join-Path $root "distribution\Texture3D-$version"
$stage=Join-Path $env:TEMP ('Texture3D-build-'+[guid]::NewGuid().ToString('N'))
$app=Join-Path $stage 'app'
New-Item -ItemType Directory -Path $app,$release -Force | Out-Null
$node=(Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$nodeVersion=(& $node --version).Trim()
Push-Location -LiteralPath $root
try {
  & $node build.cjs
  if($LASTEXITCODE -ne 0){throw 'Build du viewer impossible.'}
} finally {
  Pop-Location
}
$names=@('companion.cjs','painter-bridge.cjs','painter-launch.cjs','choose-painter-project.ps1','INSTALLER_PAINTER.ps1','OUVRIR_VIEWER.vbs','open-photoshop-project.ps1','prepare-photoshop-project.jsx','install-blender-addon.py','THREE-LICENSE.txt')
foreach($name in $names){Copy-Item -LiteralPath (Join-Path $root $name) -Destination $app}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'LISEZ-MOI-RELEASE.txt') -Destination (Join-Path $app 'LIRE_MOI.txt')
New-Item -ItemType Directory -Path (Join-Path $app 'viewer'),(Join-Path $app 'assets') | Out-Null
foreach($file in @('viewer/index.html','viewer/viewer.js','assets/texture3d.ico','assets/CUBE_UV_2048.png')) {
  Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $app $file)
}
New-Item -ItemType Directory -Path (Join-Path $app 'painter_plugin\texture3d_painter') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'painter_plugin/texture3d_autostart.py') -Destination (Join-Path $app 'painter_plugin')
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
Invoke-WebRequest "https://raw.githubusercontent.com/nodejs/node/$nodeVersion/LICENSE" -OutFile (Join-Path $app 'runtime\LICENSE.txt') -UseBasicParsing
foreach($name in @('uninstall.ps1','uninstall-addon.py')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $app}
foreach($name in @('setup.ps1','files.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $stage}
Push-Location -LiteralPath $app
try {
  $files=@(Get-ChildItem -Recurse -File | ForEach-Object {
    (Resolve-Path -LiteralPath $_.FullName -Relative).Substring(2)
  })+@('package-files.json','installation.json')
  foreach($file in $files) {
    if($file -notin @('package-files.json','installation.json') -and !(Test-Path -LiteralPath $file -PathType Leaf)) {
      throw "Chemin introuvable dans le paquet : $file"
    }
  }
} finally {
  Pop-Location
}
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
$hashes=Get-FileHash -LiteralPath $output -Algorithm SHA256 | ForEach-Object {$_.Hash.ToLower()+'  '+[IO.Path]::GetFileName($_.Path)}
$hashes|Set-Content (Join-Path $release 'SHA256SUMS.txt') -Encoding ASCII
Write-Output "RELEASE=$release"
Write-Output "STAGE=$stage"
Write-Output $hashes
