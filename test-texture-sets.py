import bpy,sys,tempfile,json
from pathlib import Path
root=Path(__file__).resolve().parent
sys.path.insert(0,str(root/'blender_addon'))
import texture3d_blender as addon
addon.register()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add()
a=bpy.context.object;a.name='Corps'
first=bpy.data.materials.new('Peau');first.use_nodes=True
second=bpy.data.materials.new('Vetements');second.use_nodes=True
first.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.23
a.data.materials.append(first);a.data.materials.append(second)
for f in a.data.polygons:f.material_index=f.index%2
b=a.copy();b.data=a.data.copy();b.name='Autre corps';bpy.context.collection.objects.link(b);b.select_set(True)
b.data.materials.clear();b.data.materials.append(first)
for f in b.data.polygons:f.material_index=0
original={o.name:([(uv.name,[tuple(i.uv) for i in uv.data]) for uv in o.data.uv_layers],[p.material_index for p in o.data.polygons]) for o in [a,b]}
with tempfile.TemporaryDirectory() as tmp:
 folder=Path(tmp)/'Tool';folder.mkdir()
 project,settings=addon.prepare_project(bpy.context,folder,128)
 assert settings['schema']==3 and len(settings['texture_sets'])==2
 assert all(s['resolution']==128 for s in settings['texture_sets'])
 for r in settings['material_regions'].values():assert all(i['scale']==1 and i['x']==0 and i['y']==0 for i in r)
 for texture_set in settings['texture_sets']:
  for repeat in range(2):addon.multi.apply({'projectID':str(project),'image':str(project/texture_set['texture']),'setID':texture_set['id']})
 for o in [a,b]:
  assert original[o.name]==([(uv.name,[tuple(i.uv) for i in uv.data]) for uv in o.data.uv_layers],[p.material_index for p in o.data.polygons]),'UV or slots changed'
 assert a.material_slots[0].material.node_tree.nodes.get('Texture3D BaseColor').image == b.material_slots[0].material.node_tree.nodes.get('Texture3D BaseColor').image
 assert a.material_slots[0].material.node_tree.nodes.get('Texture3D BaseColor').image != a.material_slots[1].material.node_tree.nodes.get('Texture3D BaseColor').image
 assert abs(a.material_slots[0].material.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value-.23)<1e-5
 print('PASS: 2 materials across 2 objects, shared texture, separate texture, original UVs and material slots unchanged after repeated returns.')
addon.unregister()
