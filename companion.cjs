const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const config=require('./companion-config.json');
const base='http://127.0.0.1:'+config.port;
const viewerURL=base+'/viewer/index.html#token='+config.token;
let revision=0,model=null,texture=null,modelVersion=0,textureVersion=0;
let bridgeSeen=0,info={document:'Aucun document associé',status:'Ouvre le plugin dans Photoshop.',auto:true};
let commandID=0,commands=[];
let commandResults={};
let targetBlender=null,returnID=0;
const blenderClients=new Map(),returns=new Map();
const instanceID=require('node:crypto').randomUUID();
let currentProject=null,photoshopSession=null,cacheTimer=null;
const cachePath=path.join(__dirname,'.session-state.json');
try{
  const saved=JSON.parse(fs.readFileSync(cachePath,'utf8'));
  if(saved.version===1){({model,texture,revision,modelVersion,textureVersion,currentProject,targetBlender}=saved);}
}catch(_){/* First launch or an incomplete cache: reconnect from Blender. */}
commandID=Date.now()*1000;returnID=commandID;
function persistNow(){
  try{fs.writeFileSync(cachePath+'.tmp',JSON.stringify({version:1,model,texture,revision,modelVersion,textureVersion,currentProject,targetBlender}));fs.renameSync(cachePath+'.tmp',cachePath);}catch(error){console.error('Cache Texture3D : '+error.message);}
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
      res.end(JSON.stringify({jobs:[...returns.values()].filter(j=>j.session===body.session).map(({id,glb,image,projectID,setID})=>({id,glb,image,projectID,setID}))}));return;
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
      if(body.textureVersion>textureVersion)throw Error('La nouvelle texture n’est pas encore disponible. Réessaie.');
      if([...returns.values()].some(j=>j.projectID===targetBlender.projectID))throw Error('Un transfert vers Blender est déjà en cours.');
      const sourceTexture=texture,destination={...targetBlender};
      if(currentProject?.textureSets?.length && (!sourceTexture.setID || body.setID!==sourceTexture.setID || sourceTexture.documentName!==currentProject.documentName))throw Error('Le matériau a changé. Attends la mise à jour puis réessaie.');
      const folder=path.join(__dirname,'cache-textures');fs.mkdirSync(folder,{recursive:true});
      const file=path.join(folder,require('node:crypto').createHash('sha256').update(targetBlender.projectID+':'+(sourceTexture.setID||'')).digest('hex').slice(0,24)+'-'+textureVersion+'-'+require('node:crypto').randomBytes(4).toString('hex')+'.png');
      const bytes=Buffer.from(sourceTexture.url.slice(sourceTexture.url.indexOf(',')+1),'base64');
      fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file);
      const result=await waitForReturn(destination,{image:file,setID:sourceTexture.setID});
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
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...info,textureSets:currentProject?.textureSets||[],activeDocument:currentProject?.documentName,instanceID,blenderOnline:blenderOnline(),online:Date.now()-bridgeSeen<(info.busy?30000:4000)}));return;
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
