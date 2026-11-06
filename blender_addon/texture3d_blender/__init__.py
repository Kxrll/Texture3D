bl_info = {
    'name': 'Texture3D — Peindre dans Photoshop', 'author': 'Texture3D',
    'version': (0, 7, 0), 'blender': (4, 2, 0),
    'location': 'Vue 3D > Barre latérale (N) > Texture3D', 'category': 'Paint',
}

import bpy
import json
import math
import os
from pathlib import Path
import queue
import re
import struct
import subprocess
import threading
import time
import urllib.request
import zlib
from bpy.props import BoolProperty, EnumProperty, StringProperty

_events = queue.Queue()
_running = False
_status = 'Sélectionne un objet avec ses UV.'


def tool_folder(context):
    addon = context.preferences.addons.get(__name__)
    configured = addon.preferences.tool_directory if addon else ''
    if configured:
        folder = Path(bpy.path.abspath(configured))
    else:
        settings = Path(__file__).with_name('tool-location.json')
        folder = Path(json.loads(settings.read_text(encoding='utf-8'))['directory']) if settings.exists() else Path(__file__).resolve().parents[2]
    if not (folder / 'companion.cjs').is_file():
        raise ValueError('Indique le dossier Texture3D dans les préférences de l’extension.')
    return folder


def write_png(path, width, height, pixels):
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)
    rows = b''.join(b'\0' + pixels[y * width * 4:(y + 1) * width * 4] for y in range(height))
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', width, height, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 6)) + chunk(b'IEND', b''))


def uv_guide(mesh, uv, path, size, pixels=None):
    pixels = pixels if pixels is not None else bytearray(size * size * 4)
    for face in mesh.polygons:
        points = [tuple(max(0.0, min(1.0, v)) for v in uv.data[i].uv) for i in face.loop_indices]
        for a, b in zip(points, points[1:] + points[:1]):
            x0, y0 = a[0] * (size - 1), (1 - a[1]) * (size - 1)
            x1, y1 = b[0] * (size - 1), (1 - b[1]) * (size - 1)
            steps = max(1, math.ceil(max(abs(x1 - x0), abs(y1 - y0))))
            for step in range(steps + 1):
                x, y = round(x0 + (x1 - x0) * step / steps), round(y0 + (y1 - y0) * step / steps)
                offset = (y * size + x) * 4
                pixels[offset:offset + 4] = b'\x23\xdc\xec\xff'
    write_png(path, size, size, pixels)
    return pixels


def prepare_single(context, folder, resolution):
    obj = context.active_object
    if not obj or obj.type != 'MESH' or obj not in context.selected_objects:
        raise ValueError('Sélectionne un objet mesh à peindre.')
    if len(context.selected_objects) != 1:
        raise ValueError('Pour cette première version, sélectionne un seul objet.')
    if obj.mode != 'OBJECT':
        raise ValueError('Passe en mode Objet avant de lancer Texture3D.')
    mesh = obj.data
    uv = next((layer for layer in mesh.uv_layers if layer.active_render), None)
    if not uv or not mesh.polygons:
        raise ValueError('Déplie les UV du modèle avant de lancer Texture3D.')
    coordinates = [v for item in uv.data for v in item.uv]
    if any(not math.isfinite(v) for v in coordinates):
        raise ValueError(obj.name + ' : les UV contiennent des coordonnées invalides.')
    if any(v < -0.00001 or v > 1.00001 for v in coordinates):
        raise ValueError(obj.name + ' : les UV dépassent le carré 0–1. Dans Édition d’UV, sélectionne tous les îlots, puis UV > Compacter les îlots et réessaie. (UDIM non pris en charge.)')
    used = {face.material_index for face in mesh.polygons}
    if len(used) > 1:
        raise ValueError('Cette version utilise un seul matériau par objet. Les matériaux multiples viendront ensuite.')
    material = obj.material_slots[next(iter(used))].material if obj.material_slots else None
    color = (0.8, 0.8, 0.8, 1)
    image = None
    if material:
        color = tuple(material.diffuse_color)
        if material.use_nodes:
            output = next((n for n in material.node_tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
            shader = output.inputs['Surface'].links[0].from_node if output and output.inputs['Surface'].is_linked else None
            if not shader or shader.type != 'BSDF_PRINCIPLED':
                raise ValueError('Utilise un matériau Principled BSDF pour cette première version.')
            base = shader.inputs['Base Color']
            color = tuple(base.default_value)
            if base.is_linked:
                node = base.links[0].from_node
                if node.type != 'TEX_IMAGE' or not node.image or node.projection != 'FLAT' or base.links[0].from_socket.name != 'Color':
                    raise ValueError('La couleur doit être une image directement reliée à Couleur de base, ou une couleur unie.')
                if node.image.source not in {'FILE', 'GENERATED'}:
                    raise ValueError('Les textures animées et UDIM ne sont pas encore prises en charge.')
                if node.inputs['Vector'].is_linked:
                    mapping = node.inputs['Vector'].links[0].from_node
                    if mapping.type != 'UVMAP' or mapping.uv_map not in {'', uv.name}:
                        raise ValueError('La texture doit utiliser les UV de rendu sans transformation intermédiaire.')
                image = node.image
                if image.size[0] != image.size[1] or not image.has_data:
                    raise ValueError('Utilise une texture carrée chargée pour cette première version.')
                resolution = image.size[0]
                if resolution > 4096:
                    raise ValueError('Limite de cette version : texture de 4096 × 4096.')
    # Validate everything before creating a project. Source objects/materials stay untouched.
    name = re.sub(r'[^\w .-]', '_', obj.name).strip(' .') or 'Modele'
    projects = folder.parent / 'Projets Texture3D'
    projects.mkdir(exist_ok=True)
    import uuid
    project = projects / (name + '_' + time.strftime('%Y%m%d_%H%M%S') + '_' + uuid.uuid4().hex[:6])
    project.mkdir()
    if image:
        copy = image.copy()
        try:
            # Blender Image.copy() may recreate generated images from their
            # default color instead of copying baked/unsaved pixel contents.
            from array import array
            pixels = array('f', [0.0]) * len(image.pixels)
            image.pixels.foreach_get(pixels)
            copy.pixels.foreach_set(pixels)
            copy.update()
            copy.filepath_raw = str(project / 'Couleur.png')
            copy.file_format = 'PNG'
            copy.save()
        finally:
            bpy.data.images.remove(copy)
    else:
        def srgb(c):
            return round(255 * max(0, min(1, 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055)))
        pixel = bytes([srgb(c) for c in color[:3]] + [255])
        write_png(project / 'Couleur.png', resolution, resolution, pixel * resolution * resolution)
    uv_guide(mesh, uv, project / 'Reperes_UV.png', resolution)
    result = bpy.ops.export_scene.gltf(filepath=str(project / 'Modele.glb'), export_format='GLB', use_selection=True,
                                       export_texcoords=True, export_materials='NONE', export_animations=False,
                                       export_skins=False, export_morph=False, export_apply=False)
    if result != {'FINISHED'}:
        raise ValueError('L’export GLB a échoué.')
    if (project / 'Modele.glb').stat().st_size > 25 * 1024 * 1024:
        raise ValueError('Le modèle dépasse la limite de 25 Mo du viewer.')
    settings = {'name': name, 'document': name + '_Texture_' + project.name[-6:] + '.psd', 'resolution': resolution,
                'model': 'Modele.glb', 'texture': 'Couleur.png', 'uv': 'Reperes_UV.png',
                'source_blend': bpy.data.filepath, 'source_object': obj.name, 'uv_map': uv.name}
    (project / 'texture3d-project.json').write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding='utf-8')
    return project, settings


def launch_project(folder, project, settings):
    try:
        _events.put('Ouverture de Photoshop et préparation du PSD…')
        flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
        command = ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(folder / 'open-photoshop-project.ps1'),
                   '-ProjectDirectory', str(project), '-ToolDirectory', str(folder)]
        if settings.get('_resume'):
            command.append('-Resume')
        result = subprocess.run(command, capture_output=True, timeout=150, creationflags=flags)
        if result.returncode:
            raise RuntimeError(result.stderr.decode('utf-8', errors='replace')[-1200:] or 'Photoshop n’a pas pu ouvrir le projet.')
        config = json.loads((folder / 'companion-config.json').read_text(encoding='utf-8-sig'))
        base = 'http://127.0.0.1:' + str(config['port'])
        def request(route, body=None):
            data = json.dumps(body).encode() if body is not None else None
            req = urllib.request.Request(base + route, data=data, headers={'X-Texture3D-Key': config['token'], 'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=10) as response:
                return json.load(response)
        # The launcher starts/reuses the local companion without exposing a console.
        subprocess.Popen(['wscript.exe', str(folder / 'OUVRIR_VIEWER.vbs')], creationflags=flags)
        for attempt in range(40):
            try:
                request('/info')
                break
            except Exception:
                time.sleep(0.25)
        model = list((project / settings.get('model', 'Modele.glb')).read_bytes())
        document_name = Path(settings.get('document_path') or settings['document']).name
        response = request('/start-project', {'bytes': model, 'name': settings['name'] + '.glb', 'documentName': document_name, 'blenderSession': multi.session, 'projectID': str(project), 'textureSets': settings.get('texture_sets', [])})
        if not response['online']:
            _events.put('Connexion automatique à Photoshop…')
            for attempt in range(60):
                time.sleep(0.5)
                if request('/info').get('online'):
                    response['online'] = True
                    break
        if response['online']:
            _events.put('Projet ouvert : peins dans Photoshop puis Ctrl + S.')
        else:
            _events.put('PSD prêt, mais le plugin Photoshop ne répond pas. Installe Texture3D Studio puis redémarre Photoshop.')
    except Exception as error:
        _events.put('Erreur : ' + str(error))
    finally:
        _events.put(None)


def monitor():
    global _status, _running
    while not _events.empty():
        message = _events.get()
        if message is None:
            _running = False
        else:
            _status = message
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.tag_redraw()
    return 0.25 if _running else None


def connection_status(message):
    global _status
    _status = message
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.tag_redraw()


class TEXTURE3D_Preferences(bpy.types.AddonPreferences):
    bl_idname = __name__
    tool_directory: StringProperty(name='Dossier de l’outil Texture3D', subtype='DIR_PATH')
    def draw(self, context):
        self.layout.prop(self, 'tool_directory')
        self.layout.label(text='Choisis le dossier contenant companion.cjs.')


def selectable_meshes(context):
    return [obj for obj in context.view_layer.objects
            if obj.type == 'MESH' and obj.visible_get() and not obj.hide_select]


def missing_meshes(context):
    selected = set(context.selected_objects)
    return [obj for obj in selectable_meshes(context) if obj not in selected]


class TEXTURE3D_OT_confirm_selection(bpy.types.Operator):
    bl_idname = 'texture3d.confirm_selection'
    bl_label = 'Sélection incomplète'
    bl_description = 'Choisir les objets à envoyer dans Photoshop'

    def invoke(self, context, event):
        return context.window_manager.invoke_popup(self, width=420)

    def draw(self, context):
        layout = self.layout
        layout.label(text='Tous les objets ne sont pas sélectionnés.', icon='ERROR')
        layout.label(text=str(len(missing_meshes(context))) + ' maillage(s) visible(s) ne seront pas envoyés.')
        layout.label(text='Veux-tu continuer ?')
        layout.separator()
        layout.operator_context = 'EXEC_DEFAULT'
        current = layout.operator('texture3d.paint_photoshop', text='Continuer avec la sélection')
        current.selection_confirmed = True
        all_meshes = layout.operator('texture3d.paint_photoshop', text='Tout sélectionner et continuer')
        all_meshes.selection_confirmed = True
        all_meshes.select_all_meshes = True

    def execute(self, context):
        return {'FINISHED'}


class TEXTURE3D_OT_paint(bpy.types.Operator):
    bl_idname = 'texture3d.paint_photoshop'
    bl_label = 'Peindre dans Photoshop'
    bl_description = 'Préparer un PSD avec les UV et ouvrir le modèle dans Texture3D'
    selection_confirmed: BoolProperty(default=False, options={'HIDDEN', 'SKIP_SAVE'})
    select_all_meshes: BoolProperty(default=False, options={'HIDDEN', 'SKIP_SAVE'})
    @classmethod
    def poll(cls, context):
        return not _running and context.mode == 'OBJECT' and any(o.type == 'MESH' for o in context.selected_objects)
    def execute(self, context):
        global _running, _status
        if not self.selection_confirmed and missing_meshes(context):
            bpy.ops.texture3d.confirm_selection('INVOKE_DEFAULT')
            return {'CANCELLED'}
        if self.select_all_meshes:
            for obj in selectable_meshes(context):
                obj.select_set(True)
        try:
            folder = tool_folder(context)
            project, settings = prepare_project(context, folder, int(context.scene.texture3d_resolution))
        except Exception as error:
            self.report({'ERROR'}, str(error))
            return {'CANCELLED'}
        begin_launch(context, folder, project, settings)
        return {'FINISHED'}


def begin_launch(context, folder, project, settings):
    global _running, _status
    _running = True
    _status = 'Reprise du projet…' if settings.get('_resume') else 'Préparation du projet…'
    context.scene.texture3d_last_project = str(project)
    bpy.app.timers.register(monitor, first_interval=0.25)
    threading.Thread(target=launch_project, args=(folder, project, settings), daemon=True).start()


class TEXTURE3D_OT_resume(bpy.types.Operator):
    bl_idname = 'texture3d.resume_painting'
    bl_label = 'Reprendre la peinture'
    bl_description = 'Rouvrir le PSD associé sans créer un nouveau projet'

    @classmethod
    def poll(cls, context):
        return not _running and context.mode == 'OBJECT' and bool(context.scene.texture3d_last_project)

    def execute(self, context):
        try:
            folder = tool_folder(context)
            project, settings = projects.resume(context, multi.bindings)
            begin_launch(context, folder, project, settings)
            return {'FINISHED'}
        except Exception as error:
            self.report({'ERROR'}, str(error))
            return {'CANCELLED'}


class TEXTURE3D_OT_find_psd(bpy.types.Operator):
    bl_idname = 'texture3d.find_psd'
    bl_label = 'Retrouver le PSD'
    bl_description = 'Retrouver un PSD déplacé et reprendre le projet associé'
    filepath: StringProperty(subtype='FILE_PATH')
    filter_glob: StringProperty(default='*.psd', options={'HIDDEN'})

    @classmethod
    def poll(cls, context):
        return not _running and context.mode == 'OBJECT' and bool(context.scene.texture3d_last_project)

    def invoke(self, context, event):
        context.window_manager.fileselect_add(self)
        return {'RUNNING_MODAL'}

    def execute(self, context):
        try:
            folder = tool_folder(context)
            project, settings = projects.relocate(context, self.filepath, multi.bindings)
            begin_launch(context, folder, project, settings)
            return {'FINISHED'}
        except Exception as error:
            self.report({'ERROR'}, str(error))
            return {'CANCELLED'}


class TEXTURE3D_PT_panel(bpy.types.Panel):
    bl_label = 'Texture3D · Photoshop'
    bl_idname = 'TEXTURE3D_PT_panel'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Texture3D'
    def draw(self, context):
        layout = self.layout
        layout.label(text=str(sum(o.type == 'MESH' for o in context.selected_objects)) + ' objet(s) sélectionné(s)')
        if context.scene.texture3d_last_project:
            layout.operator('texture3d.resume_painting', icon='FILE_REFRESH')
            layout.operator('texture3d.find_psd', icon='VIEWZOOM')
            layout.label(text='Projet : ' + Path(context.scene.texture3d_last_project).name)
            layout.label(text='Enregistre le .blend pour garder ce lien.')
        layout.prop(context.scene, 'texture3d_resolution', text='Nouvelle texture')
        layout.operator('texture3d.paint_photoshop', text='Nouveau projet' if context.scene.texture3d_last_project else 'Peindre dans Photoshop', icon='BRUSH_DATA')
        box = layout.box()
        import textwrap
        for line in textwrap.wrap(_status, width=38):
            box.label(text=line)
        layout.label(text='Photoshop : peindre → Ctrl + S')
        if context.scene.texture3d_last_project:
            layout.operator('wm.path_open', text='Ouvrir le dossier du projet', icon='FILE_FOLDER').filepath = context.scene.texture3d_last_project
        layout.operator('texture3d.reconnect', icon='FILE_REFRESH')


class TEXTURE3D_OT_reconnect(bpy.types.Operator):
    bl_idname = 'texture3d.reconnect'
    bl_label = 'Reconnecter Blender'
    def execute(self, context):
        try:
            multi.start(tool_folder(context), connection_status)
            connection_status('Connexion Blender relancée.')
            return {'FINISHED'}
        except Exception as error:
            self.report({'ERROR'}, str(error))
            return {'CANCELLED'}


classes = (TEXTURE3D_Preferences, TEXTURE3D_OT_confirm_selection, TEXTURE3D_OT_paint, TEXTURE3D_OT_resume, TEXTURE3D_OT_find_psd, TEXTURE3D_OT_reconnect, TEXTURE3D_PT_panel)
def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.Scene.texture3d_resolution = EnumProperty(items=[('1024', '1024 × 1024', ''), ('2048', '2048 × 2048', ''), ('4096', '4096 × 4096', ''), ('8192', '8192 × 8192', '')], default='2048')
    bpy.types.Scene.texture3d_last_project = StringProperty()
    try:
        multi.start(tool_folder(bpy.context), connection_status)
    except Exception as error:
        connection_status('Connexion à configurer : ' + str(error))


def unregister():
    multi.stop()
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
    del bpy.types.Scene.texture3d_resolution
    del bpy.types.Scene.texture3d_last_project

from . import multi, projects
def prepare_project(context, folder, resolution):
    project, settings = multi.prepare(context, folder, resolution, prepare_single, uv_guide)
    projects.remember(context, project, settings, multi.bindings[str(project)])
    return project, settings
