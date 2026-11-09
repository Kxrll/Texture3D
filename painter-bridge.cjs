// Painter transfers are separate from Blender's model, texture and session state.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function createPainterBridge(root,{readJSON,queueDocument,openViewer,queueCommand,getInfo}){
  const bindings=new Map(),clients=new Map(),jobs=new Map();
  let activeDocument=null;
  let model=null,texture=null,revision=0,modelVersion=0,textureVersion=0;
  const online=b=>b&&Date.now()-(clients.get(b.session)||0)<10000;
  function binding(documentName){
    const b=bindings.get(documentName);
    if(!b)throw Error('Ce PSD n’est pas associé à Painter. Lance « Peindre dans Photoshop » depuis Painter.');
    if(!online(b))throw Error('Painter est déconnecté. Active son plugin Texture3D et reprends ce matériau.');
    return b;
  }
  function text(value,max=255){return typeof value==='string'&&value.length>0&&value.length<=max;}
  return {
    get activeDocument(){return activeDocument;},
    deactivate(){activeDocument=null;},
    ownsDocument(name){return bindings.has(name);},
    capture(message){
      if(message.documentName!==activeDocument)return;
      texture={...message,updatedAt:Date.now()};textureVersion=++revision;
    },
    async handle(req,res,url){
      if(!url.pathname.startsWith('/painter/'))return false;
      const active=bindings.get(activeDocument);
      if(req.method==='GET'){
        res.setHeader('Content-Type','application/json');
        if(url.pathname==='/painter/info'){res.end(JSON.stringify({...getInfo(),blenderOnline:online(active),painterOnline:online(active),activeDocument,textureSets:active?[{document:activeDocument,name:active.textureSet}]:[]}));return true;}
        if(url.pathname==='/painter/revision'){res.end(JSON.stringify({instanceID:getInfo().instanceID,projectID:active?.projectID,revision,textureVersion,commandResults:getInfo().commandResults}));return true;}
        if(url.pathname==='/painter/state'){
          const after=Number(url.searchParams.get('after')??-1);
          if(after===revision){res.writeHead(204);res.end();return true;}
          res.end(JSON.stringify({projectID:active?.projectID,revision,modelVersion,textureVersion,model:after<modelVersion||after<0?model:undefined,texture:after<textureVersion||after<0?texture:undefined}));return true;
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
        const old=bindings.get(body.documentName);
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
        const b={session:body.session,projectID:body.projectID,documentName:body.documentName,textureSet:body.textureSet,textureSets,width:body.width,height:body.height};
        bindings.set(b.documentName,b);clients.set(b.session,Date.now());activeDocument=b.documentName;
        if(!body.resume||!old||old.projectID!==b.projectID){model=nextModel;modelVersion=++revision;texture=null;textureVersion=++revision;}
        if(nextModel&&!body.resume)openViewer('painter');
        queueDocument(b.documentName);res.end(JSON.stringify({projectID:b.projectID}));return true;
      }
      if(url.pathname==='/painter/command'){
        if(!getInfo().online){res.writeHead(503);res.end();return true;}
        if(!['link','refresh','auto'].includes(body.type))throw Error('Commande Painter invalide.');
        if(body.type==='link'){body.documentName=activeDocument;binding(activeDocument);}
        res.end(JSON.stringify({id:queueCommand(body)}));return true;
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
        res.end(JSON.stringify({needsRegistration:![...bindings.values()].some(b=>b.session===body.session),jobs:[...jobs.values()].filter(j=>j.session===body.session).map(({id,projectID,textureSet,textureSets,image,resourceName,width,height})=>({id,projectID,textureSet,textureSets,image,resourceName,width,height}))}));return true;
      }
      if(url.pathname==='/painter/target'){
        const b=binding(body.documentName);
        res.end(JSON.stringify({projectID:b.projectID,textureSet:b.textureSet}));return true;
      }
      if(url.pathname==='/painter/return'){
        const b=binding(body.documentName),texture=body.texture;
        if(body.projectID!==b.projectID)throw Error('Le projet Painter a changé. Reprends la liaison.');
        if(!text(body.refreshRequest,100)||texture?.refreshRequest!==body.refreshRequest||texture.documentName!==b.documentName)
          throw Error('La capture Photoshop ne correspond pas à cet envoi.');
        if([...jobs.values()].some(j=>j.projectID===b.projectID))throw Error('Un envoi vers ce matériau est déjà en cours.');
        if(typeof texture.url!=='string'||!texture.url.startsWith('data:image/png;base64,'))throw Error('La peinture doit être un PNG.');
        const png=Buffer.from(texture.url.slice(22),'base64');
        if(png.length<33||png.length>128*1024*1024||png.toString('hex',0,8)!=='89504e470d0a1a0a'||png.toString('ascii',12,16)!=='IHDR')throw Error('PNG Painter invalide.');
        if(png.readUInt32BE(16)!==b.width||png.readUInt32BE(20)!==b.height)throw Error('La taille du PSD a changé. Garde la résolution du guide UV.');
        const folder=path.join(root,'cache-textures');fs.mkdirSync(folder,{recursive:true});
        const id=crypto.randomUUID(),name='Texture3D_'+crypto.createHash('sha256').update(b.projectID).digest('hex').slice(0,20);
        const image=path.join(folder,name+'-'+crypto.randomUUID()+'.png');
        fs.writeFileSync(image,png,{flag:'wx'});
        let result;
        try{
          result=await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>{jobs.delete(id);reject(Error('Painter ne répond pas. Vérifie son panneau Texture3D.'));},30000);
            jobs.set(id,{id,...b,image,resourceName:name,finish(ack){clearTimeout(timer);ack.error?reject(Error(String(ack.error))):resolve(ack);}});
          });
        }finally{fs.rmSync(image,{force:true});}
        res.end(JSON.stringify({imported:true,resourceName:name,updated:!!result.updated}));
        return true;
      }
      res.writeHead(404);res.end();return true;
    }
  };
};
