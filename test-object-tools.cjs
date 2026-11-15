const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
function fixture(){
 const input=fs.readFileSync('assets/cube.glb'),length=input.readUInt32LE(12),json=JSON.parse(input.subarray(20,20+length));
 json.nodes=[{mesh:0,name:'Corps_MatA',extras:{texture3d_source_id:'body',texture3d_source_name:'Corps'}},{mesh:0,name:'Corps_MatB',extras:{texture3d_source_id:'body',texture3d_source_name:'Corps'}},{mesh:0,name:'Accessoire',translation:[4,0,0],extras:{texture3d_source_id:'extra',texture3d_source_name:'Accessoire'}}];json.scenes[0].nodes=[0,1,2];
 let text=JSON.stringify(json);text+=' '.repeat((4-Buffer.byteLength(text)%4)%4);const chunk=Buffer.from(text),tail=input.subarray(20+length),header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(20+chunk.length+tail.length,8);header.writeUInt32LE(chunk.length,12);header.write('JSON',16);return Buffer.concat([header,chunk,tail]);
}
(async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/info')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({online:false,textureSets:[],document:'Test.psd',instanceID:'test'}));return;}
  if(req.url.startsWith('/painter/info')){res.end('{}');return;}
  if(req.url.startsWith('/state')){res.writeHead(204);res.end();return;}
  const name=req.url.split('?')[0];if(!['/viewer/index.html','/viewer/viewer.js','/viewer/icon.ico'].includes(name)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.html')?'text/html':'image/x-icon');res.end(fs.readFileSync(path.join(__dirname,name.endsWith('.ico')?'assets/texture3d.ico':name)));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1400,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/viewer/index.html#token=test`);
  await page.waitForFunction(()=>document.querySelectorAll('.object-row').length===1);
  await page.evaluate(bytes=>window.postMessage({type:'model',bytes},'*'),[...fixture()]);
  await page.waitForFunction(()=>document.querySelectorAll('.object-row').length===2);
  const sendTexture=async(color)=>page.evaluate(color=>{const c=document.createElement('canvas');c.width=256;c.height=128;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,256,128);window.postMessage({type:'texture',seq:Date.now(),url:c.toDataURL(),width:256,height:128,bounds:{left:0,top:0,right:256,bottom:128}},'*');},color);
  await sendTexture('#ffc044');await page.waitForTimeout(200);
  await page.getByRole('button',{name:'Corps',exact:true}).click();await page.locator('#isolate-object').click();
  assert.equal(await page.locator('[data-object-id="extra"] .object-eye').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('[data-object-id="body"] .object-eye').getAttribute('aria-pressed'),'true');
  await page.locator('#locate-uv').click();
  assert(+(await page.locator('#uv-preview').getAttribute('data-uv-triangles'))>0,'Selected object UV layout must be visible before a surface click');
  const box=await page.locator('#viewport canvas').boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
  await page.mouse.click(cx-70,cy+35);await page.waitForFunction(()=>document.getElementById('uv-preview').dataset.u!==undefined);
  const marker=await page.locator('#uv-preview').evaluate(c=>({...c.dataset}));assert(+marker.u>=0&&+marker.u<=1&&+marker.v>=0&&+marker.v<=1);assert(+marker.pixelX<256&&+marker.pixelY<128);
  await page.evaluate(()=>{const c=document.createElement('canvas');c.width=256;c.height=128;const x=c.getContext('2d');x.fillStyle='#ff0000';x.fillRect(0,0,256,64);x.fillStyle='#0000ff';x.fillRect(0,64,256,64);window.postMessage({type:'texture',seq:Date.now(),url:c.toDataURL(),width:256,height:128,bounds:{left:0,top:0,right:256,bottom:128}},'*');});await page.waitForTimeout(200);
  const shot=await page.locator('#viewport canvas').screenshot();
  const rgb=await page.evaluate(async data=>{const image=new Image();image.src=data;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);return [...x.getImageData(Math.floor(c.width/2)-70,Math.floor(c.height/2)+35,1,1).data];},'data:image/png;base64,'+shot.toString('base64'));
  assert(+marker.v<.5?rgb[0]>200&&rgb[2]<30:rgb[2]>200&&rgb[0]<30,'UV vertical orientation must match the visible model texture');
  const before=await page.locator('#uv-preview').screenshot();await sendTexture('#3388dd');await page.waitForTimeout(200);const after=await page.locator('#uv-preview').screenshot();assert(!before.equals(after),'UV preview must track texture refresh');
  assert.equal(await page.locator('[data-object-id="extra"] .object-eye').getAttribute('aria-pressed'),'false');
  await page.locator('#uv-focus').click();await page.locator('#uv-plus').click();await page.locator('#uv-reset').click();await page.locator('#close-uv').click();
  await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+100,cy+30,{steps:10});await page.mouse.up();assert.equal(await page.locator('.object-name[aria-pressed=true]').textContent(),'Corps');
  await page.locator('[data-object-id="body"] .object-eye').click();await page.mouse.click(cx,cy);assert.equal(await page.locator('.object-name[aria-pressed=true]').count(),0,'Hidden objects cannot be picked');
  await page.locator('#show-all-objects').click();assert.equal(await page.locator('.object-eye[aria-pressed=true]').count(),2);
  await page.getByRole('button',{name:'Corps',exact:true}).click();await page.locator('#isolate-object').click();await page.mouse.click(cx,cy);
  await page.locator('#locate-uv').click();await page.screenshot({path:'APERCU_OBJETS_UV.png'});
  for(const width of [800,380]){await page.setViewportSize({width,height:850});await page.waitForTimeout(100);assert(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth),'Responsive overflow');}
  await page.evaluate(bytes=>window.postMessage({type:'model',bytes},'*'),[...fs.readFileSync('assets/cube.glb')]);await page.waitForFunction(()=>document.querySelectorAll('.object-row').length===1);assert.equal(await page.locator('.object-name[aria-pressed=true]').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: source-object grouping, isolation, visibility, picking vs drag, UV preview refresh/zoom, responsive layout, model reset.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
