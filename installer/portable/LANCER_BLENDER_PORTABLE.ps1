$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
try{
 $found=@(Get-ChildItem "$env:ProgramFiles\Blender Foundation\Blender*\blender.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)
 if($found.Count){$blender=$found[0].FullName}else{
  $dialog=New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title='Choisir Blender';$dialog.Filter='Blender|blender.exe'
  if($dialog.ShowDialog() -ne 'OK'){exit};$blender=$dialog.FileName
 }
 Start-Process -FilePath $blender -ArgumentList @('--python',('"'+(Join-Path $PSScriptRoot 'portable-blender.py')+'"'))
}catch{[System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'Texture3D')|Out-Null}
