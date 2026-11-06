import bpy
import json
from pathlib import Path
import sys
import tempfile
sys.path.insert(0, str(Path(__file__).parent / 'blender_addon'))
import texture3d_blender as addon
root = Path(__file__).parent
addon.register()
cube = bpy.context.active_object
other = cube.copy()
other.data = cube.data.copy()
other.name = 'Second cube'
bpy.context.collection.objects.link(other)
other.location.x = 4
other.select_set(True)
bpy.context.view_layer.update()
original = {o: ([tuple(v.co) for v in o.data.vertices], o.matrix_world.copy(), [tuple(i.uv) for i in o.data.uv_layers.active.data]) for o in [cube, other]}
with tempfile.TemporaryDirectory() as temp:
    folder = Path(temp) / 'tool'
    folder.mkdir()
    p, metadata = addon.prepare_project(bpy.context, folder, 128)
    assert len(metadata['source_objects']) == 2
    glb = (p / 'Modele.glb').read_bytes()
    length = int.from_bytes(glb[12:16], 'little')
    data = json.loads(glb[20:20+length])
    assert len(data['meshes']) == 2
    assert set(bpy.context.selected_objects) == {cube, other}
    for obj, (verts, matrix, uvs) in original.items():
        assert verts == [tuple(v.co) for v in obj.data.vertices]
        assert uvs == [tuple(i.uv) for i in obj.data.uv_layers.active.data]
    # Produce a real GLB with an embedded texture to exercise the return importer.
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_plane_add()
    plane = bpy.context.active_object
    mat = bpy.data.materials.new('Return test')
    mat.use_nodes = True
    image = bpy.data.images.new('Cyan', width=16, height=16)
    image.generated_color = (0.1, 0.8, 0.9, 1)
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    mat.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
    plane.data.materials.append(mat)
    return_path = Path(temp) / 'return.glb'
    bpy.ops.export_scene.gltf(filepath=str(return_path), export_format='GLB', use_selection=True)
    bpy.data.objects.remove(plane, do_unlink=True)
    cube.select_set(True)
    other.select_set(True)
    bpy.context.view_layer.objects.active = cube
    before = set(bpy.data.objects)
    job = {'projectID': str(p), 'glb': str(return_path)}
    assert addon.multi.apply(job) == 2
    assert set(bpy.data.objects) == before
    for obj, (verts, matrix, uvs) in original.items():
        assert verts == [tuple(v.co) for v in obj.data.vertices]
        assert matrix == obj.matrix_world
        assert uvs == [tuple(i.uv) for i in obj.data.uv_layers[0].data]
        assert obj.active_material.get('texture3d_owner')
    first = [tuple(i.uv) for i in cube.data.uv_layers[-1].data]
    addon.multi.apply(job)
    assert first == [tuple(i.uv) for i in cube.data.uv_layers[-1].data], 'Repeated returns must not shift UVs'
    bpy.ops.object.select_all(action='DESELECT')
    assert not addon.TEXTURE3D_OT_paint.poll(bpy.context)
addon.unregister()
print('PASS: two selected meshes, atlas GLB, live-scene texture return, repeat return, source geometry/UV/transform preservation, empty selection.')
