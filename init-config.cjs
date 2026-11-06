const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const target=path.join(__dirname,'companion-config.json');
if(!fs.existsSync(target)){
 fs.writeFileSync(target,JSON.stringify({port:18743,token:crypto.randomBytes(32).toString('hex')},null,2)+'\n',{flag:'wx'});
 console.log('Configuration locale créée. Utiliser cette même configuration pour le plugin Photoshop et le service.');
}else console.log('Configuration locale existante conservée.');
