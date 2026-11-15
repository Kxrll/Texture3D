# File operations shared by the installer and its isolated upgrade tests.
function Trim-RecoveryPackages([string]$RecoveryRoot) {
 $base=[IO.Path]::GetFullPath($RecoveryRoot).TrimEnd('\')+'\'
 $completed=@(Get-ChildItem -LiteralPath $RecoveryRoot -Directory -ErrorAction SilentlyContinue | Where-Object {Test-Path -LiteralPath (Join-Path $_.FullName 'completed.txt')} | Sort-Object LastWriteTime -Descending)
 foreach($entry in @($completed | Select-Object -Skip 3)){
  $app=Join-Path $entry.FullName 'application'
  $manifest=Join-Path $app 'package-files.json'
  if(!(Test-Path -LiteralPath $manifest)){continue}
  $files=Get-Content -LiteralPath $manifest -Raw|ConvertFrom-Json
  foreach($relative in $files){
   if($relative -eq 'companion-config.json'){continue}
   $file=Resolve-OwnedPath $app $relative
   if(!$file.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){throw 'Sauvegarde hors du dossier de récupération.'}
   if(Test-Path -LiteralPath $file -PathType Leaf){Remove-Item -LiteralPath $file -Force}
  }
 }
}
function Resolve-OwnedPath([string]$Root,[string]$Relative) {
 $base=[IO.Path]::GetFullPath($Root).TrimEnd('\')+'\'
 $path=[IO.Path]::GetFullPath((Join-Path $Root $Relative))
 if([IO.Path]::IsPathRooted($Relative) -or !$path.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){throw 'Chemin de paquet invalide.'}
 return $path
}
function Prepare-Application([string]$Source,[string]$Current,[string]$Stage) {
 New-Item -ItemType Directory -Path $Stage -Force | Out-Null
 if(Test-Path -LiteralPath $Current){
  # Preserve non-package files (including sessions and personal projects).
  Get-ChildItem -LiteralPath $Current -Force | Copy-Item -Destination $Stage -Recurse -Force
  $manifest=Join-Path $Current 'package-files.json'
  if(Test-Path -LiteralPath $manifest){
   $ownedFiles=Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
   foreach($relative in $ownedFiles){
    $path=Resolve-OwnedPath $Stage $relative
    if(Test-Path -LiteralPath $path -PathType Leaf){Remove-Item -LiteralPath $path -Force}
   }
  }
 }
 Get-ChildItem -LiteralPath $Source -Force | Copy-Item -Destination $Stage -Recurse -Force
 $bytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($bytes);$rng.Dispose()
 $newConfig=@{port=18743;token=([BitConverter]::ToString($bytes).Replace('-','').ToLower())}|ConvertTo-Json
 [IO.File]::WriteAllText((Join-Path $Stage 'companion-config.json'),$newConfig,(New-Object Text.UTF8Encoding($false)))
 # Retain the installation's token, and use it in the new Photoshop package too.
 $config=Join-Path $Current 'companion-config.json'
 if(Test-Path -LiteralPath $config){
  $value=Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
  if($value.token -and $value.port){Copy-Item -LiteralPath $config -Destination (Join-Path $Stage 'companion-config.json') -Force}
 }
 $ccx=Join-Path $Stage 'distribution\fr.texture3d.studio_PS.ccx'
 $zip=[IO.Compression.ZipFile]::Open($ccx,[IO.Compression.ZipArchiveMode]::Update)
 try{
  $entry=$zip.GetEntry('companion-config.json');if($entry){$entry.Delete()}
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $Stage 'companion-config.json'),'companion-config.json') | Out-Null
 }finally{$zip.Dispose()}
}
