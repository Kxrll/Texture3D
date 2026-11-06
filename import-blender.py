import bpy
import sys
from mathutils import Vector

source, destination = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
if not meshes or any(not obj.data.uv_layers for obj in meshes):
    raise RuntimeError('Le modèle importé doit contenir un maillage avec UV.')
for obj in meshes:
    if any(not obj.data.materials[p.material_index] for p in obj.data.polygons):
        raise RuntimeError('Une face ne possède pas de matériau.')
    obj.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
points = [obj.matrix_world @ Vector(point) for obj in meshes for point in obj.bound_box]
low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.shading.type = 'MATERIAL'
            area.spaces.active.region_3d.view_location = (low + high) / 2
            area.spaces.active.region_3d.view_distance = max((high - low).length * 1.8, 0.1)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=destination)
print('TEXTURE3D_IMPORT_OK')
