$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
. (Join-Path $PSScriptRoot 'files.ps1')
$root=Join-Path $env:TEMP ('Texture3D-upgrade-test-'+[guid]::NewGuid().ToString('N'))
$old=Join-Path $root 'old';$new=Join-Path $root 'payload';$stage=Join-Path $root 'stage';$plugin=Join-Path $root 'plugin'
New-Item -ItemType Directory -Path $old,$new,$plugin,(Join-Path $new 'distribution') -Force|Out-Null
function Assert($ok,$message){if(!$ok){throw $message}}
[IO.File]::WriteAllText((Join-Path $old 'companion-config.json'),'{"port":18743,"token":"old-user-token"}')
Set-Content (Join-Path $old 'legacy.js') 'obsolete'
Set-Content (Join-Path $old 'viewer.js') 'old code'
Set-Content (Join-Path $old 'personal.psd') 'personal painting'
Set-Content (Join-Path $old '.session-state.json') '{"session":"keep"}'
@('legacy.js','viewer.js','companion-config.json','package-files.json')|ConvertTo-Json|Set-Content (Join-Path $old 'package-files.json')
[IO.File]::WriteAllText((Join-Path $plugin 'companion-config.json'),'{"port":18743,"token":"package-token"}')
Set-Content (Join-Path $plugin 'manifest.json') '{"id":"fr.texture3d.studio","version":"0.8.0"}'
[IO.Compression.ZipFile]::CreateFromDirectory($plugin,(Join-Path $new 'distribution\fr.texture3d.studio_PS.ccx'))
Copy-Item (Join-Path $plugin 'companion-config.json') $new
Set-Content (Join-Path $new 'viewer.js') 'new code'
@('viewer.js','companion-config.json','distribution\fr.texture3d.studio_PS.ccx','package-files.json')|ConvertTo-Json|Set-Content (Join-Path $new 'package-files.json')
Prepare-Application $new $old $stage
Assert (!(Test-Path (Join-Path $stage 'legacy.js'))) 'Obsolete file retained'
Assert ((Get-Content (Join-Path $stage 'viewer.js') -Raw).Trim() -eq 'new code') 'New code missing'
Assert ((Get-Content (Join-Path $stage 'personal.psd') -Raw).Trim() -eq 'personal painting') 'Personal data lost'
Assert ((Get-Content (Join-Path $stage '.session-state.json') -Raw).Trim() -eq '{"session":"keep"}') 'Session lost'
Assert ((Get-Content (Join-Path $stage 'companion-config.json') -Raw|ConvertFrom-Json).token -eq 'old-user-token') 'Installation token changed'
$zip=[IO.Compression.ZipFile]::OpenRead((Join-Path $stage 'distribution\fr.texture3d.studio_PS.ccx'))
try{$reader=New-Object IO.StreamReader($zip.GetEntry('companion-config.json').Open());$json=$reader.ReadToEnd()|ConvertFrom-Json;$reader.Dispose();Assert ($json.token -eq 'old-user-token') 'Photoshop token mismatch'}finally{$zip.Dispose()}
$second=Join-Path $root 'second';Prepare-Application $new $stage $second
Assert ((Get-Content (Join-Path $second 'personal.psd') -Raw).Trim() -eq 'personal painting') 'Repeat update data lost'
$fresh=Join-Path $root 'fresh';Prepare-Application $new (Join-Path $root 'absent') $fresh
Assert ((Get-Content (Join-Path $fresh 'companion-config.json') -Raw|ConvertFrom-Json).token -ne 'package-token') 'Fresh install token is not unique'
$rejected=$false;try{Resolve-OwnedPath $stage '..\outside.txt'}catch{$rejected=$true};Assert $rejected 'Path traversal not rejected'
# A failed preparation must leave the current installation intact.
@('..\outside.txt')|ConvertTo-Json|Set-Content (Join-Path $old 'package-files.json')
$rejected=$false;try{Prepare-Application $new $old (Join-Path $root 'failed')}catch{$rejected=$true}
Assert $rejected 'Unsafe old manifest accepted'
Assert ((Get-Content (Join-Path $old 'viewer.js') -Raw).Trim() -eq 'old code') 'Current installation modified before commit'
Write-Output 'PASS: replacement, obsolete cleanup, personal files, session, matching tokens, repeat update, fresh install, traversal rejection, preparation failure.'
