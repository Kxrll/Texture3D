"""Two-process Blender persistence test; uses a private temporary project only."""
import bpy
import json
from pathlib import Path
import shutil
import sys
sys.path.insert(0, str(Path(__file__).parent / 'blender_addon'))
import texture3d_blender as addon
# Preserve regression coverage for projects created with the legacy atlas workflow.
addon.multi.prepare = addon.multi.prepare_atlas
stage, directory = sys.argv[sys.argv.index('--') + 1:]
base = Path(directory).resolve()
addon.register()
if stage == 'create':
    folder = base / 'Tool'
    folder.mkdir()
    cube = bpy.context.active_object
    other = cube.copy()
    other.data = cube.data.copy()
    other.location.x = 3
    bpy.context.collection.objects.link(other)
    other.select_set(True)
    project, settings = addon.prepare_project(bpy.context, folder, 64)
    (project / settings['document']).write_bytes(b'PSD-SENTINEL-USER-PAINT')
    cube.name = 'Objet renomme apres creation'
    bpy.ops.wm.save_as_mainfile(filepath=str(base / 'scene.blend'))
    (base / 'test.json').write_text(json.dumps({'project': str(project), 'document': settings['document']}), encoding='utf-8')
    print('PASS: project association saved in .blend.')
else:
    bpy.ops.wm.open_mainfile(filepath=str(base / 'scene.blend'))
    data = json.loads((base / 'test.json').read_text(encoding='utf-8'))
    original = Path(data['project'])
    before = set(original.parent.iterdir())
    model_bytes = (original / 'Modele.glb').read_bytes()
    bpy.ops.object.select_all(action='DESELECT')
    addon.multi.bindings.clear()
    project, settings = addon.projects.resume(bpy.context, addon.multi.bindings)
    assert project == original and settings['_resume']
    assert len(addon.multi.bindings[str(project)]) == 2
    assert any(t[0].name == 'Objet renomme apres creation' for t in addon.multi.bindings[str(project)])
    assert before == set(original.parent.iterdir())
    assert (original / settings['document']).read_bytes() == b'PSD-SENTINEL-USER-PAINT'
    assert (original / 'Modele.glb').read_bytes() == model_bytes
    # Missing PSD must not create a replacement. Relocate just the PSD.
    external = base / 'Peinture deplacee.psd'
    (original / settings['document']).rename(external)
    try:
        addon.projects.resume(bpy.context, addon.multi.bindings)
        raise AssertionError('Missing PSD was not rejected')
    except ValueError as error:
        assert 'PSD' in str(error)
    project, settings = addon.projects.relocate(bpy.context, str(external), addon.multi.bindings)
    assert settings['document_path'] == str(external)
    assert external.read_bytes() == b'PSD-SENTINEL-USER-PAINT'
    # Move the whole project, carrying the PSD back beside its metadata.
    external.rename(original / 'Peinture.psd')
    moved = base / 'Projet deplace'
    shutil.move(str(original), str(moved))
    project, settings = addon.projects.relocate(bpy.context, str(moved / 'Peinture.psd'), addon.multi.bindings)
    assert project == moved and (moved / 'Modele.glb').read_bytes() == model_bytes
    obj = addon.multi.bindings[str(project)][0][0]
    duplicate = obj.copy()
    bpy.context.collection.objects.link(duplicate)
    try:
        addon.projects.resume(bpy.context, addon.multi.bindings)
        raise AssertionError('Ambiguous duplicated identity was not rejected')
    except ValueError as error:
        assert 'ambigu' in str(error)
    bpy.data.objects.remove(duplicate, do_unlink=True)
    uv = obj.data.uv_layers[addon.multi.bindings[str(project)][0][1]]
    initial = uv.data[0].uv.copy()
    uv.data[0].uv.x += 0.1
    try:
        addon.projects.resume(bpy.context, addon.multi.bindings)
        raise AssertionError('Edited UVs were not rejected')
    except ValueError as error:
        assert 'changé' in str(error)
    uv.data[0].uv = initial
    # Rebuild actual return targets from scene data, with no in-memory binding cache.
    addon.multi.bindings.clear()
    assert len(addon.projects.validate_return(bpy.context, str(moved))) == 2
    # Return a real embedded texture after reopening, with an empty process cache.
    bpy.ops.mesh.primitive_plane_add()
    plane = bpy.context.active_object
    mat = bpy.data.materials.new('Test retour apres reprise')
    mat.use_nodes = True
    image = bpy.data.images.new('Test reprise', width=16, height=16)
    image.generated_color = (0.2, 0.8, 0.9, 1)
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    mat.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
    plane.data.materials.append(mat)
    bpy.ops.export_scene.gltf(filepath=str(base / 'return.glb'), export_format='GLB', use_selection=True)
    bpy.data.objects.remove(plane, do_unlink=True)
    before_objects = set(bpy.data.objects)
    assert addon.multi.apply({'projectID': str(moved), 'glb': str(base / 'return.glb')}) == 2
    assert before_objects == set(bpy.data.objects)
    assert (moved / 'Peinture.psd').read_bytes() == b'PSD-SENTINEL-USER-PAINT'
    print('PASS: separate-process resume, renamed objects, no selection, PSD/model preservation, PSD/folder relocation, ambiguous identity and changed UV rejection.')
addon.unregister()
