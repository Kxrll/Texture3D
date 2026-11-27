process.chdir(require('node:path').join(__dirname,'..'));
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('receive-painter-texture.ps1','utf8');const jsx=source.split('$jsx=@"')[1].split('"@')[0];
function run({wrongPath=false,profileMismatch=false}={}){
 const original={name:'Peinture artiste',pixels:'keep'},guide={name:'Repère UV',locked:true};
 const target={name:'Painter_test.psd',fullName:{fsName:wrongPath?'C:/other/test.psd':'C:/owned/Painter_test.psd'},width:{as:()=>2048},height:{as:()=>2048},bitsPerChannel:16,mode:'RGB',colorProfileName:'sRGB',layers:[original,guide]};
 let closed=0;const app={documents:[target],open(){return {width:target.width,height:target.height,bitsPerChannel:16,mode:'RGB',colorProfileName:profileMismatch?'AdobeRGB':'sRGB',activeLayer:{name:'import',duplicate(doc){doc.layers.unshift({name:this.name,pixels:'export'});}},close(){closed++;}};}};
 const context={app,File:function(p){return {fsName:p,exists:true}},SaveOptions:{DONOTSAVECHANGES:0},ElementPlacement:{PLACEATBEGINNING:0}};vm.createContext(context);
 const payload={file:'C:/owned/texture.png',document:'Painter_test.psd',psd:'C:/owned/Painter_test.psd',channel:'BaseColor',expiresAt:Date.now()+60000};
 if(wrongPath||profileMismatch){assert.throws(()=>vm.runInContext(jsx.replace('$payloadJson',JSON.stringify(payload)),context));assert.equal(target.layers.length,2);}
 else for(let i=0;i<3;i++){vm.runInContext(jsx.replace('$payloadJson',JSON.stringify(payload)),context);assert.equal(target.layers.length,i+3);assert(target.layers.includes(original));assert(target.layers.includes(guide));assert.equal(original.pixels,'keep');}
 return closed;
}
assert.equal(run(),3);run({wrongPath:true});run({profileMismatch:true});
console.log('PASS: three received versions preserve artist layers/guides; wrong PSD path and profile mismatch refused (Photoshop simulated).');
