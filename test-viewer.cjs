const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
  const page=await browser.newPage({viewport:{width:600,height:600}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.messages=[];window.postMessage=m=>window.messages.push(m);window.uxpHost=window;});
  await page.goto(pathToFileURL(path.join(__dirname,'viewer/index.html')).href);
  await page.waitForFunction(()=>window.messages.some(m=>m.type==='ready'));
  const before=await page.locator('canvas').screenshot();
  await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=256;c.height=256;
   const ctx=c.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,256,256);
   window.dispatchEvent(new MessageEvent('message',{source:window.uxpHost,data:{type:'texture',seq:1,url:c.toDataURL(),width:256,height:256,bounds:{left:0,top:0,right:256,bottom:256}}}));
  });
  await page.waitForFunction(()=>window.messages.some(m=>m.type==='applied'&&m.seq===1));
  await page.waitForTimeout(100);
  const after=await page.locator('canvas').screenshot();assert(!before.equals(after),'Texture must change cube appearance');
  await page.screenshot({path:path.join(__dirname,'APERCU_TEST.png')});
  await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=64;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='blue';ctx.fillRect(0,0,64,64);
   window.dispatchEvent(new MessageEvent('message',{source:window.uxpHost,data:{type:'texture',seq:2,url:c.toDataURL(),width:256,height:256,bounds:{left:64,top:64,right:128,bottom:128}}}));
  });
  await page.waitForFunction(()=>window.messages.some(m=>m.type==='applied'&&m.seq===2));
  const box=await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x+200,box.y+200);await page.mouse.down();await page.mouse.move(box.x+350,box.y+250,{steps:10});await page.mouse.up();
  assert.equal(await page.locator('#error').textContent(),'');assert.deepEqual(errors,[]);
  console.log('PASS: cube GLB loads, texture updates, cropped texture accepted, orbit controls, no browser errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
