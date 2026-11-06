const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const c=require('./companion-config.json');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+c.port+'/viewer/index.html#token='+c.token);
  await page.waitForFunction(()=>document.getElementById('connection').textContent.includes('Texture à jour'));
  for(const size of [{width:1400,height:900},{width:800,height:600},{width:500,height:800},{width:380,height:650}]){
   await page.setViewportSize(size);await page.waitForTimeout(150);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth),'No horizontal overflow');
   assert(await page.getByRole('button',{name:/les commandes/}).isVisible());
   const canvas=await page.locator('canvas').boundingBox();assert(canvas.width>100 && canvas.height>100);
  }
  await page.setViewportSize({width:1400,height:900});
  await page.getByRole('button',{name:'Fond clair',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Fond clair',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Fond sombre',exact:true}).click();
  await page.getByRole('button',{name:'Masquer les commandes',exact:true}).click();assert(await page.locator('#sidebar').isHidden());
  await page.getByRole('button',{name:'Afficher les commandes',exact:true}).click();assert(await page.locator('#sidebar').isVisible());
  await page.getByRole('button',{name:'Plein écran',exact:true}).click();await page.waitForFunction(()=>!!document.fullscreenElement);
  await page.getByRole('button',{name:'Quitter le plein écran',exact:true}).click();await page.waitForFunction(()=>!document.fullscreenElement);
  assert.equal(await page.locator('#model-file, #import-external').count(),0);
  await page.screenshot({path:'APERCU_STUDIO.png'});
  assert.deepEqual(errors,[]);console.log('PASS: responsive 380–1400 px, backgrounds, sidebar, fullscreen, no manual GLB import, no JavaScript errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
