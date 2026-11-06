const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const config=require('./companion-config.json');
const base='http://127.0.0.1:'+config.port;
const headers={'X-Texture3D-Key':config.token,'Content-Type':'application/json'};
(async()=>{
 assert.equal((await fetch(base+'/state')).status,403);
 assert.equal((await fetch(base+'/state',{headers:{...headers,Origin:'https://example.com'}})).status,403);
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1000,height:700}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/viewer/index.html#token='+config.token);
  await page.waitForSelector('canvas');
  await page.waitForFunction(()=>document.getElementById('connection').textContent.includes('Photoshop :'));
  await fetch(base+'/bridge',{method:'POST',headers,body:JSON.stringify({info:{document:'Texture test.psd',status:'Prêt',auto:true},ack:[]})});
  await page.getByRole('button',{name:'Associer le document actif',exact:true}).click();
  const commands=await (await fetch(base+'/bridge',{method:'POST',headers,body:'{}'})).json();
  assert.equal(commands.commands[0].type,'link');
  await fetch(base+'/bridge',{method:'POST',headers,body:JSON.stringify({ack:[commands.commands[0].id]})});
  const remaining=await (await fetch(base+'/bridge',{method:'POST',headers,body:'{}'})).json();
  assert.equal(remaining.commands.length,0);
  const url=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=64;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,64,64);return c.toDataURL('image/jpeg');});
  assert.equal((await fetch(base+'/state',{method:'POST',headers,body:JSON.stringify({type:'texture',seq:100,url,width:64,height:64,bounds:{left:0,top:0,right:64,bottom:64}})})).status,200);
  await page.waitForFunction(()=>document.getElementById('connection').textContent.includes('Texture à jour'));
  for(const [width,height] of [[500,800],[1600,900],[800,500]]){
   await page.setViewportSize({width,height});
   await page.waitForFunction(({height})=>{const r=document.querySelector('canvas').getBoundingClientRect();const v=document.getElementById('viewport').getBoundingClientRect();return r.width===v.width&&r.height===height;},{height});
  }
  await page.getByRole('button',{name:'Masquer les commandes',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('canvas').getBoundingClientRect().width===innerWidth);
  await page.getByRole('button',{name:'Afficher les commandes',exact:true}).click();
  await page.screenshot({path:require('node:path').join(__dirname,'APERCU_INTERFACE_UNIFIEE.png')});
  await page.getByRole('button',{name:'Recentrer',exact:true}).click();
  await page.getByRole('button',{name:'Plein écran',exact:true}).click();
  await page.waitForFunction(()=>!!document.fullscreenElement);
  await page.getByRole('button',{name:'Quitter le plein écran',exact:true}).click();
  await page.waitForFunction(()=>!document.fullscreenElement);
  assert.deepEqual(errors,[]);
  console.log('PASS: authenticated companion, sidebar command and acknowledgment, texture sync, resizing, sidebar toggle, fullscreen');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
