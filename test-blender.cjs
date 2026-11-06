const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const config=require('./companion-config.json');
(async()=>{
 const base='http://127.0.0.1:'+config.port;
 const state=await(await fetch(base+'/state',{headers:{'X-Texture3D-Key':config.token}})).json();
 assert(state.model&&state.texture,'A prepared test project is required');
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage();let refreshed=false,returned=null;const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(base+'/**',async route=>{
   const url=new URL(route.request().url());
   const reply=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   if(url.pathname==='/info')return reply({instanceID:'ui-test',online:true,blenderOnline:true,document:'Test.psd',auto:true,status:'À jour'});
   if(url.pathname==='/revision')return reply({textureVersion:state.textureVersion+(refreshed?1:0)});
   if(url.pathname==='/command'){assert.equal(route.request().postDataJSON().type,'refresh');refreshed=true;return reply({ok:true});}
   if(url.pathname==='/state')return reply({...state,textureVersion:state.textureVersion+(refreshed?1:0)});
   if(url.pathname==='/return-blender'){returned=route.request().postDataJSON();return reply({ok:true,count:2});}
   if(url.pathname==='/export-blender')throw Error('Legacy geometry export must not be called');
   return route.continue();
  });
  await page.goto(base+'/viewer/index.html#token='+config.token);
  await page.waitForFunction(()=>document.getElementById('connection').textContent.includes('Texture à jour'));
  await page.getByRole('button',{name:'Envoyer dans Blender',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('export-status').textContent.includes('2 objet(s) mis à jour'));
  assert.deepEqual(returned,{projectID:state.projectID,textureVersion:state.textureVersion+1});
  assert.deepEqual(errors,[]);
  console.log('PASS: viewer button requests fresh texture and native PNG return, without geometry export.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
