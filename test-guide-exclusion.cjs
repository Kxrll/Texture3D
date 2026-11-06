const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
async function run(failCapture){
 const guide={name:'Repère UV',visible:true},paint={name:'Peinture',visible:true};
 const doc={id:7,title:'test.psd',width:4096,height:2048,saved:true,layers:[guide,paint]};
 let disposed=false,resumed=false,captures=0;const sent=[];
 const png=new Uint8Array(33);png[24]=16;
 doc.saveAs={png:async(file,options,asCopy)=>{assert.equal(guide.visible,false);assert.equal(paint.visible,true);assert.equal(asCopy,true);captures++;if(failCapture)throw Error('Test capture failure');}};
 const storage={formats:{binary:'binary'},localFileSystem:{getTemporaryFolder:async()=>({createFile:async()=>({read:async()=>png.buffer,delete:async()=>{disposed=true;}})})}};
 const core={executeAsModal:async callback=>callback({hostControl:{suspendHistory:async()=>{return {visible:guide.visible,saved:doc.saved};},resumeHistory:async(snapshot,commit)=>{assert.equal(commit,false);guide.visible=snapshot.visible;doc.saved=snapshot.saved;resumed=true;}}})};
 const context={require:name=>name==='photoshop'?{app:{documents:[doc],activeDocument:doc},action:{addNotificationListener(){},removeNotificationListener(){}},core}:name==='uxp'?{entrypoints:{setup(){}},storage}:{port:1,token:'test'},btoa:value=>Buffer.from(value,'binary').toString('base64'),setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},console:{error(){},warn(){}},fetch:async(url,options)=>{if(url.endsWith('/state'))sent.push(JSON.parse(options.body));return {ok:true,json:async()=>({commands:[]})};}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('main.js','utf8'),context);
 await context.update();
 assert.equal(captures,1);assert(resumed);assert.equal(guide.visible,true);assert.equal(doc.saved,true);
 assert(disposed);
 if(!failCapture){const texture=sent.find(m=>m.type==='texture');assert(texture);assert.equal(texture.width,4096);assert.equal(texture.bitDepth,16);assert(texture.url.startsWith('data:image/png;base64,'));}else assert.equal(sent.length,0);
}
(async()=>{await run(false);await run(true);console.log('PASS: visible UV guide excluded from pixels, painting retained, visibility/saved state restored on success and failure.');})().catch(e=>{console.error(e);process.exitCode=1});
