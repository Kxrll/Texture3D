# Real Photoshop COM test using only a temporary document created by this script.
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$temporary=Join-Path $env:TEMP ('Texture3D-painter-psd-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
Add-Type -AssemblyName System.Drawing
$bitmap=New-Object Drawing.Bitmap 64,64
try{
    $bitmap.Save((Join-Path $temporary 'Peinture.png'),[Drawing.Imaging.ImageFormat]::Png)
    $graphics=[Drawing.Graphics]::FromImage($bitmap)
    try{$graphics.DrawRectangle([Drawing.Pens]::Black,0,0,63,63)}finally{$graphics.Dispose()}
    $bitmap.Save((Join-Path $temporary 'Reperes_UV.png'),[Drawing.Imaging.ImageFormat]::Png)
}finally{$bitmap.Dispose()}
@{source='painter';document='Painter-test.psd';texture='Peinture.png';uv='Reperes_UV.png'}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $temporary 'texture3d-project.json') -Encoding UTF8
$psd=Join-Path $temporary 'Painter-test.psd'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'open-photoshop-project.ps1') -ProjectDirectory $temporary -ToolDirectory $root
if($LASTEXITCODE -ne 0){throw 'Préparation Photoshop impossible.'}
$photoshop=New-Object -ComObject Photoshop.Application
$destination=ConvertTo-Json $psd -Compress
$export=ConvertTo-Json (Join-Path $temporary 'sans-guide.png') -Compress
$script=@"
(function(){
var path=new File($destination).fsName;
var doc=null;
for(var i=0;i<app.documents.length;i++){try{if(app.documents[i].fullName.fsName===path)doc=app.documents[i];}catch(_){}}
if(!doc)throw Error('PSD test introuvable');
if(doc.activeLayer.name!=='Peinture')throw Error('Calque de peinture absent');
var group=doc.layerSets.getByName('Rep\u00e8re UV');
if(!group.allLocked)throw Error('Guide non verrouillé');
group.visible=false;
var options=new PNGSaveOptions();doc.saveAs(new File($export),options,true,Extension.LOWERCASE);
doc.save();
return 'ok';
})();
"@
$null=$photoshop.DoJavaScript($script)
# Reopening a Painter document must respect the artist's visibility choices.
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'open-photoshop-project.ps1') -ProjectDirectory $temporary -ToolDirectory $root
if($LASTEXITCODE -ne 0){throw 'Reprise Photoshop impossible.'}
$result=$photoshop.DoJavaScript("(function(){var d=app.activeDocument;if(d.fullName.fsName!==new File($destination).fsName)throw Error('Mauvais document actif');if(d.layerSets.getByName('Rep\u00e8re UV').visible)throw Error('Visibilite modifiee a la reprise');d.close(SaveOptions.DONOTSAVECHANGES);return 'ok';})();")
$image=[Drawing.Bitmap]::FromFile((Join-Path $temporary 'sans-guide.png'))
try{
    for($x=0;$x -lt 64;$x++){for($y=0;$y -lt 64;$y++){if($image.GetPixel($x,$y).A -ne 0){throw 'Le fond exporté devrait être entièrement transparent.'}}}
}finally{$image.Dispose()}
Write-Output 'PASS: real Photoshop PSD, locked UV guide, active paint layer, transparent export without guide, visibility preserved on resume.'
Write-Output "TEST_DIRECTORY=$temporary"
