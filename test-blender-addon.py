"""Background integration tests: export real geometry/UVs, preserve sources, validate unsupported cases."""
import bpy
import json
from pathlib import Path
import struct
import sys
import tempfile

root = Path(__file__).resolve().parent
sys.path.insert(0, str(root / 'blender_addon'))
import texture3d_blender as addon
# Preserve regression coverage for projects created with the legacy atlas workflow.
addon.multi.prepare = addon.multi.prepare_atlas
addon.register()
obj = bpy.context.active_object
with tempfile.TemporaryDirectory(prefix='texture3d-test-') as temp:
    folder = Path(temp) / 'Tool'
    folder.mkdir()
    original_mesh = obj.data
    original_uv = [tuple(item.uv) for item in obj.data.uv_layers.active.data]
    original_selection = list(bpy.context.selected_objects)
    project, metadata = addon.prepare_project(bpy.context, folder, 128)
    assert metadata['resolution'] == 128
    assert (project / 'Reperes_UV.png').read_bytes().startswith(b'\x89PNG')
    model = (project / 'Modele.glb').read_bytes()
    length = struct.unpack_from('<I', model, 12)[0]
    gltf = json.loads(model[20:20 + length])
    assert len(gltf['meshes']) == 1
    assert all('TEXCOORD_0' in p['attributes'] for m in gltf['meshes'] for p in m['primitives'])
    assert original_mesh == obj.data
    assert original_uv == [tuple(item.uv) for item in obj.data.uv_layers.active.data]
    assert original_selection == list(bpy.context.selected_objects)
    # Existing image path, with pixels kept intact after export.
    mat = obj.active_material
    mat.use_nodes = True
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    image = bpy.data.images.new('TestImage', width=64, height=64)
    image.generated_color = (0.1, 0.6, 0.9, 1)
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    mat.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
    pixel_before = list(image.pixels[:4])
    image_path = image.filepath_raw
    project2, metadata2 = addon.prepare_project(bpy.context, folder, 128)
    assert metadata2['resolution'] == 128
    assert list(image.pixels[:4]) == pixel_before and image.filepath_raw == image_path
    assert node.image == image
    # Reject unsupported UVs before producing any project files.
    count = len(list((folder.parent / 'Projets Texture3D').iterdir()))
    obj.data.uv_layers.active.data[0].uv.x = 2
    try:
        addon.prepare_project(bpy.context, folder, 128)
        raise AssertionError('UV validation did not reject out-of-range coordinates')
    except ValueError as error:
        assert 'Compacter' in str(error)
    assert count == len(list((folder.parent / 'Projets Texture3D').iterdir()))
addon.unregister()
print('PASS: Blender addon, GLB/UV export, existing texture, source preservation and invalid UV rejection.')
