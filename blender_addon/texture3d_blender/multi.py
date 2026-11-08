import bpy
import json
import math
import queue
import threading
import urllib.request
import uuid
from array import array
from . import materials
from pathlib import Path
import re
import time

session = uuid.uuid4().hex
bindings = {}
halt = threading.Event()
jobs = queue.Queue()
results = queue.Queue()
current_project_id = None
notice = None


def _legacy_prepare(context, folder, resolution, single, guide):
    selected = list(context.selected_objects)
    objects = [o for o in selected if o.type == 'MESH']
    if not objects or context.mode != 'OBJECT':
        raise ValueError('Sélectionne au moins un maillage en mode Objet.')
    active = context.view_layer.objects.active
    copies, parts, atlas_copies = [], [], []
    try:
        for obj in objects:
            for other in context.selected_objects:
                other.select_set(False)
            obj.select_set(True)
            context.view_layer.objects.active = obj
            parts.append((obj, *single(context, folder, resolution)))
        project, settings = parts[0][1:]
        targets = []
        if len(parts) == 1:
            obj = objects[0]
            targets.append((obj, next(uv.name for uv in obj.data.uv_layers if uv.active_render), 1, 0, 0))
        else:
            side = math.ceil(math.sqrt(len(parts)))
            cell = max(1, resolution // side)
            size = cell * side
            pixels = array('f', [0]) * (size * size * 4)
            guides = bytearray(size * size * 4)
            for index, (obj, part, _) in enumerate(parts):
                x, y = index % side, index // side
                image = bpy.data.images.load(str(part / 'Couleur.png'), check_existing=False)
                try:
                    image.scale(cell, cell)
                    source = array('f', [0]) * (cell * cell * 4)
                    image.pixels.foreach_get(source)
                    for row in range(cell):
                        start = ((y * cell + row) * size + x * cell) * 4
                        pixels[start:start + cell * 4] = source[row * cell * 4:(row + 1) * cell * 4]
                finally:
                    bpy.data.images.remove(image)
                clone = obj.copy()
                clone.data = obj.data.copy()
                context.collection.objects.link(clone)
                copies.append(clone)
                atlas_copies.append(clone)
                uv = next(uv for uv in clone.data.uv_layers if uv.active_render)
                for item in uv.data:
                    item.uv = ((item.uv.x + x) / side, (item.uv.y + y) / side)
                guides = guide(clone.data, uv, project / 'Reperes_UV.png', size, guides)
                targets.append((obj, uv.name, 1 / side, x / side, y / side))
            atlas = bpy.data.images.new('Texture3D atlas temporaire', width=size, height=size, alpha=True)
            try:
                atlas.pixels.foreach_set(pixels)
                atlas.filepath_raw = str(project / 'Couleur.png')
                atlas.file_format = 'PNG'
                atlas.save()
            finally:
                bpy.data.images.remove(atlas)
            for obj in context.selected_objects:
                obj.select_set(False)
            for clone in atlas_copies:
                clone.select_set(True)
            context.view_layer.objects.active = atlas_copies[0]
            bpy.ops.export_scene.gltf(filepath=str(project / 'Modele.glb'), export_format='GLB', use_selection=True,
                export_texcoords=True, export_materials='NONE', export_animations=False, export_skins=False, export_morph=False)
            if (project / 'Modele.glb').stat().st_size > 25 * 1024 * 1024:
                raise ValueError('La sélection dépasse la limite de 25 Mo.')
            settings['name'] = 'Selection_' + str(len(objects)) + '_objets'
            settings['resolution'] = size
        settings['source_objects'] = [obj.name for obj in objects]
        bindings[str(project)] = targets
        (project / 'texture3d-project.json').write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding='utf-8')
        return project, settings
    finally:
        for clone in copies:
            mesh = clone.data
            bpy.data.objects.remove(clone, do_unlink=True)
            bpy.data.meshes.remove(mesh)
        for obj in context.selected_objects:
            obj.select_set(False)
        for obj in selected:
            obj.select_set(True)
        context.view_layer.objects.active = active


def prepare_atlas(context, folder, resolution, single, guide):
    selected = list(context.selected_objects)
    objects = [obj for obj in selected if obj.type == 'MESH']
    if not objects or context.mode != 'OBJECT':
        raise ValueError('Sélectionne au moins un maillage en mode Objet.')
    sources, side, cell, size = materials.atlas(context, objects, resolution, guide)
    active = context.view_layer.objects.active
    name = re.sub(r'[^\w .-]', '_', objects[0].name).strip(' .') or 'Modele'
    project = folder.parent / 'Projets Texture3D' / (name + '_' + time.strftime('%Y%m%d_%H%M%S') + '_' + uuid.uuid4().hex[:6])
    project.mkdir(parents=True)
    copies = []
    image = None
    regions = {obj.name: [] for obj in objects}
    try:
        pixels = array('f', [0.8, 0.8, 0.8, 1]) * (size * size)
        for index, source in enumerate(sources):
            x, y = index % side, index // side
            materials.fill_tile(pixels, size, cell, x, y, source)
            regions[source['object'].name].append({'slot': source['slot'], 'uv': source['uv'], 'scale': cell / size,
                'x': x * cell / size, 'y': y * cell / size, 'material': source['material'].name if source['material'] else 'Sans matériau'})
        image = bpy.data.images.new('Texture3D atlas temporaire', width=size, height=size, alpha=True)
        image.pixels.foreach_set(pixels)
        image.update()
        image.filepath_raw = str(project / 'Couleur.png')
        image.file_format = 'PNG'
        image.save()
        guides = bytearray(size * size * 4)
        targets = []
        for obj in objects:
            clone = obj.copy()
            clone.data = obj.data.copy()
            context.collection.objects.link(clone)
            copies.append(clone)
            exported_uv = next(u for u in clone.data.uv_layers if u.active_render)
            source_coords = {r['uv']: [tuple(i.uv) for i in obj.data.uv_layers[r['uv']].data] for r in regions[obj.name]}
            by_slot = {r['slot']: r for r in regions[obj.name]}
            for face in clone.data.polygons:
                region = by_slot[face.material_index]
                for index in face.loop_indices:
                    uv = source_coords[region['uv']][index]
                    exported_uv.data[index].uv = (uv[0] * region['scale'] + region['x'], uv[1] * region['scale'] + region['y'])
            guides = guide(clone.data, exported_uv, project / 'Reperes_UV.png', size, guides)
            first = regions[obj.name][0]
            targets.append((obj, first['uv'], first['scale'], first['x'], first['y']))
        for obj in context.selected_objects:
            obj.select_set(False)
        for clone in copies:
            clone.select_set(True)
        context.view_layer.objects.active = copies[0]
        bpy.ops.export_scene.gltf(filepath=str(project / 'Modele.glb'), export_format='GLB', use_selection=True,
            export_texcoords=True, export_materials='NONE', export_animations=False, export_skins=False, export_morph=False)
        if (project / 'Modele.glb').stat().st_size > 25 * 1024 * 1024:
            raise ValueError('La sélection dépasse la limite de 25 Mo.')
        settings = {'name': name if len(objects) == 1 else 'Selection_' + str(len(objects)) + '_objets',
            'document': name + '_Texture_' + project.name[-6:] + '.psd', 'resolution': size,
            'model': 'Modele.glb', 'texture': 'Couleur.png', 'uv': 'Reperes_UV.png', 'source_blend': bpy.data.filepath,
            'source_object': objects[0].name, 'source_objects': [o.name for o in objects], 'uv_map': targets[0][1],
            'material_regions': regions, 'schema': 2}
        bindings[str(project)] = targets
        (project / 'texture3d-project.json').write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding='utf-8')
        return project, settings
    finally:
        for clone in copies:
            mesh = clone.data
            bpy.data.objects.remove(clone, do_unlink=True)
            bpy.data.meshes.remove(mesh)
        if image:
            bpy.data.images.remove(image)
        for obj in context.selected_objects:
            obj.select_set(False)
        for obj in selected:
            obj.select_set(True)
        context.view_layer.objects.active = active


def apply(job):
    from . import projects
    if projects.read_settings(projects.project_path(bpy.context)).get('schema') == 3:
        from . import texture_sets
        return texture_sets.apply(bpy.context, job)
    raise ValueError('Ce projet utilise un ancien atlas. Sélectionne ta carte UV d’origine, puis crée un Nouveau projet pour peindre sans ajouter de carte UV. L’ancienne peinture reste conservée.')
    targets = projects.validate_return(bpy.context, job['projectID'])
    bindings[job['projectID']] = targets
    for obj, uv, *_ in targets:
        if not obj or obj.name not in bpy.context.scene.objects or not obj.data.uv_layers.get(uv):
            raise ValueError('Un objet source ou ses UV a été supprimé.')
        if obj.mode != 'OBJECT':
            raise ValueError('Passe en mode Objet avant le retour de la texture.')
    before = set(bpy.data.objects)
    selected = list(bpy.context.selected_objects)
    active = bpy.context.view_layer.objects.active
    try:
        owner = str(projects.project_path(bpy.context))
        image = next((i for i in bpy.data.images if i.get(materials.OWNER) == owner), None)
        if job.get('image'):
            # A packed image may reload its old packed bytes. Load the new PNG,
            # remap users, then remove only the previous image owned by this project.
            loaded = bpy.data.images.load(job['image'], check_existing=False)
            if image:
                image.user_remap(loaded)
                bpy.data.images.remove(image)
            image = loaded
        else:
            bpy.ops.import_scene.gltf(filepath=job['glb'])
            imported_image = None
            for obj in set(bpy.data.objects) - before:
                if obj.type == 'MESH':
                    for mat in obj.data.materials:
                        if mat and mat.use_nodes:
                            imported_image = next((n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), imported_image)
            if image and imported_image:
                image.user_remap(imported_image)
                bpy.data.images.remove(image)
            image = imported_image
        if image is None:
            raise ValueError('Le retour GLB ne contient pas de texture.')
        image.pack()
        image[materials.OWNER] = owner
        records = {r['id']: r for r in projects.stored(bpy.context)['bindings']}
        for obj, uv_name, scale, x, y in targets:
            if obj.data.users > 1:
                obj.data = obj.data.copy()
            atlas_name = 'Texture3D ' + (projects.stored(bpy.context).get('project_id') or job['projectID'][-6:])[:10]
            uv = obj.data.uv_layers.get(atlas_name) or obj.data.uv_layers.new(name=atlas_name)
            record = records[obj[projects.OBJECT_KEY]]
            regions = record.get('materials') or [{'slot': slot, 'uv': uv_name, 'scale': scale, 'x': x, 'y': y}
                for slot in sorted({p.material_index for p in obj.data.polygons})]
            by_slot = {r['slot']: r for r in regions}
            for face in obj.data.polygons:
                region = by_slot[face.material_index]
                source_uv = obj.data.uv_layers[region['uv']]
                for index in face.loop_indices:
                    source = source_uv.data[index].uv
                    uv.data[index].uv = (source.x * region['scale'] + region['x'], source.y * region['scale'] + region['y'])
            for region in regions:
                materials.update_material(obj, region['slot'], image, uv.name, owner + ':' + obj[projects.OBJECT_KEY] + ':' + str(region['slot']))
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type == 'VIEW_3D':
                    area.spaces.active.shading.type = 'MATERIAL'
        return len(targets)
    finally:
        for obj in set(bpy.data.objects) - before:
            mesh = obj.data if obj.type == 'MESH' else None
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh and mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        for obj in bpy.context.selected_objects:
            obj.select_set(False)
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = active


def receive():
    global current_project_id
    from . import projects
    try:
        current_project_id = str(projects.project_path(bpy.context)) if bpy.context.scene.texture3d_last_project else None
    except Exception:
        current_project_id = None
    while not jobs.empty():
        job = jobs.get()
        try:
            count = apply(job)
            results.put({'id': job['id'], 'count': count})
            if notice:
                notice(str(count) + ' objet(s) mis à jour dans cette scène.')
        except Exception as error:
            results.put({'id': job['id'], 'error': str(error)})
            if notice:
                notice('Retour Blender : ' + str(error))
    return 0.4


def start(folder, on_status=None):
    global halt, notice
    stop()
    notice = on_status
    config = json.loads((folder / 'companion-config.json').read_text(encoding='utf-8-sig'))
    halt = threading.Event()
    stop_event = halt
    def worker():
        ack, seen = [], set()
        while not stop_event.is_set():
            while not results.empty():
                ack.append(results.get())
            try:
                req = urllib.request.Request('http://127.0.0.1:' + str(config['port']) + '/blender-bridge',
                    data=json.dumps({'session': session, 'projectID': current_project_id, 'ack': ack}).encode(),
                    headers={'X-Texture3D-Key': config['token'], 'Content-Type': 'application/json'})
                with urllib.request.urlopen(req, timeout=2) as response:
                    payload = json.load(response)
                ack = []
                if stop_event.is_set():
                    break
                for job in payload.get('jobs', []):
                    if job['id'] not in seen:
                        seen.add(job['id'])
                        if len(seen) > 2000:
                            seen = {job['id']}
                        jobs.put(job)
            except Exception:
                pass
            stop_event.wait(0.5)
    threading.Thread(target=worker, daemon=True).start()
    bpy.app.timers.register(receive, first_interval=0.4, persistent=True)


def stop():
    halt.set()
    if bpy.app.timers.is_registered(receive):
        bpy.app.timers.unregister(receive)


def prepare(context, folder, resolution, single, guide):
    from . import texture_sets
    project, settings, targets = texture_sets.prepare(context, folder, resolution, guide)
    bindings[str(project)] = targets
    return project, settings
