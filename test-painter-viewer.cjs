// Real headless viewer with an isolated Painter bridge; no Adobe project modified.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'texture3d-painter-viewer-'));
 let bridge,commandID=0,opened=false,returned=false;
 const readJSON=async req=>{const chunks=[];for await(const c of req)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString()||'{}');};
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/info'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({document:'Texture : Painter_Body.psd'}));return;}
   if(url.pathname.startsWith('/viewer/')){const filename=path.join(__dirname,url.pathname.slice(1));res.setHeader('Content-Type',filename.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(filename));return;}
   if(await bridge.handle(req,res,url))return;
   res.writeHead(404);res.end();
  }catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}
 });
 let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const binding={session:'Painter',projectID:'Body',documentName:'Painter_Body.psd',textureSet:'Body',width:64,height:64,bytes:[...fs.readFileSync('assets/cube.glb')],name:'Painter_Body.glb'};
  let png;
  bridge=require('./painter-bridge.cjs')(root,{readJSON,queueDocument(){},openViewer(source){assert.equal(source,'painter');opened=true;},getInfo(){return {online:true,instanceID:'test',document:'Texture : Painter_Body.psd',status:'Prêt',auto:true};},queueCommand(command){
   const id=++commandID;
   if(command.type==='refresh')bridge.capture({documentName:binding.documentName,refreshRequest:id,url:png,width:64,height:64,bounds:{left:0,top:0,right:64,bottom:64}});
   return id;
  }});
  const request=async(route,body)=>fetch(base+route,{method:'POST',body:JSON.stringify(body)});
  assert.equal((await request('/painter/start',binding)).status,200);assert(opened);
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/viewer/index.html#token=test');
  await page.waitForURL(/source=painter/);
  await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Painter_Body.glb');
  await page.waitForTimeout(400);
  const before=await page.locator('#viewport canvas').screenshot();
  png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#f00';ctx.fillRect(0,0,64,64);return c.toDataURL();});
  bridge.capture({documentName:binding.documentName,url:png,width:64,height:64,bounds:{left:0,top:0,right:64,bottom:64}});
  await page.waitForTimeout(900);
  assert(!before.equals(await page.locator('#viewport canvas').screenshot()),'Photoshop update must repaint Painter model');
  assert.equal((await page.locator('#blender').textContent()).trim(),'Envoyer dans Painter');
  const poll=setInterval(async()=>{
   const response=await request('/painter/bridge',{session:binding.session});
   for(const job of (await response.json()).jobs){assert(fs.existsSync(job.image));returned=true;await request('/painter/bridge',{session:binding.session,ack:[{id:job.id,projectID:job.projectID,updated:true}]});}
  },100);
  try{await page.locator('#blender').click();await page.waitForFunction(()=>document.getElementById('export-status').textContent==='Peinture importée dans Painter.');}finally{clearInterval(poll);}
  assert(returned);assert.deepEqual(errors,[]);
  console.log('PASS: Painter viewer opens with source model, updates texture, labels Painter return and completes acknowledged import.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
