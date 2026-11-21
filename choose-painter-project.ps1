$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
$dialog=New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title='Retrouver le projet Substance'
$dialog.Filter='Projet Substance Painter (*.spp)|*.spp'
$dialog.CheckFileExists=$true
$dialog.Multiselect=$false
$owner=New-Object System.Windows.Forms.Form
$owner.TopMost=$true
$owner.ShowInTaskbar=$false
$owner.StartPosition='CenterScreen'
$owner.Opacity=0
try {
    $owner.Show()
    $owner.Activate()
    if($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK){
        @{file=$dialog.FileName}|ConvertTo-Json -Compress
    } else { @{cancelled=$true}|ConvertTo-Json -Compress }
} finally { $dialog.Dispose();$owner.Dispose() }
