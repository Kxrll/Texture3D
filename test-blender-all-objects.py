"""Selection is explicit; opting into all visible meshes still works."""
import bpy
from pathlib import Path
import sys
import tempfile

root=Path(__file__).resolve().parent
sys.path.insert(0,str(root/'blender_addon'))
import texture3d_blender as addon
addon.register()
try:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_cube_add()
    first=bpy.context.object
    first.name='Corps'
    bpy.ops.mesh.primitive_cube_add(location=(3,0,0))
    second=bpy.context.object
    second.name='Accessoire'
    second.select_set(False)
    first.select_set(True)
    bpy.context.view_layer.objects.active=first
    bpy.context.scene.texture3d_resolution='1024'
    launched=[]
    with tempfile.TemporaryDirectory() as directory:
        tool=Path(directory)/'Tool'
        tool.mkdir()
        addon.tool_folder=lambda context:tool
        addon.begin_launch=lambda context,folder,project,settings:launched.append(settings)
        assert bpy.ops.texture3d.paint_photoshop.get_rna_type().properties['select_all_meshes'].default is False
        result=bpy.ops.texture3d.paint_photoshop(selection_confirmed=True, select_all_meshes=False)
        assert result=={'FINISHED'} and launched[-1]['source_objects']==['Corps']
        result=bpy.ops.texture3d.paint_photoshop(selection_confirmed=True, select_all_meshes=True)
        assert result=={'FINISHED'}, result
        assert set(launched[-1]['source_objects'])=={'Corps','Accessoire'}, launched
        assert len(launched[0]['texture_sets'])==1
        assert len(bpy.data.objects)==2, 'Temporary export objects leaked'
    print('PASS: Selection-only and explicit all-visible modes preserve the requested scope.')
finally:
    addon.unregister()
