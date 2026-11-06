const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const {spawn}=require('node:child_process');
function png16(width,height){
 function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
 function chunk(type,data){const kind=Buffer.from(type),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([kind,data])));return Buffer.concat([length,kind,data,sum]);}
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=16;header[9]=6;
 const rows=Buffer.alloc(height*(width*8+1));for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*(width*8+1)+1+x*8;rows.writeUInt16BE((x*13)%65536,i);rows.writeUInt16BE(50000,i+2);rows.writeUInt16BE(10000,i+4);rows.writeUInt16BE(65535,i+6);}
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
(async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'texture3d-native-'));
 const config={port:19747,token:require('node:crypto').randomBytes(20).toString('hex')};
 fs.copyFileSync('companion.cjs',path.join(folder,'companion.cjs'));fs.writeFileSync(path.join(folder,'companion-config.json'),JSON.stringify(config));
 const request=(route,body)=>fetch('http://127.0.0.1:'+config.port+route,{method:body===undefined?'GET':'POST',headers:{'X-Texture3D-Key':config.token},body:body===undefined?undefined:JSON.stringify(body)});
 let child;
 async function start(){child=spawn(process.execPath,[path.join(folder,'companion.cjs')],{windowsHide:true,stdio:'ignore'});for(let i=0;i<40;i++){try{const r=await request('/info');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Test server did not start');}
 async function stop(){const ended=new Promise(r=>child.once('exit',r));child.kill();await ended;}
 try{
  await start();
  const bytes=[...fs.readFileSync('assets/cube.glb')];
  await request('/start-project',{bytes,documentName:'test.psd',blenderSession:'A',projectID:'project-native'});
  await request('/blender-bridge',{session:'A',projectID:'project-native'});
  const png=png16(4096,8);
  assert.equal((await request('/state',{type:'texture',url:'data:image/png;base64,'+png.toString('base64'),width:1,height:1,bounds:{left:0,top:0,right:4096,bottom:8}})).status,200);
  const state=await(await request('/state?after=-1')).json();assert.equal(state.texture.width,4096);assert.equal(state.texture.bitDepth,16);
  let pending=request('/return-blender',{projectID:state.projectID,textureVersion:state.textureVersion});
  let job;
  for(let i=0;i<40&&!job;i++){await new Promise(r=>setTimeout(r,40));job=(await(await request('/blender-bridge',{session:'A'})).json()).jobs[0];}
  assert(job);assert.deepEqual(fs.readFileSync(job.image),png,'PNG must reach Blender byte-for-byte');
  await request('/blender-bridge',{session:'A',ack:[{id:job.id,count:2}]});
  assert.equal((await(await pending).json()).count,2);
  assert.equal((await request('/return-blender',{projectID:'wrong',textureVersion:1})).status,500);
  await new Promise(r=>setTimeout(r,500));const first=(await(await request('/info')).json()).instanceID;
  await stop();await start();
  const info=await(await request('/info')).json();assert.notEqual(info.instanceID,first);assert.equal(info.blenderOnline,false);
  const restored=await(await request('/state?after=-1')).json();assert.equal(restored.projectID,state.projectID);assert.equal(restored.texture.url,state.texture.url);
  const ps=await(await request('/bridge',{session:'photoshop-restarted',info:{document:'other.psd',status:'ready',auto:true}})).json();assert.equal(ps.desiredDocument,'test.psd');
  await request('/blender-bridge',{session:'B',projectID:'project-native'});
  assert.equal((await(await request('/info')).json()).blenderOnline,true);
  pending=request('/return-blender',{projectID:state.projectID,textureVersion:state.textureVersion});job=null;
  for(let i=0;i<40&&!job;i++){await new Promise(r=>setTimeout(r,40));job=(await(await request('/blender-bridge',{session:'B'})).json()).jobs[0];}
  assert(job);assert.equal((await(await request('/blender-bridge',{session:'A'})).json()).jobs.length,0);
  await request('/blender-bridge',{session:'B',ack:[{id:job.id,count:2}]});assert.equal((await pending).status,200);
  console.log('PASS: native 4096px/16-bit PNG delivered byte-for-byte, wrong project rejected, cached project restored after restart, Photoshop relink and new Blender session reconnected.');
 }finally{if(child&&child.exitCode===null)await stop();}
})().catch(e=>{console.error(e);process.exitCode=1});
