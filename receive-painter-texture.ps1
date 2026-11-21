param([Parameter(Mandatory=$true)][string]$Payload)
$ErrorActionPreference='Stop'
$data=Get-Content -LiteralPath $Payload -Raw -Encoding UTF8|ConvertFrom-Json
$image=(Resolve-Path -LiteralPath $data.file).Path
if((Get-FileHash -LiteralPath $image -Algorithm SHA256).Hash.ToLower() -ne $data.sha256){throw 'Empreinte de la texture reçue invalide.'}
$ps=New-Object -ComObject Photoshop.Application
$payloadJson=@{file=$image;document=$data.document;channel=$data.channel;psd=$data.psd;uv=$data.uv;expiresAt=$data.expiresAt}|ConvertTo-Json -Compress
$jsx=@"
(function(){
var p=$payloadJson;
if(p.expiresAt&&new Date().getTime()>p.expiresAt)throw Error('Réception expirée. Relance l’import depuis le viewer.');
var target=null;
if(p.psd){
 for(var i=0;i<app.documents.length;i++)if(app.documents[i].name===p.document){
  var same=false;try{same=app.documents[i].fullName.fsName===new File(p.psd).fsName;}catch(_){}
  if(!same)throw Error('Un autre document porte le nom associé. Ferme ou renomme cette copie avant la réception.');
  if(target)throw Error('Plusieurs documents de même nom.');target=app.documents[i];
 }
}
var source=app.open(new File(p.file));
if(!target){
 if(new File(p.psd).exists)target=app.open(new File(p.psd));
 else{
  target=source.duplicate(p.document.replace(/\.psd$/i,''));
  target.activeLayer.name='Painter — '+p.channel+' — source';
  var guide=app.open(new File(p.uv));guide.activeLayer.duplicate(target,ElementPlacement.PLACEATBEGINNING);guide.close(SaveOptions.DONOTSAVECHANGES);
  app.activeDocument=target;var outline=target.layers[0];outline.name='Tracé UV';
  var group=target.layerSets.add();group.name='Repère UV';outline.move(group,ElementPlacement.INSIDE);group.allLocked=true;
  var paint=target.artLayers.add();paint.name='Peinture';paint.move(group,ElementPlacement.PLACEBEFORE);
  var options=new PhotoshopSaveOptions();options.layers=true;options.embedColorProfile=true;
  target.saveAs(new File(p.psd),options,false,Extension.LOWERCASE);
  source.close(SaveOptions.DONOTSAVECHANGES);return 'Nouveau PSD associé créé';
 }
}
if(source.width.as('px')!==target.width.as('px')||source.height.as('px')!==target.height.as('px')){source.close(SaveOptions.DONOTSAVECHANGES);throw Error('Résolution différente du PSD associé.');}
if(source.bitsPerChannel!==target.bitsPerChannel||source.mode!==target.mode){source.close(SaveOptions.DONOTSAVECHANGES);throw Error('Mode ou profondeur incompatible avec le PSD associé. Aucun calque remplacé.');}
if(p.channel==='BaseColor'||p.channel==='Emissive'){
 var sourceProfile='',targetProfile='';try{sourceProfile=source.colorProfileName;targetProfile=target.colorProfileName;}catch(_){}
 if(sourceProfile!==targetProfile){source.close(SaveOptions.DONOTSAVECHANGES);throw Error('Profils colorimétriques différents. Réception interrompue pour éviter une conversion implicite.');}
}
if(p.expiresAt&&new Date().getTime()>p.expiresAt){source.close(SaveOptions.DONOTSAVECHANGES);throw Error('Réception expirée avant ajout du calque.');}
source.activeLayer.name='Painter — '+p.channel+' — '+new Date().getTime();
source.activeLayer.duplicate(target,ElementPlacement.PLACEATBEGINNING);
source.close(SaveOptions.DONOTSAVECHANGES);app.activeDocument=target;
return 'Nouveau calque reçu ; document non sauvegardé automatiquement';
})();
"@
$ps.DoJavaScript($jsx)
