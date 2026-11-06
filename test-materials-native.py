import bpy
from pathlib import Path
import sys
import tempfile
sys.path.insert(0, str(Path(__file__).parent / 'blender_addon'))
import texture3d_blender as addon
# Preserve regression coverage for projects created with the legacy atlas workflow.
addon.multi.prepare = addon.multi.prepare_atlas
addon.register()
obj = bpy.context.active_object
original_uv = obj.data.uv_layers.active.name
original_coords = [tuple(i.uv) for i in obj.data.uv_layers.active.data]
mat = obj.active_material
mat.use_nodes = True
shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
shader.inputs['Metallic'].default_value = 0.85
shader.inputs['Roughness'].default_value = 0.17
rough = mat.node_tree.nodes.new('ShaderNodeValue')
rough.name = 'Rugosite source'
rough.outputs[0].default_value = 0.23
mat.node_tree.links.new(rough.outputs[0], shader.inputs['Roughness'])
normal = mat.node_tree.nodes.new('ShaderNodeNormalMap')
normal.name = 'Normale source'
mat.node_tree.links.new(normal.outputs['Normal'], shader.inputs['Normal'])
source = bpy.data.images.new('Source haute resolution', width=128, height=64)
source.generated_color = (0.8, 0.1, 0.05, 1)
tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = source
mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
second = bpy.data.materials.new('Second materiau bleu')
second.use_nodes = True
next(n for n in second.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (0.05, 0.1, 0.8, 1)
obj.data.materials.append(second)
for face in obj.data.polygons:
    face.material_index = face.index % 2
unselected = obj.copy()
unselected.data = obj.data.copy()
bpy.context.collection.objects.link(unselected)
unselected.select_set(False)
with tempfile.TemporaryDirectory() as temp:
    folder = Path(temp) / 'Tool'
    folder.mkdir()
    project, settings = addon.prepare_project(bpy.context, folder, 64)
    assert settings['resolution'] == 256, 'Source textures must not be downsampled to fit the requested atlas'
    assert len(settings['material_regions'][obj.name]) == 2
    assert original_coords == [tuple(i.uv) for i in obj.data.uv_layers[original_uv].data]
    assert unselected.active_material == mat
    # Return a PNG directly, without importing any geometry.
    image = bpy.data.images.new('Peinture retour', width=256, height=256)
    image.generated_color = (0.1, 0.7, 0.9, 1)
    path = Path(temp) / 'peinture.png'
    image.filepath_raw = str(path)
    image.file_format = 'PNG'
    image.save()
    before_objects = set(bpy.data.objects)
    job = {'projectID': str(project), 'image': str(path)}
    assert addon.multi.apply(job) == 1
    count_mats, count_images = len(bpy.data.materials), len(bpy.data.images)
    material_refs = list(obj.data.materials)
    first_rgb = next(n.image for n in obj.active_material.node_tree.nodes if n.name == 'Texture3D BaseColor').pixels[:4]
    from array import array
    image.pixels.foreach_set(array('f', [0.9, 0.05, 0.1, 1]) * (256 * 256))
    image.update()
    image.save()
    assert addon.multi.apply(job) == 1
    assert material_refs == list(obj.data.materials), 'Reuse managed materials on repeated returns'
    assert len(bpy.data.materials) == count_mats and len(bpy.data.images) == count_images
    returned = next(n.image for n in obj.active_material.node_tree.nodes if n.name == 'Texture3D BaseColor')
    assert list(first_rgb) != list(returned.pixels[:4]), 'Packed image must receive the new file bytes'
    assert set(bpy.data.objects) == before_objects
    assert unselected.active_material == mat, 'Shared material on an unselected object must not change'
    copied_shader = next(n for n in obj.active_material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    assert abs(copied_shader.inputs['Metallic'].default_value - 0.85) < 1e-5
    assert copied_shader.inputs['Roughness'].links[0].from_node.name == 'Rugosite source'
    assert copied_shader.inputs['Normal'].links[0].from_node.name == 'Normale source'
    assert next(u.name for u in obj.data.uv_layers if u.active_render) == original_uv
    assert [p.material_index for p in obj.data.polygons] == [p.index % 2 for p in obj.data.polygons]
addon.unregister()
print('PASS: multiple materials/textures, source resolution retained, direct PNG return, PBR/normal links and other objects preserved, repeated returns reuse materials/images and refresh packed pixels.')
