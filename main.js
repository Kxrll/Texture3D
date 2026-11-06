// Photoshop bridge only. All visible controls live in the standalone viewer.
const { app, action, core } = require('photoshop');
const { entrypoints, storage } = require('uxp');
const companion = require('./companion-config.json');
const companionURL = 'http://127.0.0.1:' + companion.port;
let linkedID=null, documentLabel='Aucun document associé', status='Ouvre la grande fenêtre Texture3D.';
let busy=false, pending=false, timer=null, sequence=0, autoEnabled=true, wasSaved=null;
let textureUpdatedAt=0, stopped=false, bridgeTimer=null, bridgeAck=[];
let lastTexture=null, lastModel=null, connected=false, sending=false;
let capturingPNG=false, desiredDocument=null;
const bridgeSession=String(Date.now())+'-'+Math.random().toString(36).slice(2);
const queuedCommands=[],seenCommands=new Set();
let processingCommands=false;
const outgoing=[];
const setStatus=text=>{status=text;};

async function request(route,body){
  const controller=typeof AbortController==='function'?new AbortController():null;
  const timeout=controller?setTimeout(()=>controller.abort(),route==='/state'?30000:8000):null;
  try{
    const response=await fetch(companionURL+route,{method:'POST',signal:controller?.signal,headers:{'Content-Type':'application/json','X-Texture3D-Key':companion.token},body:JSON.stringify(body||{})});
    if(!response.ok)throw Error('Connexion au viewer : '+response.status);
    return response;
  }finally{if(timeout!==null)clearTimeout(timeout);}
}
async function flush(){
  if(sending)return;
  sending=true;
  try{
    while(outgoing.length){
      const message=outgoing[0];
      await request('/state',message);
      if(outgoing[0]===message)outgoing.shift();
      if(message.type==='texture'){textureUpdatedAt=Date.now();setStatus('Texture à jour · il y a 0 s');}
    }
  }catch(error){connected=false;setStatus('Viewer déconnecté. Relance OUVRIR_VIEWER.vbs.');}
  finally{sending=false;}
}
function send(message){
  if(message.type==='texture')lastTexture=message;
  if(message.type==='model')lastModel=message;
  const index=outgoing.findIndex(item=>item.type===message.type);
  if(index>=0)outgoing.splice(index,1);
  outgoing.push(message);
  return flush();
}
async function update(){
  if(busy){pending=true;return;}
  const doc=Array.from(app.documents).find(d=>d.id===linkedID);
  if(!doc){setStatus('Associe ton document Photoshop depuis la grande fenêtre.');return;}
  busy=true;
  let tempFile;
  try{
    setStatus('Lecture de la texture…');
    const width=Number(doc.width),height=Number(doc.height);
    if(Math.max(width,height)>8192)throw Error('Texture limitée à 8192 px dans cette version. Le PSD reste intact.');
    const temporary=await storage.localFileSystem.getTemporaryFolder();
    tempFile=await temporary.createFile('texture-'+doc.id+'-'+Date.now()+'.png',{overwrite:true});
    capturingPNG=true;
    const capture=await core.executeAsModal(async executionContext=>{
      const guides=[];
      function findGuides(layers){for(const layer of layers){if(layer.name==='Repère UV'&&layer.visible)guides.push(layer);if(layer.layers)findGuides(layer.layers);}}
      findGuides(doc.layers);
      let suspension=null;
      try{
        if(guides.length){
          suspension=await executionContext.hostControl.suspendHistory({documentID:doc.id,name:'Préparer la texture sans repère UV'});
          for(const guide of guides)guide.visible=false;
        }
        await doc.saveAs.png(tempFile,{compression:6,interlaced:false},true);
        const bytes=new Uint8Array(await tempFile.read({format:storage.formats.binary}));
        if(bytes.byteLength>128*1024*1024)throw Error('Le PNG dépasse 128 Mo. Réduis la résolution de la texture.');
        const chunks=[];
        for(let offset=0;offset<bytes.length;offset+=16384)chunks.push(String.fromCharCode(...bytes.subarray(offset,offset+16384)));
        return {base64:btoa(chunks.join('')),bitDepth:bytes[24]};
      }finally{
        // Roll back temporary visibility, including the document's saved state.
        if(suspension!==null)await executionContext.hostControl.resumeHistory(suspension,false);
      }
    },{commandName:'Actualiser l’aperçu 3D',timeOut:3000});
    capturingPNG=false;
    await send({type:'texture',documentName:doc.title,seq:++sequence,url:'data:image/png;base64,'+capture.base64,width,height,bitDepth:capture.bitDepth,bounds:{left:0,top:0,right:width,bottom:height}});
  }catch(error){setStatus('Erreur : '+error.message);console.error(error);}
  finally{capturingPNG=false;if(tempFile)try{await tempFile.delete();}catch(_){}wasSaved=doc.saved;busy=false;if(pending){pending=false;queueUpdate();}}
}
function queueUpdate(){clearTimeout(timer);timer=setTimeout(update,250);}
function link(documentName){
  if(!app.documents.length){setStatus('Ouvre d’abord ta texture dans Photoshop.');return;}
  const doc=typeof documentName==='string'?(app.activeDocument.title===documentName?app.activeDocument:Array.from(app.documents).find(d=>d.title===documentName)):app.activeDocument;
  if(!doc)throw Error('Le PSD du projet est introuvable : '+documentName);
  linkedID=doc.id;wasSaved=doc.saved;documentLabel='Texture : '+doc.title;queueUpdate();
  desiredDocument=doc.title;
}
function onSave(event,descriptor){
  // Save-a-copy PNG notifications belong to our export, not a new PSD save.
  if(capturingPNG||/png/i.test(descriptor?.as?._obj||''))return;
  if(autoEnabled&&linkedID!==null)queueUpdate();
}
async function openViewer(){
  try{await request('/open');if(linkedID===null)link();else queueUpdate();}
  catch(error){setStatus('Relance OUVRIR_VIEWER.vbs pour ouvrir la grande fenêtre.');console.error(error);}
}
entrypoints.setup({commands:{texture3d:openViewer},plugin:{create(){},destroy(){
  stopped=true;clearTimeout(bridgeTimer);clearTimeout(timer);clearInterval(saveMonitor);
  action.removeNotificationListener(['save'],onSave);
}}});
Promise.resolve(action.addNotificationListener(['save'],onSave)).catch(e=>console.warn(e.message));
const saveMonitor=setInterval(()=>{
  if(busy)return;
  if(textureUpdatedAt&&status.indexOf('Texture à jour ·')===0){
    const seconds=Math.floor((Date.now()-textureUpdatedAt)/1000);
    const age=seconds<60?seconds+' s':seconds<3600?Math.floor(seconds/60)+' min':Math.floor(seconds/3600)+' h';
    setStatus('Texture à jour · il y a '+age);
  }
  try{
    const doc=Array.from(app.documents).find(d=>d.id===linkedID);
    if(!doc){wasSaved=null;return;}
    if(autoEnabled&&wasSaved===false&&doc.saved===true)queueUpdate();
    wasSaved=doc.saved;
  }catch(error){/* Photoshop can be busy with an interactive command. */}
},500);
async function pollBridge(){
  try{
    const acknowledged=bridgeAck.slice();
    const response=await request('/bridge',{session:bridgeSession,info:{document:documentLabel,status,auto:autoEnabled,busy},ack:acknowledged});
    bridgeAck=bridgeAck.filter(id=>!acknowledged.includes(id));
    if(!connected){connected=true;if(lastModel)await send(lastModel);if(lastTexture)await send(lastTexture);}
    const payload=await response.json();
    if(payload.desiredDocument)desiredDocument=payload.desiredDocument;
    if(desiredDocument){
      const doc=Array.from(app.documents).find(d=>d.title===desiredDocument);
      if(doc&&doc.id!==linkedID)link(desiredDocument);
      else if(!doc){linkedID=null;documentLabel='Texture : '+desiredDocument;setStatus('Rouvre '+desiredDocument+' dans Photoshop pour reconnecter le projet.');}
    }
    for(const command of payload.commands||[])if(!seenCommands.has(command.id)){seenCommands.add(command.id);queuedCommands.push(command);}
    processCommands();
  }catch(error){connected=false;}
  if(!stopped)bridgeTimer=setTimeout(pollBridge,500);
}
async function processCommands(){
  if(processingCommands)return;
  processingCommands=true;
  try{
    while(queuedCommands.length&&!stopped){
      const command=queuedCommands.shift();
      try{
        if(command.type==='link'){await core.executeAsModal(async()=>{const doc=Array.from(app.documents).find(d=>d.title===command.documentName);if(doc)app.activeDocument=doc;},{commandName:'Choisir le matériau'});link(command.documentName);}
        if(command.type==='refresh')await update();
        if(command.type==='auto')autoEnabled=!!command.enabled;
        if(command.type==='importModel')await send({type:'model',bytes:command.bytes,name:command.name});
      }catch(error){setStatus('Erreur : '+error.message);}
      bridgeAck.push(command.id);
    }
  }finally{processingCommands=false;}
}
if(app.documents.length)link();
pollBridge();
