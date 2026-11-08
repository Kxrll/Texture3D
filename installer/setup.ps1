param([ValidateSet('Inspect','Install')][string]$Mode='Inspect',[string]$BlenderPath='')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
. (Join-Path $PSScriptRoot 'files.ps1')
$target=Join-Path $env:LOCALAPPDATA 'Programs\Texture3D'
$log=Join-Path $env:TEMP 'Texture3D-installation.log'
function Progress($percent,$message){Write-Output "T3D|$percent|$message"}
function Detect {
 $candidates=@()
 foreach($pattern in @("$env:ProgramFiles\Blender Foundation\Blender*\blender.exe","$env:LOCALAPPDATA\Programs\Blender Foundation\Blender*\blender.exe","$env:ProgramFiles\Steam\steamapps\common\Blender\blender.exe","${env:ProgramFiles(x86)}\Steam\steamapps\common\Blender\blender.exe")){$candidates+=@(Get-ChildItem -Path $pattern -File -ErrorAction SilentlyContinue)}
 $command=Get-Command blender.exe -ErrorAction SilentlyContinue
 if($command){$candidates+=Get-Item -LiteralPath $command.Source}
 foreach($key in @('HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*')){
  foreach($entry in @(Get-ItemProperty $key -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -like 'Blender*' -and $_.InstallLocation})){
   $exe=Join-Path $entry.InstallLocation 'blender.exe';if(Test-Path -LiteralPath $exe){$candidates+=Get-Item -LiteralPath $exe}
  }
 }
 $previous=Join-Path $target 'installation.json'
 if(Test-Path -LiteralPath $previous){$old=Get-Content -LiteralPath $previous -Raw|ConvertFrom-Json;if($old.blender -and (Test-Path -LiteralPath $old.blender)){$candidates+=Get-Item -LiteralPath $old.blender}}
 if($BlenderPath){if(!(Test-Path -LiteralPath $BlenderPath) -or [IO.Path]::GetFileName($BlenderPath) -ne 'blender.exe'){throw 'Choisis le fichier blender.exe.'};$candidates+=Get-Item -LiteralPath $BlenderPath}
 $found=@($candidates|Sort-Object FullName -Unique|Sort-Object -Property @{Expression={try{[version]$_.VersionInfo.FileVersion}catch{[version]'0.0'}};Descending=$true})
 $upia=Join-Path $env:CommonProgramFiles 'Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe'
 $psReady=Test-Path 'Registry::HKEY_CLASSES_ROOT\Photoshop.Application'
 $version=(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Texture3D' -ErrorAction SilentlyContinue).DisplayVersion
 return @{blenders=@($found|ForEach-Object {$_.FullName});photoshop=$psReady;adobe=(Test-Path -LiteralPath $upia);upia=$upia;installed=(Test-Path -LiteralPath $target);previousVersion=$version;target=$target;version='0.8.0';running=@(Get-Process blender,Photoshop -ErrorAction SilentlyContinue|Select-Object -ExpandProperty ProcessName -Unique)}
}
if($Mode -eq 'Inspect'){try{Detect|ConvertTo-Json -Compress -Depth 4;exit 0}catch{Write-Output $_.Exception.Message;exit 1}}
$stage=$target+'.staging-'+[guid]::NewGuid().ToString('N')
$recovery=Join-Path $env:LOCALAPPDATA ('Texture3D\Recovery\'+[guid]::NewGuid().ToString('N'))
$backup=Join-Path $recovery 'application'
$addonBackups=@();$swapped=$false;$adobeAttempted=$false;$hadPrevious=$false
try{
 Start-Transcript -Path $log -Force | Out-Null
 Progress 4 'Vérification des logiciels'
 $info=Detect
 if($info.running.Count){throw 'Enregistre ton travail et ferme Blender et Photoshop, puis clique sur Réessayer.'}
 if(!$info.photoshop -or !$info.adobe){throw 'Installe Photoshop et Adobe Creative Cloud Desktop, puis lance Photoshop une première fois.'}
 if(!$info.blenders.Count){throw 'Blender est introuvable. Utilise le bouton Choisir Blender.'}
 $blender=if($BlenderPath){$BlenderPath}else{$info.blenders[0]}
 # Stop only the companion owned by this installation, never unrelated Node processes.
 Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object {$_.ExecutablePath -eq (Join-Path $target 'runtime\node.exe') -and $_.CommandLine -like '*companion.cjs*'} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop}
 Progress 15 'Sauvegarde de la version précédente'
 New-Item -ItemType Directory -Path $recovery -Force|Out-Null
 # Snapshot each existing Blender profile, including preferences which Blender will update.
 $profiles=Join-Path $env:APPDATA 'Blender Foundation\Blender'
 $profileNames=@(Get-ChildItem -LiteralPath $profiles -Directory -ErrorAction SilentlyContinue|Select-Object -ExpandProperty Name)
 foreach($exe in $info.blenders){$v=(Get-Item -LiteralPath $exe).VersionInfo;$profileNames+=('{0}.{1}' -f $v.FileMajorPart,$v.FileMinorPart)}
 foreach($profileName in @($profileNames|Sort-Object -Unique)){
  $profile=Join-Path $profiles $profileName
  $addon=Join-Path $profile 'scripts\addons\texture3d_blender'
  $pref=Join-Path $profile 'config\userpref.blend'
  $save=Join-Path $recovery ('blender-'+$profileName)
  New-Item -ItemType Directory -Path $save -Force|Out-Null
  $existed=Test-Path -LiteralPath $addon
  if($existed){Copy-Item -LiteralPath $addon -Destination (Join-Path $save 'addon') -Recurse}
  if(Test-Path -LiteralPath $pref){Copy-Item -LiteralPath $pref -Destination (Join-Path $save 'userpref.blend')}
  $addonBackups+=@{addon=$addon;pref=$pref;save=$save;existed=$existed}
 }
 Progress 28 'Préparation du viewer et de Photoshop'
 Prepare-Application (Join-Path $PSScriptRoot 'app') $target $stage
 $hadPrevious=Test-Path -LiteralPath $target
 if($hadPrevious){Move-Item -LiteralPath $target -Destination $backup}
 try{Move-Item -LiteralPath $stage -Destination $target;$swapped=$true}catch{if($hadPrevious){Move-Item -LiteralPath $backup -Destination $target};throw}
 Progress 48 'Mise à jour du plugin Photoshop'
 $adobeAttempted=$true
 # Explicit replacement also allows repairing/reinstalling the same version.
 # A missing old plugin is harmless; the following install is authoritative.
 if($hadPrevious){
  & $info.upia /remove 'Texture3D Studio' 2>&1 | ForEach-Object { Write-Output "$_" }
 }
 & $info.upia /install (Join-Path $target 'distribution\fr.texture3d.studio_PS.ccx') 2>&1 | ForEach-Object { Write-Output "$_" }
 if($LASTEXITCODE -ne 0){throw "Adobe a refusé le plugin (code $LASTEXITCODE). Vérifie Creative Cloud, puis réessaie."}
 Progress 66 'Mise à jour des extensions Blender'
 # Same module name replaces the previous addon; other existing profiles are refreshed too.
 foreach($item in $addonBackups){if($item.existed){
  Get-ChildItem -LiteralPath $item.addon -File -Filter '*.py'|Remove-Item -Force
  Copy-Item -Path (Join-Path $target 'blender_addon\texture3d_blender\*.py') -Destination $item.addon -Force
  [IO.File]::WriteAllText((Join-Path $item.addon 'tool-location.json'),(@{directory=$target}|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
 }}
 foreach($exe in $info.blenders){
  & $exe --background --python-exit-code 1 --python (Join-Path $target 'install-blender-addon.py') 2>&1 | ForEach-Object { Write-Output "$_" }
  if($LASTEXITCODE -ne 0){throw "L'extension Blender n'a pas pu être installée : $exe"}
 }
 Progress 90 'Finalisation des raccourcis'
 @{version='0.8.0';blender=$blender;blenders=$info.blenders;directory=$target}|ConvertTo-Json|Set-Content (Join-Path $target 'installation.json') -Encoding UTF8
 $shell=New-Object -ComObject WScript.Shell
 $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Texture3D.lnk'))
 $shortcut.TargetPath=Join-Path $env:WINDIR 'System32\wscript.exe';$shortcut.Arguments='"'+(Join-Path $target 'OUVRIR_VIEWER.vbs')+'"';$shortcut.WorkingDirectory=$target;$shortcut.IconLocation=(Join-Path $target 'assets\texture3d.ico')+',0';$shortcut.Save()
 $reg='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Texture3D'
 New-Item -Path $reg -Force|Out-Null
 (@{DisplayName='Texture3D Studio';DisplayVersion='0.8.0';DisplayIcon=(Join-Path $target 'assets\texture3d.ico');InstallLocation=$target;UninstallString=('powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "'+$target+'\uninstall.ps1"')}).GetEnumerator() | ForEach-Object {New-ItemProperty -Path $reg -Name $_.Key -Value $_.Value -Force|Out-Null}
 # Keep a recovery copy, outside the app. It is not registered or launched.
 if($hadPrevious){Progress 98 ('Sauvegarde conservée : '+$backup)}
 Progress 100 'Texture3D est prêt. Retrouve-le dans la barre latérale de Blender.'
}catch{
 $reason=$_.Exception.Message
 if($swapped){
  Progress 92 'Restauration de la version précédente'
  try{
   $failed=Join-Path $recovery 'failed-application'
   Move-Item -LiteralPath $target -Destination $failed
   if($hadPrevious){Move-Item -LiteralPath $backup -Destination $target}
   foreach($item in $addonBackups){
    $addonPath=[IO.Path]::GetFullPath($item.addon)
    if(!$addonPath.StartsWith([IO.Path]::GetFullPath($profiles)+'\',[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($addonPath) -ne 'texture3d_blender'){throw 'Chemin de restauration invalide.'}
    if(Test-Path -LiteralPath $addonPath){Remove-Item -LiteralPath $addonPath -Recurse -Force}
    if($item.existed){Copy-Item -LiteralPath (Join-Path $item.save 'addon') -Destination $addonPath -Recurse}
    if(Test-Path -LiteralPath (Join-Path $item.save 'userpref.blend')){Copy-Item -LiteralPath (Join-Path $item.save 'userpref.blend') -Destination $item.pref -Force}
    elseif(Test-Path -LiteralPath $item.pref){Remove-Item -LiteralPath $item.pref -Force}
   }
   if($adobeAttempted -and $hadPrevious){
    & $info.upia /remove 'Texture3D Studio' 2>&1| ForEach-Object { Write-Output "$_" }
    & $info.upia /install (Join-Path $target 'distribution\fr.texture3d.studio_PS.ccx') 2>&1| ForEach-Object { Write-Output "$_" }
    if($LASTEXITCODE -ne 0){throw 'Adobe ne permet pas la restauration automatique du plugin. Consulte le journal.'}
   }
   elseif($adobeAttempted){
    & $info.upia /remove 'Texture3D Studio' 2>&1| ForEach-Object { Write-Output "$_" }
    if($LASTEXITCODE -ne 0){throw 'Le plugin Adobe doit être retiré dans Creative Cloud.'}
   }
  }catch{$reason+=' Restauration incomplète : '+$_.Exception.Message+' Sauvegarde : '+$recovery}
 }
 if(Test-Path -LiteralPath $stage){
  try{Move-Item -LiteralPath $stage -Destination (Join-Path $recovery 'incomplete-preparation')}catch{}
 }
 Progress 0 ($reason+' Journal : '+$log)
 exit 1
}finally{Stop-Transcript -ErrorAction SilentlyContinue|Out-Null}

