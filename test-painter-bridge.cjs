// Isolated HTTP integration: document/session routing and byte-for-byte PNG import.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
(async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'texture3d-painter-'));
 const config={port:19853,token:require('node:crypto').randomUUID()};
 for(const name of ['companion.cjs','painter-bridge.cjs'])fs.copyFileSync(name,path.join(folder,name));
 fs.writeFileSync(path.join(folder,'companion-config.json'),JSON.stringify(config));
 const child=spawn(process.execPath,[path.join(folder,'companion.cjs')],{windowsHide:true,stdio:'ignore'});
 const request=(route,body,key=config.token)=>fetch('http://127.0.0.1:'+config.port+route,{method:body===undefined?'GET':'POST',headers:{'X-Texture3D-Key':key},body:body===undefined?undefined:JSON.stringify(body)});
 try{
  for(let i=0;i<40;i++){try{if((await request('/info')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const bytes=[...fs.readFileSync('assets/cube.glb')];
  await request('/start-project',{bytes,documentName:'Blender.psd',projectID:'blender',blenderSession:'blender-session'});
  const initial=await(await request('/state')).json();
  const binding={session:'Painter-A',projectID:'painter-a-body',documentName:'Painter_A.psd',textureSet:'Texture commune',textureSets:['Body','Hat'],width:32,height:16};
  assert.equal((await request('/painter/start',binding,'wrong')).status,403);
  assert.equal((await request('/painter/start',binding)).status,200);
  assert.equal((await request('/painter/start',{...binding,session:'Painter-B'})).status,500,'Live binding must not be stolen');
  assert.equal((await request('/painter/target',{documentName:'wrong.psd'})).status,500);
  const png=Buffer.from('89504e470d0a1a0a0000000d494844520000002000000010080600000000000000','hex');
  const texture={type:'texture',documentName:binding.documentName,url:'data:image/png;base64,'+png.toString('base64'),refreshRequest:'fresh-1'};
  await request('/state',texture);
  const after=await(await request('/state')).json();
  assert.equal(after.projectID,initial.projectID);assert.equal(after.textureVersion,initial.textureVersion);assert.equal(after.texture,null);
  const payload={documentName:binding.documentName,projectID:binding.projectID,texture,refreshRequest:'fresh-1'};
  assert.equal((await request('/painter/return',{...payload,projectID:'wrong'})).status,500);
  assert.equal((await request('/painter/return',{...payload,refreshRequest:'stale'})).status,500);
  const tooWide=Buffer.from(png);tooWide.writeUInt32BE(64,16);
  assert.equal((await request('/painter/return',{...payload,texture:{...texture,url:'data:image/png;base64,'+tooWide.toString('base64')}})).status,500);
  let previousName;
  for(let repeat=0;repeat<2;repeat++){
   const pending=request('/painter/return',payload);
   let job;
   for(let i=0;i<40&&!job;i++){await new Promise(r=>setTimeout(r,25));job=(await(await request('/painter/bridge',{session:binding.session})).json()).jobs[0];}
   assert(job);assert.deepEqual(fs.readFileSync(job.image),png);assert.deepEqual(job.textureSets,['Body','Hat']);
   if(previousName)assert.equal(job.resourceName,previousName,'Repeat sends must share a resource name');
   previousName=job.resourceName;
   assert.equal((await(await request('/painter/bridge',{session:'Painter-B'})).json()).jobs.length,0);
   await request('/painter/bridge',{session:'Painter-B',ack:[{id:job.id,projectID:job.projectID}]});
   assert.equal((await(await request('/painter/bridge',{session:binding.session})).json()).jobs.length,1,'Wrong session must not acknowledge');
   await request('/painter/bridge',{session:binding.session,ack:[{id:job.id,projectID:job.projectID,updated:repeat>0}]});
   const response=await pending;assert.equal(response.status,200);assert.equal((await response.json()).updated,repeat>0);
   assert(!fs.existsSync(job.image),'Transfer cache should be removed after import');
  }
  const pending=request('/painter/return',payload);let job;
  for(let i=0;i<40&&!job;i++){await new Promise(r=>setTimeout(r,25));job=(await(await request('/painter/bridge',{session:binding.session})).json()).jobs[0];}
  await request('/painter/bridge',{session:binding.session,ack:[{id:job.id,projectID:job.projectID,error:'Projet fermé'}]});
  assert.equal((await pending).status,500);assert(!fs.existsSync(job.image));
  console.log('PASS: Painter fresh PNG, stable resource name, acknowledgements, errors, wrong project/session/size rejection, cache cleanup, Blender isolation.');
 }finally{child.kill();await new Promise(r=>child.exitCode===null?child.once('exit',r):r());fs.rmSync(folder,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
