"""Run with Blender --background --python. Install and enable Texture3D for this user."""
import bpy
import json
from pathlib import Path
import shutil
import sys

root = Path(__file__).resolve().parent
addons = Path(bpy.utils.user_resource('SCRIPTS', path='addons', create=True))
target = addons / 'texture3d_blender'
target.mkdir(exist_ok=True)
shutil.copy2(root / 'blender_addon' / 'texture3d_blender' / '__init__.py', target / '__init__.py')
shutil.copy2(root / 'blender_addon' / 'texture3d_blender' / 'multi.py', target / 'multi.py')
shutil.copy2(root / 'blender_addon' / 'texture3d_blender' / 'projects.py', target / 'projects.py')
shutil.copy2(root / 'blender_addon' / 'texture3d_blender' / 'materials.py', target / 'materials.py')
(target / 'tool-location.json').write_text(json.dumps({'directory': str(root)}), encoding='utf-8')
if str(addons) not in sys.path:
    sys.path.insert(0, str(addons))
import addon_utils
addon_utils.modules_refresh()
addon_utils.enable('texture3d_blender', default_set=True, persistent=True)
if 'texture3d_blender' not in bpy.context.preferences.addons:
    raise RuntimeError('Activation de Texture3D impossible.')
bpy.context.preferences.addons['texture3d_blender'].preferences.tool_directory = str(root)
bpy.ops.wm.save_userpref()
print('Texture3D installé et activé : ' + str(target))
