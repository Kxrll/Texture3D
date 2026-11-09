const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
async function run(failCapture=false,wrongDocument=false,transportFailure=false){
 const guide={name:'Repère UV',visible:true};
 const doc={id:1,title:wrongDocument?'Other.psd':'Painter.psd',width:64,height:64,saved:true,layers:[guide]};
 const png=Buffer.alloc(33);png.write('89504e470d0a1a0a',0,'hex');png[24]=8;
 const calls=[],alerts=[];let registered;
 doc.saveAs={png:async()=>{assert.equal(guide.visible,false);if(failCapture)throw Error('Capture failed');}};
 const core={executeAsModal:async callback=>callback({hostControl:{suspendHistory:async()=>1,resumeHistory:async()=>{guide.visible=true;}}})};
 const photoshop={app:{documents:[doc],activeDocument:doc,showAlert:async m=>alerts.push(m)},action:{addNotificationListener(){},removeNotificationListener(){}},core};
 const uxp={entrypoints:{setup:value=>{registered=value;}},storage:{formats:{binary:'binary'},localFileSystem:{getTemporaryFolder:async()=>({createFile:async()=>({read:async()=>png,delete:async()=>{}})})}}};
 const context={require:name=>name==='photoshop'?photoshop:name==='uxp'?uxp:{port:1,token:'test'},btoa:s=>Buffer.from(s,'binary').toString('base64'),setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},console:{error(){},warn(){}},fetch:async(url,options)=>{
  const body=JSON.parse(options.body);calls.push({url,body});
  if(url.endsWith('/painter/target'))return {ok:!wrongDocument,json:async()=>wrongDocument?{error:'Wrong document'}:{projectID:'painter-project'}};
  if(url.endsWith('/painter/return'))return {ok:true,json:async()=>({imported:true,updated:true})};
  if(url.endsWith('/state')&&transportFailure)return {ok:false,json:async()=>({error:'Transport interrompu'})};
  return {ok:true,json:async()=>({commands:[]})};
 }};
 vm.createContext(context);vm.runInContext(fs.readFileSync('main.js','utf8'),context);
 assert.equal(typeof registered.commands.sendToPainter,'function');
 await registered.commands.sendToPainter();
 const sends=calls.filter(c=>c.url.endsWith('/painter/return'));
 if(failCapture||wrongDocument||transportFailure){assert.equal(sends.length,0);assert(alerts.length);}
 else{assert.equal(sends.length,1);assert.equal(sends[0].body.texture.documentName,'Painter.psd');assert.equal(sends[0].body.texture.refreshRequest,sends[0].body.refreshRequest);assert.equal(sends[0].body.projectID,'painter-project');assert.equal(guide.visible,true);}
}
(async()=>{await run();await run(true);await run(false,true);await run(false,false,true);console.log('PASS: Photoshop Painter command captures without guide, waits for delivery, rejects unlinked PSD, failed capture and transport failure.');})().catch(e=>{console.error(e);process.exitCode=1;});
