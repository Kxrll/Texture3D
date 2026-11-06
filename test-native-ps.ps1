param([Parameter(Mandatory=$true)][string]$PSDPath)
$ErrorActionPreference='Stop'
$expected=$PSDPath|ConvertTo-Json -Compress
$photoshopApp=New-Object -ComObject Photoshop.Application
$script=@'
(function(){var d=app.activeDocument;if(d.fullName.fsName!==__EXPECTED__||d.name.indexOf('Texture3D_Test_Integration_')!==0)throw Error('Wrong test document');var previous=app.displayDialogs;try{app.displayDialogs=DialogModes.NO;d.bitsPerChannel=BitsPerChannelType.SIXTEEN;d.resizeImage(UnitValue(4096,'px'),UnitValue(256,'px'),72,ResampleMethod.NEARESTNEIGHBOR);d.save();return d.name;}finally{app.displayDialogs=previous;}}());
'@
$photoshopApp.DoJavaScript($script.Replace('__EXPECTED__',$expected))
