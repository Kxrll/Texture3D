// Painter transfers are separate from Blender's model, texture and session state.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function createPainterBridge(root,{readJSON,queueDocument,openViewer,queueCommand,getInfo}){
  const bindings=new Map(),clients=new Map(),jobs=new Map(),saveRefreshes=new Set();
  let activeDocument=null,roundtripBusy=false;
  let model=null,texture=null,revision=0,modelVersion=0,textureVersion=0;
  const online=b=>b&&Date.now()-(clients.get(b.session)||0)<10000;
  function binding(documentName){
    const b=bindings.get(documentName);
    if(!b)throw Error('Ce PSD n’est pas associé à Painter. Lance « Peindre dans Photoshop » depuis Painter.');
    if(!online(b))throw Error('Painter est déconnecté. Active son plugin Texture3D et reprends ce matériau.');
    return b;
  }
  function text(value,max=255){return typeof value==='string'&&value.length>0&&value.length<=max;}
  async function transfer(b,body,automatic=false){
        const texture=body.texture;
        if(body.projectID!==b.projectID)throw Error('Le projet Painter a changé. Reprends la liaison.');
        if(!text(body.refreshRequest,100)||texture?.refreshRequest!==body.refreshRequest||texture.documentName!==b.documentName)
          throw Error('La capture Photoshop ne correspond pas à cet envoi.');
        if([...jobs.values()].some(j=>j.projectID===b.projectID))throw Error('Un envoi vers ce matériau est déjà en cours.');
        if(typeof texture.url!=='string'||!texture.url.startsWith('data:image/png;base64,'))throw Error('La peinture doit être un PNG.');
        const png=Buffer.from(texture.url.slice(22),'base64');
        if(png.length<33||png.length>128*1024*1024||png.toString('hex',0,8)!=='89504e470d0a1a0a'||png.toString('ascii',12,16)!=='IHDR')throw Error('PNG Painter invalide.');
        if(png.readUInt32BE(16)!==b.width||png.readUInt32BE(20)!==b.height)throw Error('La taille du PSD a changé. Garde la résolution du guide UV.');
        const sha256=crypto.createHash('sha256').update(png).digest('hex');
        if(automatic&&b.lastDigest===sha256)return {unchanged:true};
        const folder=path.join(root,'cache-textures');fs.mkdirSync(folder,{recursive:true});
        const id=crypto.randomUUID(),name='Texture3D_'+crypto.createHash('sha256').update(b.projectID).digest('hex').slice(0,20);
        const image=path.join(folder,name+'-'+crypto.randomUUID()+'.png');
        fs.writeFileSync(image,png,{flag:'wx'});
        let result;
        try{
          result=await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>{jobs.delete(id);reject(Error('Painter ne répond pas. Vérifie son panneau Texture3D.'));},30000);
            jobs.set(id,{id,...b,image,sha256:crypto.createHash('sha256').update(png).digest('hex'),resourceName:name,finish(ack){clearTimeout(timer);ack.error?reject(Error(String(ack.error))):resolve(ack);}});
          });
        }finally{fs.rmSync(image,{force:true});}
        b.lastDigest=sha256;b.lastSync=Date.now();
        return {imported:true,resourceName:name,updated:!!result.updated};
  }
  async function drain(b){
    if(roundtripBusy||b.autoRunning||!b.autoEnabled||!b.pending)return;
    if(!online(b)||bindings.get(b.documentName)!==b||activeDocument!==b.documentName){b.pending=null;b.syncError='Liaison inactive : réactive la synchronisation après reconnexion.';return;}
    if([...jobs.values()].some(j=>j.projectID===b.projectID)){b.autoTimer=setTimeout(()=>drain(b),300);return;}
    const message=b.pending;b.pending=null;b.autoRunning=true;b.syncError=null;
    const id='auto-'+crypto.randomUUID();
    try{await transfer(b,{documentName:b.documentName,projectID:b.projectID,refreshRequest:id,texture:{...message,refreshRequest:id}},true);}
    catch(error){b.syncError=error.message;}
    finally{b.autoRunning=false;if(b.pending&&b.autoEnabled)b.autoTimer=setTimeout(()=>drain(b),300);}
  }
  return {
    get activeDocument(){return activeDocument;},
    association(name){return bindings.get(name);},
    beginRoundtrip(){if(roundtripBusy||jobs.size)throw Error('Un transfert Painter est déjà en cours.');roundtripBusy=true;for(const b of bindings.values()){b.pending=null;clearTimeout(b.autoTimer);}},
    endRoundtrip(){roundtripBusy=false;},
    deactivate(){activeDocument=null;},
    ownsDocument(name){return bindings.has(name);},
    capture(message){
      if(message.documentName!==activeDocument)return;
      const b=bindings.get(activeDocument);
      texture={...message,setID:b?.setID||undefined,channel:b?.channel||'BaseColor',updatedAt:Date.now()};textureVersion=++revision;
      if(b)b.lastTexture=texture;
      const saved=saveRefreshes.delete(message.refreshRequest);
      if(b?.autoEnabled&&(!message.refreshRequest||saved)){b.pending=message;clearTimeout(b.autoTimer);b.autoTimer=setTimeout(()=>drain(b),400);}
    },
    async handle(req,res,url){
      if(!url.pathname.startsWith('/painter/'))return false;
      const active=bindings.get(activeDocument);
      if(req.method==='GET'){
        res.setHeader('Content-Type','application/json');
        if(url.pathname==='/painter/info'){res.end(JSON.stringify({...getInfo(),blenderOnline:online(active),painterOnline:online(active),activeDocument,projectID:active?.projectID,sync:active?{enabled:!!active.autoEnabled,busy:!!active.autoRunning,lastSync:active.lastSync||null,error:active.syncError||null}:null,textureSets:active?[...bindings.values()].filter(b=>b.sceneID===active.sceneID&&b.session===active.session).map(b=>({document:b.documentName,name:b.textureSet+(b.channel&&b.channel!=='BaseColor'?' · '+b.channel:'')})):[]}));return true;}
        if(url.pathname==='/painter/revision'){res.end(JSON.stringify({instanceID:getInfo().instanceID,projectID:active?.projectID,revision,textureVersion,commandResults:getInfo().commandResults}));return true;}
        if(url.pathname==='/painter/state'){
          const after=Number(url.searchParams.get('after')??-1);
          if(after===revision){res.writeHead(204);res.end();return true;}
          res.end(JSON.stringify({projectID:active?.projectID,sceneID:active?.sceneID,textures:active?.setID?[...bindings.values()].filter(b=>b.sceneID===active.sceneID&&b.lastTexture).map(b=>b.lastTexture):undefined,revision,modelVersion,textureVersion,model:after<modelVersion||after<0?model:undefined,texture:after<textureVersion||after<0?texture:undefined}));return true;
        }
        res.writeHead(404);res.end();return true;
      }
      if(req.method!=='POST'){res.writeHead(405);res.end();return true;}
      const body=await readJSON(req);
      res.setHeader('Content-Type','application/json');
      if(url.pathname==='/painter/start'){
        if(!text(body.session,100)||!text(body.projectID,100)||!text(body.documentName)||!text(body.textureSet)||
           !Number.isInteger(body.width)||!Number.isInteger(body.height)||Math.min(body.width,body.height)<1||Math.max(body.width,body.height)>8192)
          throw Error('Association Painter invalide.');
        if(body.channel!=null&&!['BaseColor','Emissive','Roughness','Metallic','Normal','Height','AO','Opacity'].includes(body.channel))throw Error('Canal de référence non pris en charge.');
        if(body.setID!=null&&!text(body.setID,100)||body.sceneID!=null&&!text(body.sceneID,100))throw Error('Identité de Texture Set invalide.');
        const old=bindings.get(body.documentName);
        const changedDocument=activeDocument!==body.documentName;
        let nextModel=null;
        if(body.bytes){
          if(!Array.isArray(body.bytes)||body.bytes.length>25*1024*1024)throw Error('Modèle Painter trop volumineux.');
          const glb=Buffer.from(body.bytes);
          if(glb.length<12||glb.toString('ascii',0,4)!=='glTF'||glb.readUInt32LE(8)!==glb.length)throw Error('Modèle Painter GLB invalide.');
          nextModel={bytes:body.bytes,name:body.name||body.textureSet+'.glb'};
        }
        if(old&&old.projectID!==body.projectID)throw Error('Ce nom de PSD est déjà associé à un autre projet.');
        if(old&&old.session!==body.session&&online(old))throw Error('Ce matériau est déjà connecté à une autre fenêtre Painter.');
        const textureSets=body.textureSets||[body.textureSet];
        if(!Array.isArray(textureSets)||textureSets.length>1000||!textureSets.length||textureSets.some(s=>!text(s)))throw Error('Liste de matériaux Painter invalide.');
        const b={painterProject:body.painterProject||null,session:body.session,projectID:body.projectID,documentName:body.documentName,textureSet:body.textureSet,textureSets,width:body.width,height:body.height,setID:body.setID||null,channel:body.channel||'BaseColor',sceneID:body.sceneID||body.projectID,lastTexture:old?.lastTexture,model:nextModel||old?.model};
        bindings.set(b.documentName,b);clients.set(b.session,Date.now());activeDocument=b.documentName;
        if(changedDocument||!body.resume||!old||old.projectID!==b.projectID){model=nextModel||model;modelVersion=++revision;texture=null;textureVersion=++revision;}
        if(nextModel&&!body.resume)openViewer('painter');
        queueDocument(b.documentName);res.end(JSON.stringify({projectID:b.projectID}));return true;
      }
      if(url.pathname==='/painter/command'){
        if(!getInfo().online){res.writeHead(503);res.end();return true;}
        if(!['link','refresh','auto'].includes(body.type))throw Error('Commande Painter invalide.');
        if(body.type==='link'){
          const target=binding(body.documentName||activeDocument);
          if(active&&target.sceneID!==active.sceneID)throw Error('Ce document appartient à une autre scène Painter.');
          if(activeDocument!==target.documentName){activeDocument=target.documentName;texture=target.lastTexture||null;textureVersion=++revision;}
          body.documentName=target.documentName;
        }
        const id=queueCommand(body);
        if(body.type==='refresh'&&body.reason==='saved-document'){saveRefreshes.add(id);while(saveRefreshes.size>32)saveRefreshes.delete(saveRefreshes.values().next().value);}
        res.end(JSON.stringify({id}));return true;
      }
      if(url.pathname==='/painter/bridge'){
        if(!text(body.session,100))throw Error('Session Painter invalide.');
        clients.set(body.session,Date.now());
        for(const ack of Array.isArray(body.ack)?body.ack:[]){
          const job=jobs.get(ack.id);
          if(job&&job.session===body.session&&job.projectID===ack.projectID){
            jobs.delete(job.id);job.finish(ack);
          }
        }
        res.end(JSON.stringify({needsRegistration:![...bindings.values()].some(b=>b.session===body.session),jobs:[...jobs.values()].filter(j=>j.session===body.session).map(({id,projectID,textureSet,textureSets,image,resourceName,width,height,sha256})=>({id,projectID,textureSet,textureSets,image,resourceName,width,height,sha256}))}));return true;
      }
      if(url.pathname==='/painter/sync'){
        const b=binding(body.documentName);
        if(body.projectID!==b.projectID||typeof body.enabled!=='boolean')throw Error('Association de synchronisation invalide.');
        b.autoEnabled=body.enabled;b.pending=null;clearTimeout(b.autoTimer);b.syncError=null;
        res.end(JSON.stringify({enabled:b.autoEnabled}));return true;
      }
      if(url.pathname==='/painter/target'){
        const b=binding(body.documentName);
        res.end(JSON.stringify({projectID:b.projectID,textureSet:b.textureSet}));return true;
      }
      if(url.pathname==='/painter/return'){
        if(roundtripBusy)throw Error('Un import depuis Painter est en cours. Attends sa confirmation.');
        const result=await transfer(binding(body.documentName),body);
        res.end(JSON.stringify(result));
        return true;
      }
      res.writeHead(404);res.end();return true;
    }
  };
};
