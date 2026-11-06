$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root=Split-Path $PSScriptRoot -Parent
$stage=Join-Path $env:TEMP ('Texture3D-build-'+[guid]::NewGuid().ToString('N'))
$app=Join-Path $stage 'app'
New-Item -ItemType Directory -Path $app -Force | Out-Null
$app=(Get-Item -LiteralPath $app).FullName
$names=@('companion.cjs','companion-config.json','OUVRIR_VIEWER.vbs','open-photoshop-project.ps1','prepare-photoshop-project.jsx','install-blender-addon.py','THREE-LICENSE.txt','LIRE_MOI.md')
foreach($name in $names){Copy-Item -LiteralPath (Join-Path $root $name) -Destination $app}
foreach($folder in @('viewer','assets')){Copy-Item -LiteralPath (Join-Path $root $folder) -Destination $app -Recurse}
New-Item -ItemType Directory -Path (Join-Path $app 'distribution'),(Join-Path $app 'runtime'),(Join-Path $app 'blender_addon\texture3d_blender') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'distribution\fr.texture3d.studio_PS.ccx') -Destination (Join-Path $app 'distribution')
Copy-Item -Path (Join-Path $root 'blender_addon\texture3d_blender\*.py') -Destination (Join-Path $app 'blender_addon\texture3d_blender')
Copy-Item -LiteralPath 'C:\Program Files\nodejs\node.exe' -Destination (Join-Path $app 'runtime')
Invoke-WebRequest 'https://raw.githubusercontent.com/nodejs/node/v22.17.1/LICENSE' -OutFile (Join-Path $app 'runtime\LICENSE.txt') -UseBasicParsing
foreach($name in @('uninstall.ps1','uninstall-addon.py')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $app}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'setup.ps1') -Destination $stage
$files=@(Get-ChildItem -LiteralPath $app -Recurse -File | ForEach-Object {$_.FullName.Substring($app.Length+1)})+@('package-files.json','installation.json')
$files|ConvertTo-Json|Set-Content (Join-Path $app 'package-files.json') -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $app 'package-files.json') -Destination $stage
$payload=Join-Path $env:TEMP ('Texture3D-payload-'+[guid]::NewGuid().ToString('N')+'.zip')
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$payload)
$output=Join-Path $root 'distribution\Installer Texture3D.exe'
& 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' /nologo /target:winexe /platform:x64 ('/win32icon:'+ (Join-Path $root 'assets\texture3d.ico')) /reference:System.Windows.Forms.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll ('/resource:'+ $payload+',payload.zip') ('/out:'+ $output) (Join-Path $PSScriptRoot 'Setup.cs')
if($LASTEXITCODE -ne 0){throw 'Compilation échouée'}
Write-Output $output
Get-FileHash -LiteralPath $output -Algorithm SHA256 | Select-Object Hash


