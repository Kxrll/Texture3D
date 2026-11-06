const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'texture3d-resume-'));
for(const stage of ['create','resume']){
 const result=spawnSync('C:/Program Files/Blender Foundation/Blender 5.1/blender.exe',['--background','--factory-startup','--python-exit-code','1','--python',path.join(__dirname,'test-project-resume.py'),'--',stage,directory],{encoding:'utf8',windowsHide:true,timeout:60000});
 console.log(result.stdout.trim());if(result.stderr)console.log(result.stderr.trim());
 assert.equal(result.status,0,'Blender '+stage+' stage failed');
}
