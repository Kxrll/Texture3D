import bpy,addon_utils,shutil
from pathlib import Path
root=Path(__file__).resolve().parent
addon=Path(bpy.utils.user_resource('SCRIPTS',path='addons'))/'texture3d_blender'
import json
location=addon/'tool-location.json'
if location.exists() and Path(json.loads(location.read_text())['directory']).resolve()==root:
    addon_utils.disable('texture3d_blender',default_set=True)
    bpy.ops.wm.save_userpref()
    shutil.rmtree(addon)
