# Full backend, isolated profile and mocked external Adobe/Blender executables.
param([Parameter(Mandatory=$true)][string]$PackageStage)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$testRoot=Join-Path $env:TEMP ('Texture3D-backend-test-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot|Out-Null
$fake=Join-Path $testRoot 'blender.exe'
$code=@'
using System;using System.Reflection;
[assembly: AssemblyFileVersion("5.1.0.1")]
class Fake {static int Main(string[] args){if(Environment.GetEnvironmentVariable("T3D_FAIL")=="blender"&&args.Length>0&&args[0]=="--background")return 7;return 0;}}
'@
Add-Type -TypeDefinition $code -OutputAssembly $fake -OutputType ConsoleApplication
$oldLocal=$env:LOCALAPPDATA;$oldRoaming=$env:APPDATA
$env:LOCALAPPDATA=Join-Path $testRoot 'local';$env:APPDATA=Join-Path $testRoot 'roaming'
$target=Join-Path $env:LOCALAPPDATA 'Programs\Texture3D'
$addon=Join-Path $env:APPDATA 'Blender Foundation\Blender\5.1\scripts\addons\texture3d_blender'
$pref=Join-Path $env:APPDATA 'Blender Foundation\Blender\5.1\config\userpref.blend'
$menu=Join-Path $testRoot 'menu'
$reg='HKCU:\Software\Texture3DInstallerTest-'+[guid]::NewGuid().ToString('N')
function Assert($ok,$why){if(!$ok){throw $why}}
try{
 New-Item -ItemType Directory -Path $target,$addon,(Split-Path $pref),$menu|Out-Null
 Copy-Item -Path (Join-Path $PackageStage 'app\*') -Destination $target -Recurse
 Set-Content (Join-Path $target 'companion.cjs') 'old release marker'
 Set-Content (Join-Path $target 'personal.psd') 'paint preserved'
 Set-Content (Join-Path $addon 'obsolete.py') 'old addon'
 Set-Content $pref 'old preferences'
 $configBefore=Get-Content (Join-Path $target 'companion-config.json') -Raw
 $script=Get-Content (Join-Path $PSScriptRoot 'setup.ps1') -Raw
 $ast=[Management.Automation.Language.Parser]::ParseInput($script,[ref]$null,[ref]$null)
 $fn=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Detect'},$true)
 $escaped=$fake.Replace("'","''")
 $detect="function Detect { return @{blenders=@('$escaped');photoshop=`$true;adobe=`$true;upia='$escaped';installed=`$true;running=@()} }"
 $script=$script.Remove($fn.Extent.StartOffset,$fn.Extent.EndOffset-$fn.Extent.StartOffset).Insert($fn.Extent.StartOffset,$detect)
 $script=$script.Replace("([Environment]::GetFolderPath('Programs'))",("'"+$menu.Replace("'","''")+"'"))
 $script=$script.Replace('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Texture3D',$reg)
 $case=Join-Path $testRoot 'package';New-Item -ItemType Directory -Path $case|Out-Null
 Copy-Item -LiteralPath (Join-Path $PackageStage 'app') -Destination $case -Recurse
 # Use a simulated first launch of Painter, with no Documents profile yet.
 $documents=Join-Path $testRoot 'documents'
 $programFiles=Join-Path $testRoot 'program-files'
 $painterExe=Join-Path $programFiles 'Adobe\Adobe Substance 3D Painter\Adobe Substance 3D Painter.exe'
 New-Item -ItemType Directory -Path (Split-Path $painterExe) -Force | Out-Null
 Copy-Item -LiteralPath $fake -Destination $painterExe
 $painterSetup=Join-Path $case 'app\INSTALLER_PAINTER.ps1'
 $painterScript=Get-Content -LiteralPath $painterSetup -Raw
 $painterScript=$painterScript.Replace("[Environment]::GetFolderPath('MyDocuments')",("'"+$documents.Replace("'","''")+"'"))
 $painterScript=$painterScript.Replace('$env:ProgramFiles',("'"+$programFiles.Replace("'","''")+"'"))
 Set-Content -LiteralPath $painterSetup -Value $painterScript -Encoding UTF8
 $painterPython=Join-Path $documents 'Adobe\Adobe Substance 3D Painter\python'
 $painterPlugin=Join-Path $painterPython 'plugins\texture3d_painter'
 $painterLoader=Join-Path $painterPython 'startup\texture3d_autostart.py'
 Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'files.ps1') -Destination $case
 Set-Content (Join-Path $case 'setup.ps1') $script -Encoding UTF8
 $env:T3D_FAIL='blender'
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $case 'setup.ps1') -Mode Install
 Assert ($LASTEXITCODE -eq 1) 'Failure not propagated'
 Assert ((Get-Content (Join-Path $target 'companion.cjs') -Raw).Trim() -eq 'old release marker') 'Application rollback failed'
 Assert (Test-Path (Join-Path $addon 'obsolete.py')) 'Addon rollback failed'
 Assert (!(Test-Path -LiteralPath $painterLoader)) 'Painter plugin installed before core installation succeeded'
 Assert ((Get-Content $pref -Raw).Trim() -eq 'old preferences') 'Preferences rollback failed'
 $env:T3D_FAIL=''
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $case 'setup.ps1') -Mode Install
 Assert ($LASTEXITCODE -eq 0) 'Upgrade failed'
 Assert ((Get-Content (Join-Path $target 'installation.json') -Raw|ConvertFrom-Json).version -eq '1.0.1') 'Installed version not recorded'
 Assert (!(Test-Path (Join-Path $addon 'obsolete.py'))) 'Obsolete addon retained'
 Assert ((Get-Content (Join-Path $target 'personal.psd') -Raw).Trim() -eq 'paint preserved') 'Project lost'
 Assert ((Get-Content (Join-Path $target 'companion-config.json') -Raw) -eq $configBefore) 'Token changed'
 Assert ((Get-ItemProperty $reg).DisplayVersion -eq '1.0.1') 'Registry version wrong'
 Assert (Test-Path (Join-Path $menu 'Texture3D.lnk')) 'Shortcut missing'
 Assert (Test-Path -LiteralPath $painterLoader) 'Painter startup loader missing'
 Assert (Test-Path -LiteralPath (Join-Path $painterPlugin '__init__.py')) 'Painter plugin missing'
 $location=Get-Content -LiteralPath (Join-Path $painterPlugin 'tool-location.json') -Raw | ConvertFrom-Json
 $installed=Get-Content -LiteralPath (Join-Path $location.directory 'installation.json') -Raw | ConvertFrom-Json
 Assert ($installed.directory -eq $target) 'Painter plugin points outside the installed application'
 New-ItemProperty -Path $reg -Name DisplayVersion -Value 'previous-version' -Force|Out-Null
 $shortcutHash=(Get-FileHash (Join-Path $menu 'Texture3D.lnk')).Hash
 $lateFailure=$script.Replace(" # Keep a recovery copy, outside the app. It is not registered or launched."," throw 'Injected finalization failure'")
 Set-Content (Join-Path $case 'setup.ps1') $lateFailure -Encoding UTF8
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $case 'setup.ps1') -Mode Install
 Assert ($LASTEXITCODE -eq 1) 'Late failure not propagated'
 Assert ((Get-ItemProperty $reg).DisplayVersion -eq 'previous-version') 'Registry rollback failed'
 Assert ((Get-FileHash (Join-Path $menu 'Texture3D.lnk')).Hash -eq $shortcutHash) 'Shortcut rollback failed'
 Set-Content (Join-Path $case 'setup.ps1') $script -Encoding UTF8
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $case 'setup.ps1') -Mode Install
 Assert ($LASTEXITCODE -eq 0) 'Reinstall failed'
 Assert (@(Get-ChildItem -LiteralPath (Split-Path $target) -Directory).Count -eq 1) 'Duplicate application directory'
 $otherLoader=Join-Path $painterPython 'startup\other_plugin.py'
 Set-Content -LiteralPath $otherLoader '# unrelated Painter plugin'
 & (Join-Path $target 'INSTALLER_PAINTER.ps1') -Remove
 Assert (!(Test-Path -LiteralPath $painterLoader)) 'Painter startup loader was not removed'
 Assert (Test-Path -LiteralPath $otherLoader) 'Unrelated Painter plugin removed'
 Write-Output 'PASS: Painter detected before first launch, startup files installed and owned files removed.'
 Write-Output 'PASS: backend upgrade, injected failure and retry; app/addon/preferences restored, project/token retained, one shortcut and registration.'
}finally{
 $env:LOCALAPPDATA=$oldLocal;$env:APPDATA=$oldRoaming;$env:T3D_FAIL=''
 if(Test-Path -LiteralPath $reg){Remove-Item -LiteralPath $reg -Force}
}
