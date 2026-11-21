// Never launch another Painter process when an existing instance is present.
const {execFile}=require('node:child_process');
function isRunning(){
  return new Promise((resolve,reject)=>execFile('tasklist.exe',['/FI','IMAGENAME eq Adobe Substance 3D Painter.exe','/FO','CSV','/NH'],{windowsHide:true,timeout:5000},(error,stdout)=>{
    if(error){reject(Error('Impossible de vérifier si Painter est déjà ouvert. Aucun nouveau lancement effectué.'));return;}
    resolve(stdout.toLowerCase().includes('"adobe substance 3d painter.exe"'));
  }));
}
async function launchIfNeeded({connected,isRunning:check=isRunning,launch}){
  if(connected||await check())return {launched:false};
  await launch();return {launched:true};
}
function currentTarget(receivers,previous,now=Date.now()){
  const projects=new Map();
  for(const receiver of receivers){
    if(now-receiver.seen>5000||!receiver.catalogue?.context)continue;
    projects.set(receiver.catalogue.context,receiver.catalogue);
  }
  if(projects.size>1)throw Error('Plusieurs projets Painter sont ouverts. Garde uniquement le projet destinataire ouvert pour envoyer la texture.');
  if(!projects.size)return null;
  const active=[...projects.values()][0];
  return {context:active.context,uuid:active.uuid,meshSignature:previous?.context===active.context?previous.meshSignature:undefined};
}
module.exports={isRunning,launchIfNeeded,currentTarget};
