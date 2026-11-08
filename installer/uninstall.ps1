$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
try {
 if(Get-Process blender,Photoshop -ErrorAction SilentlyContinue){throw 'Ferme Blender et Photoshop avant de désinstaller Texture3D.'}
 if([System.Windows.Forms.MessageBox]::Show('Désinstaller Texture3D ? Les projets et peintures seront conservés.','Texture3D','OKCancel') -ne 'OK'){exit}
 $root=[IO.Path]::GetFullPath($PSScriptRoot)
 $expected=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\Texture3D'))
 if($root -ne $expected){throw 'Dossier de désinstallation inattendu.'}
 $installation=Get-Content (Join-Path $root 'installation.json') -Raw | ConvertFrom-Json
 $executables=if($installation.blenders){$installation.blenders}else{@($installation.blender)}
 foreach($exe in $executables){if(Test-Path -LiteralPath $exe){
  & $exe --background --python-exit-code 1 --python (Join-Path $root 'uninstall-addon.py')
  if($LASTEXITCODE -ne 0){throw 'Impossible de désactiver l''extension Blender.'}
 }}
 # Remove owned copies in profiles whose Blender executable is no longer present.
 $profiles=[IO.Path]::GetFullPath((Join-Path $env:APPDATA 'Blender Foundation\Blender'))
 foreach($profile in @(Get-ChildItem -LiteralPath $profiles -Directory -ErrorAction SilentlyContinue)){
  $addon=[IO.Path]::GetFullPath((Join-Path $profile.FullName 'scripts\addons\texture3d_blender'))
  $location=Join-Path $addon 'tool-location.json'
  if($addon.StartsWith($profiles+'\',[StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $location)){
   $settings=Get-Content -LiteralPath $location -Raw|ConvertFrom-Json
   if([IO.Path]::GetFullPath($settings.directory) -eq $root){Remove-Item -LiteralPath $addon -Recurse -Force}
  }
 }
 $upia=Join-Path $env:CommonProgramFiles 'Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe'
 & $upia /remove 'Texture3D Studio'
 if($LASTEXITCODE -ne 0){throw 'Adobe n''a pas retiré le plugin. Retire Texture3D Studio dans Creative Cloud, puis relance la désinstallation.'}
 Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object { $_.ExecutablePath -eq (Join-Path $root 'runtime\node.exe') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
 $files=Get-Content (Join-Path $root 'package-files.json') -Raw | ConvertFrom-Json
 foreach($relative in $files){$file=[IO.Path]::GetFullPath((Join-Path $root $relative));if(!$file.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Chemin invalide.'};if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force}}
 Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Programs')) 'Texture3D.lnk') -ErrorAction SilentlyContinue
 Remove-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Texture3D' -Force
 [System.Windows.Forms.MessageBox]::Show('Texture3D désinstallé. Tes projets et peintures sont conservés.','Texture3D')|Out-Null
}catch{[System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'Texture3D','OK','Error')|Out-Null;exit 1}

