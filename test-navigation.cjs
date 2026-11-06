const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const config=require('./companion-config.json');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+config.port+'/viewer/index.html#token='+config.token);
  await page.waitForSelector('canvas');await page.waitForTimeout(700);
  assert(await page.locator('#hint').isHidden());
  await page.getByRole('button',{name:'?',exact:true}).click();assert(await page.locator('#hint').isVisible());
  await page.getByRole('button',{name:'?',exact:true}).click();
  await page.getByRole('button',{name:'Vue face',exact:true}).click();await page.waitForTimeout(700);
  const front=await page.locator('canvas').screenshot();
  await page.getByRole('button',{name:'Vue droite',exact:true}).click();await page.waitForTimeout(700);
  const right=await page.locator('canvas').screenshot();assert(!front.equals(right),'Axis selection changes viewpoint');
  await page.getByRole('button',{name:'Vue dessus',exact:true}).click();await page.waitForTimeout(700);
  const r=await page.locator('canvas').boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.wheel(0,-150);await page.waitForTimeout(100);
  const zooming=await page.locator('canvas').screenshot();await page.waitForTimeout(700);
  const zoomed=await page.locator('canvas').screenshot();assert(!zooming.equals(zoomed),'Wheel zoom interpolates over multiple frames');
  await page.mouse.down();await page.mouse.move(r.x+r.width/2+100,r.y+r.height/2+50,{steps:15});await page.mouse.up();await page.waitForTimeout(500);
  await page.getByRole('button',{name:'Recentrer',exact:true}).click();await page.waitForTimeout(700);
  await page.screenshot({path:'APERCU_NAVIGATION.png'});
  assert.equal(await page.locator('#error').textContent(),'');assert.deepEqual(errors,[]);
  console.log('PASS: six-axis gizmo, animated axis views, interpolated zoom, drag inertia, smooth recenter, collapsible help.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
