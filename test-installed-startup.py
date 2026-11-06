"""Real cold-start smoke test; creates only a fresh test project and starts Photoshop/viewer."""
import bpy
from pathlib import Path
import sys
import json
import time
import urllib.request
root=Path(__file__).resolve().parent
sys.path.insert(0,str(root/'blender_addon'))
import texture3d_blender as addon
addon.register()
bpy.context.active_object.name='Test_demarrage_automatique'
project,settings=addon.prepare_project(bpy.context,root,128)
addon.launch_project(root,project,settings)
config=json.loads((root/'companion-config.json').read_text(encoding='utf-8-sig'))
def get(route):
    req=urllib.request.Request('http://127.0.0.1:'+str(config['port'])+route,headers={'X-Texture3D-Key':config['token']})
    with urllib.request.urlopen(req,timeout=5) as response:
        return json.load(response)
for attempt in range(60):
    info=get('/info')
    state=get('/state?after=-1')
    if info['online'] and settings['document'] in info['document'] and state.get('texture') and state.get('model',{}).get('name')==settings['name']+'.glb':
        print('PASS: installed plugin autostarted, Photoshop connected, Blender project linked, texture received. No UDT load used.')
        (root/'last-startup-test.json').write_text(json.dumps({'project':str(project),'document':settings['document'],'textureVersion':state['textureVersion']}),encoding='utf-8')
        break
    time.sleep(0.5)
else:
    raise RuntimeError('Installed startup failed: '+str(info))
addon.unregister()
