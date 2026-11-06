$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
$target=Join-Path $env:LOCALAPPDATA 'Programs\Texture3D'
$log=Join-Path $env:TEMP 'Texture3D-installation.log'
try {
 Start-Transcript -Path $log -Force | Out-Null
 if(Get-Process blender,Photoshop -ErrorAction SilentlyContinue){throw 'Enregistre ton travail et ferme Blender et Photoshop, puis relance cet installateur.'}
 $upia=Join-Path $env:CommonProgramFiles 'Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe'
 if(!(Test-Path -LiteralPath $upia)){throw 'Adobe Creative Cloud Desktop est nécessaire pour installer le plugin Photoshop.'}
 if(!(Test-Path 'Registry::HKEY_CLASSES_ROOT\Photoshop.Application')){throw 'Photoshop doit être installé et lancé au moins une fois avant Texture3D.'}
 $candidates=@()
 foreach($pattern in @("$env:ProgramFiles\Blender Foundation\Blender*\blender.exe","$env:LOCALAPPDATA\Programs\Blender Foundation\Blender*\blender.exe","$env:ProgramFiles\Steam\steamapps\common\Blender\blender.exe","${env:ProgramFiles(x86)}\Steam\steamapps\common\Blender\blender.exe")){
  $candidates+=@(Get-ChildItem -Path $pattern -File -ErrorAction SilentlyContinue)
 }
 $command=Get-Command blender.exe -ErrorAction SilentlyContinue
 if($command){$candidates+=Get-Item -LiteralPath $command.Source}
 foreach($key in @('HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*')){
  foreach($entry in @(Get-ItemProperty $key -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -like 'Blender*' -and $_.InstallLocation})){
   $exe=Join-Path $entry.InstallLocation 'blender.exe'
   if(Test-Path -LiteralPath $exe){$candidates+=Get-Item -LiteralPath $exe}
  }
 }
 $found=@($candidates | Sort-Object -Property @{Expression={try{[version]$_.VersionInfo.FileVersion}catch{[version]'0.0'}};Descending=$true},FullName -Unique)
 $photoshop=@(Get-ChildItem "$env:ProgramFiles\Adobe\Adobe Photoshop*\Photoshop.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
 $photoshopName=if($photoshop.Count){$photoshop[0].Directory.Name}else{'Photoshop (installation Adobe détectée)'}
 if($found.Count){$blender=$found[0].FullName}else{
 $dialog=New-Object System.Windows.Forms.OpenFileDialog
 $dialog.Title='Choisir Blender pour installer Texture3D'
 $dialog.Filter='Blender (blender.exe)|blender.exe'
 if($dialog.ShowDialog() -ne 'OK'){exit 2}
 $blender=$dialog.FileName
 }
 if([System.Windows.Forms.MessageBox]::Show("Installer Texture3D pour cet utilisateur ?`n`nBlender : $blender`nPhotoshop : $photoshopName`nDestination : $target`n`nLe plugin Photoshop sera installé avec Adobe Creative Cloud.",'Texture3D','OKCancel','Information') -ne 'OK'){exit 2}
 New-Item -ItemType Directory -Path $target -Force | Out-Null
 Copy-Item -Path (Join-Path $PSScriptRoot 'app\*') -Destination $target -Recurse -Force
 & $upia /install (Join-Path $target 'distribution\fr.texture3d.studio_PS.ccx')
 if($LASTEXITCODE -ne 0){throw "Adobe a refusé l'installation (code $LASTEXITCODE). Consulte $log puis relance l'installateur."}
 & $blender --background --python-exit-code 1 --python (Join-Path $target 'install-blender-addon.py')
 if($LASTEXITCODE -ne 0){throw "L'installation Blender a échoué. Consulte $log puis relance l'installateur."}
 @{blender=$blender;directory=$target}|ConvertTo-Json|Set-Content (Join-Path $target 'installation.json') -Encoding UTF8
 $shell=New-Object -ComObject WScript.Shell
 $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Texture3D.lnk'))
 $shortcut.TargetPath=Join-Path $env:WINDIR 'System32\wscript.exe'
 $shortcut.Arguments='"'+(Join-Path $target 'OUVRIR_VIEWER.vbs')+'"'
 $shortcut.WorkingDirectory=$target
 $shortcut.IconLocation=(Join-Path $target 'assets\texture3d.ico')+',0'
 $shortcut.Save()
 $reg='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Texture3D'
 New-Item -Path $reg -Force | Out-Null
 New-ItemProperty -Path $reg -Name DisplayName -Value 'Texture3D Studio' -Force | Out-Null
 New-ItemProperty -Path $reg -Name DisplayIcon -Value (Join-Path $target 'assets\texture3d.ico') -Force | Out-Null
 New-ItemProperty -Path $reg -Name DisplayVersion -Value '0.6.0' -Force | Out-Null
 New-ItemProperty -Path $reg -Name UninstallString -Value ('powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "'+$target+'\uninstall.ps1"') -Force | Out-Null
 [System.Windows.Forms.MessageBox]::Show('Installation terminée. Ouvre Blender, sélectionne ton modèle puis utilise le panneau Texture3D (touche N).','Texture3D') | Out-Null
} catch { [System.Windows.Forms.MessageBox]::Show(($_.Exception.Message+"`n`nJournal : "+$log),'Texture3D — installation interrompue','OK','Error') | Out-Null; exit 1 } finally { Stop-Transcript -ErrorAction SilentlyContinue | Out-Null }
