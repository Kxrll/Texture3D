import sys,json
from pathlib import Path
import bpy,addon_utils
root=Path(__file__).resolve().parent
addons=root/'blender_addon'
(addons/'texture3d_blender'/'tool-location.json').write_text(json.dumps({'directory':str(root)}),encoding='utf-8')
sys.path.insert(0,str(addons))
addon_utils.modules_refresh()
addon_utils.enable('texture3d_blender',default_set=True,persistent=True)
bpy.context.preferences.addons['texture3d_blender'].preferences.tool_directory=str(root)
# No save_userpref: this integration is enabled for this Blender session only.
