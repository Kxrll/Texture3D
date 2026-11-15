import bpy,sys,tempfile
from pathlib import Path
root=Path(__file__).resolve().parent
sys.path.insert(0,str(root/'blender_addon'))
from texture3d_blender import texture_sets
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add()
obj=bpy.context.object
with tempfile.TemporaryDirectory() as tmp:
    folder=Path(tmp)/'tool';folder.mkdir()
    def broken(*args): raise RuntimeError('injected guide failure')
    try: texture_sets.prepare(bpy.context,folder,64,broken)
    except RuntimeError as e: assert 'injected' in str(e)
    else: raise AssertionError('Expected preparation failure')
    assert list((Path(tmp)/'Projets Texture3D').iterdir())==[]
    assert len(bpy.data.objects)==1 and bpy.context.view_layer.objects.active==obj
print('PASS: failed preparation removes only its new folder, restores selection and removes temporary objects')
