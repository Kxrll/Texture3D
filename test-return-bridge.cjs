const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'texture3d-bridge-'));
 const config={port:19746,token:require('node:crypto').randomBytes(20).toString('hex')};
 for(const name of ['companion.cjs','painter-bridge.cjs'])fs.copyFileSync(name,path.join(dir,name));
 fs.writeFileSync(path.join(dir,'companion-config.json'),JSON.stringify(config));
 const child=spawn(process.execPath,[path.join(dir,'companion.cjs')],{windowsHide:true,stdio:'ignore'});
 const request=(route,body)=>fetch('http://127.0.0.1:'+config.port+route,{method:body===undefined?'GET':'POST',headers:{'X-Texture3D-Key':config.token},body:body===undefined?undefined:JSON.stringify(body)});
 try{
  for(let i=0;i<40;i++){try{await request('/info');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  const bytes=[...fs.readFileSync('assets/cube.glb')];
  assert.equal((await request('/start-project',{bytes,documentName:'test.psd',blenderSession:'A',projectID:'projectA'})).status,200);
  await request('/blender-bridge',{session:'A'});
  const pending=fetch('http://127.0.0.1:'+config.port+'/export-blender',{method:'POST',headers:{'X-Texture3D-Key':config.token},body:Buffer.from(bytes)});
  let job;
  for(let i=0;i<30&&!job;i++){await new Promise(r=>setTimeout(r,50));job=(await(await request('/blender-bridge',{session:'A'})).json()).jobs[0];}
  assert(job);assert.equal(job.projectID,'projectA');assert(fs.existsSync(job.glb));
  assert.equal((await(await request('/blender-bridge',{session:'B'})).json()).jobs.length,0);
  await request('/blender-bridge',{session:'A',ack:[{id:job.id,count:2}]});
  const response=await pending;assert.equal(response.status,200);assert.equal((await response.json()).count,2);
  console.log('PASS: return routed to originating Blender session, isolated from other windows, acknowledged before success.');
 }finally{child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
