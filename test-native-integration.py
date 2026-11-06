"""Real Blender -> installed Photoshop -> PNG -> same Blender scene integration."""
import bpy
import json
from pathlib import Path
import subprocess
import sys
import threading
import time
import urllib.request
root=Path(__file__).resolve().parent
sys.path.insert(0,str(root/'blender_addon'))
import texture3d_blender as addon
addon.register()
obj=bpy.context.active_object
obj.name='Texture3D_Test_Integration'
first=obj.active_material
first.use_nodes=True
shader=next(n for n in first.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
shader.inputs['Metallic'].default_value=0.75
shader.inputs['Roughness'].default_value=0.21
shader.inputs['Base Color'].default_value=(0.8,0.05,0.03,1)
second=bpy.data.materials.new('Second materiau')
second.use_nodes=True
next(n for n in second.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color'].default_value=(0.03,0.08,0.8,1)
obj.data.materials.append(second)
for face in obj.data.polygons:face.material_index=face.index%2
project,settings=addon.prepare_project(bpy.context,root,128)
addon.launch_project(root,project,settings)
config=json.loads((root/'companion-config.json').read_text(encoding='utf-8-sig'))
def request(route,body=None):
    req=urllib.request.Request('http://127.0.0.1:'+str(config['port'])+route,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'X-Texture3D-Key':config['token'],'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=45) as response:return json.load(response)
for attempt in range(100):
    addon.multi.receive()
    info=request('/info')
    if settings['document'] in info['document'] and info['online'] and info['blenderOnline']:break
    time.sleep(0.2)
else:raise RuntimeError('Real project connection failed: '+str(info))
for _ in range(100):
    state=request('/state')
    if len(state.get('textures',{}))==2 and state['texture'].get('setID')=='set_0':break
    addon.multi.receive();time.sleep(.2)
time.sleep(1)
result=subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(root/'test-native-ps.ps1'),'-PSDPath',str(project/settings['document'])],capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW)
if result.returncode:raise RuntimeError(result.stderr.decode(errors='replace'))
initial=request('/revision')
request('/command',{'type':'refresh'})
for attempt in range(150):
    addon.multi.receive()
    state=request('/revision')
    if state['textureVersion']>initial['textureVersion']:break
    time.sleep(0.2)
else:raise RuntimeError('Native PNG capture timed out: '+str(request('/info')))
snapshot=request('/state?after=-1')
assert snapshot['texture']['width']==4096 and snapshot['texture']['bitDepth']==16
outcome={}
def send():
    try:outcome['result']=request('/return-blender',{'projectID':str(project),'textureVersion':snapshot['textureVersion'],'setID':snapshot['texture'].get('setID')})
    except Exception as error:outcome['error']=str(error)
threading.Thread(target=send,daemon=True).start()
for attempt in range(200):
    addon.multi.receive()
    if outcome:break
    time.sleep(0.2)
assert 'error' not in outcome,outcome
assert outcome.get('result',{}).get('count')==1,outcome
image=next(n.image for n in obj.active_material.node_tree.nodes if n.name=='Texture3D BaseColor')
assert tuple(image.size)==(4096,256)
assert image.packed_file and bytes(image.packed_file.data)[24]==16
shader=next(n for n in obj.active_material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
assert abs(shader.inputs['Metallic'].default_value-0.75)<1e-5
assert abs(shader.inputs['Roughness'].default_value-0.21)<1e-5
assert len(obj.data.materials)==2
print('PASS: REAL Blender multi-material project -> installed Photoshop -> native 4096px/16-bit PNG -> original Blender object; metal/roughness preserved, image packed at 16 bits, no geometry reimport.')
addon.unregister()
