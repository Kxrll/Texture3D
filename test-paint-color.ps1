param([int]$Blue)
$ErrorActionPreference='Stop'
$ps=New-Object -ComObject Photoshop.Application
$script='var d=app.activeDocument;if(d.name.indexOf("Texture3D_Test_Integration_")!==0)throw Error("Not a test document");var layer=d.artLayers.add();layer.name="Test retour couleur";var color=new SolidColor();color.rgb.hexValue="__COLOR__";d.selection.selectAll();d.selection.fill(color);d.selection.deselect();d.save();'
$color=if($Blue){'0000FF'}else{'FF0000'}
$ps.DoJavaScript($script.Replace('__COLOR__',$color))
