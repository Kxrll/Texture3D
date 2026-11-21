const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {spawn,execFile}=require('node:child_process');
let painterPickerBusy=false;
const config=require('./companion-config.json');
const base='http://127.0.0.1:'+config.port;
const viewerURL=base+'/viewer/index.html#token='+config.token;
let revision=0,model=null,texture=null,modelVersion=0,textureVersion=0;
let bridgeSeen=0,info={document:'Aucun document associé',status:'Ouvre le plugin dans Photoshop.',auto:true};
let commandID=0,commands=[];
let commandResults={};
let targetBlender=null,returnID=0;
const blenderClients=new Map(),returns=new Map();
let painterHandoff=null;
const painterReceivers=new Map();
let painterLastTransfer=null,painterLastError=null;
const painterDestinations=new Map();
const painterDestinationsFile=path.join(__dirname,'.painter-destinations.json');
try{
  const saved=JSON.parse(fs.readFileSync(painterDestinationsFile,'utf8'));
  for(const [id,value] of Object.entries(saved))if(typeof value?.context==='string')painterDestinations.set(id,value);
}catch(_){}
// Recover associations made before persistence was introduced; newest owned ledger wins.
const painterFolder=path.join(__dirname,'Projets Painter');
if(fs.existsSync(painterFolder)){
  const candidates=fs.readdirSync(painterFolder).filter(n=>/^binding-[a-f0-9]{64}\.json$/.test(n)).map(n=>path.join(painterFolder,n)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
  for(const file of candidates)try{
    const data=JSON.parse(fs.readFileSync(file,'utf8'));
    if(typeof data.projectID==='string'&&typeof data.project==='string'&&Array.isArray(data.urls)&&data.urls.length&&!painterDestinations.has(data.projectID))painterDestinations.set(data.projectID,{context:data.project});
  }catch(_){}
}
function rememberPainter(id,context,uuid,meshSignature,project){
  const previous=painterDestinations.get(id);
  painterDestinations.set(id,{context,uuid,meshSignature,project:project||(previous?.context===context?previous.project:undefined)});
  fs.writeFileSync(painterDestinationsFile+'.tmp',JSON.stringify(Object.fromEntries(painterDestinations)));
  fs.renameSync(painterDestinationsFile+'.tmp',painterDestinationsFile);
}

async function openPainterProject(projectID,{locate=false,project}={}){
  if(painterHandoff)throw Error('Un transfert Painter est déjà en cours.');
  const exe=path.join(process.env.ProgramFiles||'C:\\Program Files','Adobe','Adobe Substance 3D Painter','Adobe Substance 3D Painter.exe');
  await require('./painter-launch.cjs').launchIfNeeded({connected:[...painterReceivers.values()].some(r=>Date.now()-r.seen<5000),launch:()=>{if(!fs.existsSync(exe))throw Error('Ouvre Painter manuellement.');spawn(exe,[],{detached:true,stdio:'ignore',windowsHide:false}).unref();}});
  const result=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{painterHandoff=null;reject(Error('Choix du projet expiré. Réessaie Retrouver le projet Substance.'));},180000);
    painterHandoff={id:require('node:crypto').randomUUID(),action:locate?'locate-project':'open-project',projectID,project,finish(ack){clearTimeout(timer);painterHandoff=null;ack.error?reject(Error(ack.error)):resolve(ack);}};
  });
  if(!result.context||!result.project)throw Error('Painter n’a pas confirmé le projet ouvert.');
  rememberPainter(projectID,result.context,result.uuid,result.meshSignature,result.project);
  return result;
}
async function deliverBlenderTexture(body,destination){
        if(!texture||body.textureVersion!==textureVersion)throw Error('Actualise la texture Photoshop avant l’envoi.');
        const png=Buffer.from(texture.url.split(',')[1]||'','base64');
        if(png.length<33||png.toString('hex',0,8)!=='89504e470d0a1a0a')throw Error('Capture PNG invalide.');
        const folder=path.join(__dirname,'Projets Painter');
        const image=path.join(folder,require('node:crypto').createHash('sha256').update(png).digest('hex')+'.png');
        if(!fs.existsSync(image))fs.writeFileSync(image,png,{flag:'wx'});
        const result=await new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>{painterHandoff=null;reject(Error('Painter ne répond pas. Active son plugin Texture3D.'));},30000);
          painterHandoff={id:require('node:crypto').randomUUID(),action:'texture',projectID:body.projectID,context:destination.context,meshSignature:destination.meshSignature,image,sha256:require('node:crypto').createHash('sha256').update(png).digest('hex'),finish(ack){clearTimeout(timeout);painterHandoff=null;if(ack.error)reject(Error(ack.error));else if(!ack.baseColorApplied)reject(Error('Painter utilise encore l’ancien plugin. Enregistre ton projet puis redémarre Painter pour charger l’affectation Base Color.'));else resolve(ack);}};
        });
        return result;
}
const instanceID=require('node:crypto').randomUUID();
let currentProject=null,photoshopSession=null,cacheTimer=null;
const cachePath=path.join(__dirname,'.session-state.json');
const assetCache=path.join(__dirname,'.session-assets');
function restoreAsset(key,value){
  if(!value||typeof value!=='object'||!value.texture3dAsset)return value;
  if(!/^[a-f0-9]{64}\.(png|glb)$/.test(value.texture3dAsset))throw Error('Cache invalide');
  const data=fs.readFileSync(path.join(assetCache,value.texture3dAsset));
  return key==='bytes'?[...data]:'data:image/png;base64,'+data.toString('base64');
}
const transferCache=path.join(__dirname,'cache-textures');
if(fs.existsSync(transferCache))for(const name of fs.readdirSync(transferCache)){
  if(!/^[a-f0-9]{24}-[0-9]+-[a-f0-9]{8}\.png(?:\.tmp)?$/.test(name))continue;
  const file=path.join(transferCache,name);
  try{if(Date.now()-fs.statSync(file).mtimeMs>86400000)fs.rmSync(file);}catch(_){}
}
try{
  const saved=JSON.parse(fs.readFileSync(cachePath,'utf8'),restoreAsset);
  if(saved.version===1||saved.version===2){({model,texture,revision,modelVersion,textureVersion,currentProject,targetBlender}=saved);}
}catch(_){/* First launch or an incomplete cache: reconnect from Blender. */}
commandID=Date.now()*1000;returnID=commandID;
function persistNow(){
  try{
    fs.mkdirSync(assetCache,{recursive:true});const used=new Set();
    function binary(key,value){
      let data,ext;
      if(key==='bytes'&&Array.isArray(value)){data=Buffer.from(value);ext='glb';}
      else if(key==='url'&&typeof value==='string'&&value.startsWith('data:image/png;base64,')){data=Buffer.from(value.slice(22),'base64');ext='png';}
      else return value;
      const name=require('node:crypto').createHash('sha256').update(data).digest('hex')+'.'+ext;
      used.add(name);const file=path.join(assetCache,name);if(!fs.existsSync(file))fs.writeFileSync(file,data);
      return {texture3dAsset:name};
    }
    fs.writeFileSync(cachePath+'.tmp',JSON.stringify({version:2,model,texture,revision,modelVersion,textureVersion,currentProject,targetBlender},binary));
    fs.renameSync(cachePath+'.tmp',cachePath);
    for(const name of fs.readdirSync(assetCache))if(/^[a-f0-9]{64}\.(png|glb)$/.test(name)&&!used.has(name))fs.rmSync(path.join(assetCache,name));
  }catch(error){console.error('Cache Texture3D : '+error.message);}
}
function persist(){clearTimeout(cacheTimer);cacheTimer=setTimeout(persistNow,300);}
const painter=require('./painter-bridge.cjs')(__dirname,{readJSON,openViewer,queueCommand(command){const id=++commandID;commands.push({...command,id});return id;},getInfo(){return {...info,commandResults,online:Date.now()-bridgeSeen<(info.busy?30000:4000),instanceID};},queueDocument(documentName){
  commands=commands.filter(c=>!['link','refresh'].includes(c.type));
  commands.push({type:'link',documentName,id:++commandID},{type:'refresh',id:++commandID});
}});
function blenderOnline(){return !!targetBlender&&Date.now()-(blenderClients.get(targetBlender.session)||0)<6000;}
async function readJSON(req){let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>256*1024*1024)throw Error('Fichier trop volumineux');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
function waitForReturn(destination,file){
  return new Promise((resolve,reject)=>{
    if([...returns.values()].some(j=>j.projectID===destination.projectID)){reject(Error('Un transfert vers Blender est déjà en cours.'));return;}
    const id=++returnID;
    const timer=setTimeout(()=>{returns.delete(id);reject(Error('Blender ne répond pas. Ferme ses boîtes de dialogue, passe en mode Objet puis réessaie.'));},30000);
    returns.set(id,{id,...file,...destination,finish(ack){clearTimeout(timer);ack.error?reject(Error(ack.error)):resolve(ack);}});
  });
}
function openViewer(source='blender'){
  const edge=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
  if(!edge)throw Error('Microsoft Edge introuvable.');
  const target=source==='painter'?base+'/viewer/index.html?source=painter#token='+config.token:viewerURL;
  const process=spawn(edge,['--app='+target,'--window-size=1100,800'],{detached:true,stdio:'ignore'});
  process.on('error',()=>{});process.unref();
}
const files={
 '/viewer/index.html':['viewer/index.html','text/html; charset=utf-8'],
 '/viewer/icon.ico':['assets/texture3d.ico','image/x-icon'],
 '/viewer/viewer.js':['viewer/viewer.js','application/javascript; charset=utf-8']
};
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const url=new URL(req.url,base);
  if(req.method==='GET' && files[url.pathname]){
    const [file,type]=files[url.pathname];res.setHeader('Content-Type',type);fs.createReadStream(path.join(__dirname,file)).pipe(res);return;
  }
  if(req.headers['x-texture3d-key']!==config.token){res.writeHead(403);res.end();return;}
  // No cross-origin browser access or arbitrary file/command endpoints.
  const origin=req.headers.origin;
  if(origin && origin!==base && origin!=='null'){res.writeHead(403);res.end();return;}
  try{
    if(req.method==='POST'&&['/painter-roundtrip','/painter-catalogue','/painter-handoff-lease'].includes(url.pathname)){
      throw Error('L’import depuis Painter a été retiré. Utilise l’export manuel de Substance.');
    }
    if(req.method==='POST'&&url.pathname==='/painter-project'){
      const body=await readJSON(req);
      const active=painter.association(painter.activeDocument);
      if(typeof body.projectID!=='string'||!body.projectID||body.projectID.length>1024||(body.projectID!==currentProject?.projectID&&body.projectID!==active?.projectID))throw Error('Projet Texture3D non associé.');
      if(painterPickerBusy||painterHandoff)throw Error('Un choix de fichier ou un transfert est déjà en cours.');
      painterPickerBusy=true;
      try{
        const selected=await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-STA','-File',path.join(__dirname,'choose-painter-project.ps1')],{windowsHide:true,timeout:180000,encoding:'utf8'},(error,stdout)=>{
          if(error){reject(Error('Le sélecteur de fichier a été fermé ou a expiré.'));return;}
          try{resolve(JSON.parse(stdout.replace(/^\uFEFF/,'').trim()));}catch(_){reject(Error('Réponse du sélecteur de fichier invalide.'));}
        }));
        if(selected.cancelled){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({cancelled:true}));return;}
        if(typeof selected.file!=='string'||path.extname(selected.file).toLowerCase()!=='.spp'||!fs.statSync(selected.file).isFile())throw Error('Le fichier choisi n’est pas un projet .spp valide.');
        if(body.projectID!==currentProject?.projectID&&body.projectID!==painter.association(painter.activeDocument)?.projectID)throw Error('Le projet Texture3D a changé pendant le choix du fichier. Réessaie.');
        const result=await openPainterProject(body.projectID,{project:selected.file});
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
      }finally{painterPickerBusy=false;}
    }
    if(req.method==='POST'&&url.pathname==='/blender-to-painter'){
      if(painterPickerBusy)throw Error('Termine le choix du fichier Substance avant l’envoi.');
      const body=await readJSON(req);
      if(!blenderOnline()||body.projectID!==targetBlender.projectID)throw Error('Reprends ce projet dans Blender avant l’envoi.');
      if(painterHandoff)throw Error('Un envoi vers Painter est déjà en cours.');
      const previous=painterDestinations.get(body.projectID);
      let destination;
      if(previous?.project){await openPainterProject(body.projectID,{project:previous.project});destination=painterDestinations.get(body.projectID);}
      else destination=require('./painter-launch.cjs').currentTarget([...painterReceivers.values()],previous);
      const log=(action)=>{try{fs.appendFileSync(path.join(__dirname,'companion-painter-transfers.log'),JSON.stringify({at:new Date().toISOString(),action,projectHash:require('node:crypto').createHash('sha256').update(body.projectID).digest('hex').slice(0,16)})+'\n');}catch(_){}};
      if(destination){
        log('update-open-painter');
        const result=await deliverBlenderTexture(body,destination);
        rememberPainter(body.projectID,destination.context,destination.uuid,destination.meshSignature);
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
      }
      if(previous)throw Error('Le fichier .spp associé n’est pas connu. Utilise Retrouver le projet Substance ; aucun nouveau projet créé.');
      const connected=[...painterReceivers.values()].some(r=>Date.now()-r.seen<5000);
      if(!connected&&await require('./painter-launch.cjs').isRunning())throw Error('Painter est ouvert, mais son plugin Texture3D ne répond pas encore. Attends quelques secondes ou active Python → texture3d_painter ; aucune nouvelle instance ouverte.');
      log('open-model-in-painter');
      const folder=path.join(__dirname,'Projets Painter');fs.mkdirSync(folder,{recursive:true});
      const fbx=path.join(folder,require('node:crypto').randomUUID()+'.fbx');
      await waitForReturn(targetBlender,{action:'export-painter',fbx});
      if(!fs.existsSync(fbx)||fs.statSync(fbx).size<24)throw Error('Export FBX absent. Mets à jour l’extension Blender.');
      const exe=path.join(process.env.ProgramFiles||'C:\\Program Files','Adobe','Adobe Substance 3D Painter','Adobe Substance 3D Painter.exe');
      if(!fs.existsSync(exe))throw Error('Painter est introuvable à son emplacement habituel. Ouvre-le manuellement.');
      const launched=await require('./painter-launch.cjs').launchIfNeeded({connected:[...painterReceivers.values()].some(r=>Date.now()-r.seen<5000),launch:()=>spawn(exe,[],{detached:true,stdio:'ignore',windowsHide:false}).unref()});
      log(launched.launched?'launch-painter':'reuse-running-painter');
      try{
        const result=await new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>{painterHandoff=null;reject(Error('Active le plugin Texture3D dans Painter, puis réessaie. Le FBX exporté est conservé.'));},60000);
          painterHandoff={id:require('node:crypto').randomUUID(),fbx,projectID:body.projectID,finish(ack){clearTimeout(timeout);if(!ack.error&&ack.context)rememberPainter(body.projectID,ack.context,ack.uuid,ack.meshSignature);painterHandoff=null;ack.error?reject(Error(ack.error)):resolve(ack);}};
        });
        const imported=await deliverBlenderTexture(body,painterDestinations.get(body.projectID));
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...result,...imported}));
      }catch(error){throw error;}return;
    }
    if(req.method==='POST'&&url.pathname==='/painter/blender-handoff'){
      const body=await readJSON(req);
      if(typeof body.session==='string'&&body.session.length<=100){
        painterReceivers.set(body.session,{catalogue:body.catalogue||null,seen:Date.now()});
        for(const [id,receiver] of painterReceivers)if(Date.now()-receiver.seen>10000)painterReceivers.delete(id);
      }
      if(body.catalogue?.context&&typeof body.catalogue.project==='string'&&body.catalogue.project.toLowerCase().endsWith('.spp'))for(const [id,d] of painterDestinations){if(d.context===body.catalogue.context&&d.project!==body.catalogue.project)rememberPainter(id,d.context,d.uuid,d.meshSignature,body.catalogue.project);}
      if(painterHandoff&&body.ack?.id===painterHandoff.id&&(!painterHandoff.receiver||painterHandoff.receiver===body.session)){if(body.ack.error)painterLastError=String(body.ack.error);else{painterLastTransfer=Date.now();painterLastError=null;}painterHandoff.finish(body.ack);}
      let deliver=!!painterHandoff;
      if(painterHandoff&&body.session){
        if(painterHandoff.receiver&&painterHandoff.receiver!==body.session)deliver=false;
        if(painterHandoff.context&&body.catalogue?.context!==painterHandoff.context)deliver=false;
        if(painterHandoff.expectedProject&&body.catalogue?.project!==painterHandoff.expectedProject)deliver=false;
        if(!painterHandoff.context&&!painterHandoff.expectedProject&&painterHandoff.action!=='export'&&painterReceivers.size>1)deliver=false;
        if(deliver)painterHandoff.receiver=body.session;
      }
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({job:deliver&&painterHandoff?{id:painterHandoff.id,fbx:painterHandoff.fbx,action:painterHandoff.action,projectID:painterHandoff.projectID,context:painterHandoff.context,image:painterHandoff.image,project:painterHandoff.project,meshSignature:painterHandoff.meshSignature,sha256:painterHandoff.sha256,expectedProject:painterHandoff.expectedProject,documentName:painterHandoff.documentName,channel:painterHandoff.channel,bitDepth:painterHandoff.bitDepth,experimental:painterHandoff.experimental,textureSet:painterHandoff.textureSet,stack:painterHandoff.stack,folder:painterHandoff.folder,sceneID:painterHandoff.sceneID}:null}));return;
    }
    if(await painter.handle(req,res,url))return;
    if(req.method==='POST' && url.pathname==='/blender-bridge'){
      const body=await readJSON(req);
      if(typeof body.session!=='string'||body.session.length>100)throw Error('Session Blender invalide.');
      blenderClients.set(body.session,Date.now());
      if(typeof body.projectID==='string'&&currentProject?.projectID===body.projectID&&targetBlender?.session!==body.session&&!blenderOnline()){
        targetBlender={session:body.session,projectID:body.projectID};persist();
      }
      for(const ack of body.ack||[]){const job=returns.get(ack.id);if(job&&job.session===body.session){job.finish(ack);returns.delete(ack.id);}}
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({jobs:[...returns.values()].filter(j=>j.session===body.session).map(({id,glb,image,projectID,setID,action,fbx})=>({id,glb,image,projectID,setID,action,fbx}))}));return;
    }
    if(req.method==='POST' && url.pathname==='/start-project'){
      const project=await readJSON(req);
      if(!Array.isArray(project.bytes)||project.bytes.length>25*1024*1024||typeof project.documentName!=='string'||project.documentName.length>255)throw Error('Projet Blender invalide.');
      const buffer=Buffer.from(project.bytes);
      if(buffer.length<12||buffer.toString('ascii',0,4)!=='glTF'||buffer.readUInt32LE(8)!==buffer.length)throw Error('Modèle GLB invalide.');
      painter.deactivate();
      const nextModel={type:'model',bytes:project.bytes,name:String(project.name||'Modele.glb')};
      model=nextModel;modelVersion=++revision;texture=null;textureVersion=++revision;
      targetBlender=typeof project.blenderSession==='string'&&typeof project.projectID==='string'?{session:project.blenderSession,projectID:project.projectID}:null;
      currentProject={projectID:targetBlender?.projectID||null,documentName:project.documentName,textureSets:project.textureSets||[],textures:{}};persist();
      // Replace an earlier pending project and keep this launch pending when Photoshop's panel is closed.
      commands=commands.filter(c=>!['importModel','link','refresh','auto'].includes(c.type));
      commands.push({...nextModel,type:'importModel',id:++commandID},
        {type:'link',documentName:project.documentName,id:++commandID},
        {type:'auto',enabled:true,id:++commandID},{type:'refresh',id:++commandID});
      if(currentProject.textureSets.length){commands=[];for(const set of [...currentProject.textureSets,currentProject.textureSets[0]])commands.push({type:'link',documentName:set.document,id:++commandID},{type:'refresh',id:++commandID});}
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({online:Date.now()-bridgeSeen<4000}));return;
    }
    if(req.method==='POST' && url.pathname==='/return-blender'){
      const body=await readJSON(req);
      if(!blenderOnline())throw Error('Blender est déconnecté. Ouvre la scène et utilise Reprendre la peinture.');
      if(body.projectID!==targetBlender.projectID)throw Error('Le projet a changé pendant le transfert. Réessaie depuis la bonne scène.');
      if(!texture||!texture.url.startsWith('data:image/png;base64,'))throw Error('Actualise Photoshop avec le plugin Texture3D 0.6 pour envoyer le PNG original.');
      if(!Number.isSafeInteger(body.textureVersion)||body.textureVersion!==textureVersion)throw Error('La nouvelle texture n’est pas encore disponible. Réessaie.');
      if([...returns.values()].some(j=>j.projectID===targetBlender.projectID))throw Error('Un transfert vers Blender est déjà en cours.');
      const sourceTexture=texture,destination={...targetBlender};
      if(currentProject?.textureSets?.length && (!sourceTexture.setID || body.setID!==sourceTexture.setID || sourceTexture.documentName!==currentProject.documentName))throw Error('Le matériau a changé. Attends la mise à jour puis réessaie.');
      const folder=path.join(__dirname,'cache-textures');fs.mkdirSync(folder,{recursive:true});
      const file=path.join(folder,require('node:crypto').createHash('sha256').update(targetBlender.projectID+':'+(sourceTexture.setID||'')).digest('hex').slice(0,24)+'-'+textureVersion+'-'+require('node:crypto').randomBytes(4).toString('hex')+'.png');
      const bytes=Buffer.from(sourceTexture.url.slice(sourceTexture.url.indexOf(',')+1),'base64');
      fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file);
      let result;
      try{result=await waitForReturn(destination,{image:file,setID:sourceTexture.setID});}
      finally{try{fs.rmSync(file,{force:true});}catch(error){console.error('Nettoyage du transfert : '+error.message);}}
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({count:result.count,updatedExisting:true,width:sourceTexture.width,height:sourceTexture.height,bitDepth:sourceTexture.bitDepth}));return;
    }
    if(req.method==='POST' && url.pathname==='/export-blender'){
      if(!targetBlender||Date.now()-(blenderClients.get(targetBlender.session)||0)>6000)throw Error('Dans Blender, recharge Texture3D puis lance Peindre dans Photoshop depuis la scène à mettre à jour.');
      const destination={...targetBlender};
      let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>100*1024*1024)throw Error('Export limité à 100 Mo.');chunks.push(chunk);}
      const buffer=Buffer.concat(chunks);
      if(buffer.length<12||buffer.toString('ascii',0,4)!=='glTF'||buffer.readUInt32LE(8)!==buffer.length)throw Error('Fichier GLB invalide.');
      const folder=path.join(__dirname,'..','Exports Blender');fs.mkdirSync(folder,{recursive:true});
      const name='Texture3D_'+new Date().toISOString().replace(/[:.]/g,'-')+'_'+require('node:crypto').randomBytes(3).toString('hex');
      const glb=path.join(folder,name+'.glb'),blend=path.join(folder,name+'.blend');
      fs.writeFileSync(glb,buffer,{flag:'wx'});
      const result=await new Promise((resolve,reject)=>{
        const id=++returnID;
        const timer=setTimeout(()=>{returns.delete(id);reject(Error('Blender ne répond pas. Vérifie qu’aucune boîte de dialogue ne bloque la scène.'));},30000);
        returns.set(id,{id,glb,...destination,finish(ack){clearTimeout(timer);ack.error?reject(Error(ack.error)):resolve(ack);}});
      });
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name,glb,count:result.count,updatedExisting:true}));return;
    }
    if(req.method==='GET' && url.pathname==='/info'){
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...info,painterOnline:[...painterReceivers.values()].some(r=>Date.now()-r.seen<5000),painterTransfer:{busy:!!painterHandoff,lastSuccess:painterLastTransfer,error:painterLastError},textureSets:currentProject?.textureSets||[],activeDocument:currentProject?.documentName,instanceID,blenderOnline:blenderOnline(),online:Date.now()-bridgeSeen<(info.busy?30000:4000)}));return;
    }
    if(req.method==='POST' && url.pathname==='/bridge'){
      const body=await readJSON(req);bridgeSeen=Date.now();
      if(body.results&&typeof body.results==='object'){commandResults={...commandResults,...body.results};for(const id of Object.keys(commandResults).slice(0,-40))delete commandResults[id];}
      const newSession=photoshopSession!==(body.session||'legacy');photoshopSession=body.session||'legacy';
      if(body.info)info={document:String(body.info.document||''),status:String(body.info.status||''),auto:!!body.info.auto,busy:!!body.info.busy};
      if(Array.isArray(body.ack)){
        if(currentProject&&commands.some(c=>c.type==='link'&&!c.documentName&&body.ack.includes(c.id))){currentProject.documentName=info.document.replace(/^Texture : /,'');persist();}
        commands=commands.filter(c=>!body.ack.includes(c.id));
      }
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({commands,desiredDocument:newSession?(painter.activeDocument||currentProject?.documentName):null}));return;
    }
    if(req.method==='POST' && url.pathname==='/command'){
      if(Date.now()-bridgeSeen>=4000){res.writeHead(503);res.end();return;}
      const command=await readJSON(req);
      if(!['link','refresh','auto','importModel'].includes(command.type)){res.writeHead(400);res.end();return;}
      if(commands.length>=10){res.writeHead(429);res.end();return;}
      if(command.type==='importModel' && (!Array.isArray(command.bytes)||command.bytes.length>25*1024*1024)){res.writeHead(400);res.end();return;}
      if(command.type==='link'&&currentProject?.textureSets?.length){if(!currentProject.textureSets.some(s=>s.document===command.documentName))throw Error('Choisis un matériau du projet.');currentProject.documentName=command.documentName;persist();}
      const id=++commandID;commands.push({...command,id});res.end(JSON.stringify({id}));return;
    }
    if(req.method==='GET' && url.pathname==='/revision'){
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({instanceID,projectID:currentProject?.projectID,revision,textureVersion,commandResults}));return;
    }
    if(req.method==='GET' && url.pathname==='/state'){
      const after=Number(url.searchParams.get('after')??-1);
      if(after===revision){res.writeHead(204);res.end();return;}
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({instanceID,projectID:currentProject?.projectID,revision,modelVersion,textureVersion,textures:currentProject?.textures||{},model:after<modelVersion||after<0?model:undefined,texture:after<textureVersion||after<0?texture:undefined}));return;
    }
    if(req.method==='POST' && url.pathname==='/open'){
      const body=await readJSON(req);
      openViewer(painter.ownsDocument(body.documentName)?'painter':'blender');res.end('{}');return;
    }
    if(req.method==='POST' && url.pathname==='/state'){
      let length=0;const chunks=[];
      for await(const chunk of req){length+=chunk.length;if(length>256*1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);}
      const message=JSON.parse(Buffer.concat(chunks).toString());
      // Painter's PSD must never replace a Blender texture or its active document.
      if(message.type==='texture'&&painter.ownsDocument(message.documentName)){painter.capture(message);res.end('{}');return;}
      if(message.type==='model' && Array.isArray(message.bytes)){model=message;modelVersion=++revision;}
      else if(message.type==='defaultModel'){model=null;modelVersion=++revision;}
      else if(message.type==='texture' && typeof message.url==='string' && /^data:image\/(png|jpeg);base64,/.test(message.url)){
        if(message.url.startsWith('data:image/png;')){
          const png=Buffer.from(message.url.slice(message.url.indexOf(',')+1),'base64');
          if(png.length<33||png.toString('hex',0,8)!=='89504e470d0a1a0a')throw Error('PNG invalide.');
          message.width=png.readUInt32BE(16);message.height=png.readUInt32BE(20);message.bitDepth=png[24];
          if(Math.max(message.width,message.height)>8192)throw Error('Texture limitée à 8192 px.');
        }
        if(currentProject?.textureSets?.length){const set=currentProject.textureSets.find(s=>s.document===message.documentName);if(!set)throw Error('Document hors du projet.');message.setID=set.id;currentProject.textures[set.id]=message;}
        message.updatedAt=message.updatedAt||Date.now();texture=message;textureVersion=++revision;
      }
      else{res.writeHead(400);res.end();return;}
      persist();res.end('{}');return;
    }
    res.writeHead(404);res.end();
  }catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}
});
server.requestTimeout=45000;
process.on('SIGTERM',()=>{clearTimeout(cacheTimer);persistNow();server.close(()=>process.exit(0));});
server.on('error',error=>{
  if(error.code==='EADDRINUSE' && process.argv.includes('--open')){
    fetch(base+'/open',{method:'POST',headers:{'X-Texture3D-Key':config.token}}).catch(()=>{});
  }else console.error(error.message);
});
server.listen(config.port,'127.0.0.1',()=>{console.log('Texture3D companion ready');if(process.argv.includes('--open'))openViewer();});
