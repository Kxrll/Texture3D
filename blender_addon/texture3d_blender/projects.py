"""Persistent project links saved with the Blender scene and mirrored in project metadata."""
import bpy
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import uuid

SCENE_KEY = 'texture3d_project_v1'
OBJECT_KEY = 'texture3d_object_id'


def signature(obj, uv_name):
    uv = obj.data.uv_layers.get(uv_name)
    if uv is None:
        raise ValueError(obj.name + ' : la carte UV du projet est introuvable.')
    digest = hashlib.sha256()
    for vertex in obj.data.vertices:
        digest.update(struct.pack('<3f', *vertex.co))
    for polygon in obj.data.polygons:
        digest.update(struct.pack('<I', len(polygon.vertices)))
        for vertex in polygon.vertices:
            digest.update(struct.pack('<I', vertex))
    for item in uv.data:
        digest.update(struct.pack('<2f', *item.uv))
    return digest.hexdigest()


def slots_signature(obj):
    return hashlib.sha256(','.join(str(p.material_index) for p in obj.data.polygons).encode()).hexdigest()


def read_settings(project):
    metadata = project / 'texture3d-project.json'
    if not metadata.is_file():
        raise ValueError('Dossier de projet introuvable. Utilise « Retrouver le PSD » si tu l’as déplacé.')
    return json.loads(metadata.read_text(encoding='utf-8-sig'))


def save_settings(project, settings):
    destination = project / 'texture3d-project.json'
    temporary = project / 'texture3d-project.tmp'
    temporary.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(temporary, destination)


def store_scene(context, project, records, identity=None):
    context.scene[SCENE_KEY] = json.dumps({'project': str(project), 'project_id': identity, 'bindings': records}, ensure_ascii=False)
    context.scene.texture3d_last_project = str(project)


def remember(context, project, settings, targets):
    records = []
    for obj, uv, scale, x, y in targets:
        identity = obj.get(OBJECT_KEY)
        if not identity or sum(o.get(OBJECT_KEY) == identity for o in context.scene.objects) != 1:
            identity = uuid.uuid4().hex
            obj[OBJECT_KEY] = identity
        record = {'id': identity, 'name': obj.name, 'uv': uv, 'scale': scale, 'x': x, 'y': y,
                  'signature': signature(obj, uv), 'slots_signature': slots_signature(obj)}
        regions = settings.get('material_regions', {}).get(obj.name)
        if regions:
            record['materials'] = regions
            record['uv_signatures'] = {r['uv']: signature(obj, r['uv']) for r in regions}
        records.append(record)
    settings['source_bindings'] = records
    settings.setdefault('project_id', uuid.uuid4().hex)
    save_settings(project, settings)
    store_scene(context, project, records, settings['project_id'])


def stored(context):
    text = context.scene.get(SCENE_KEY)
    return json.loads(text) if text else None


def project_path(context):
    data = stored(context)
    location = data['project'] if data else context.scene.texture3d_last_project
    if not location:
        raise ValueError('Aucun projet associé. Commence par « Peindre dans Photoshop ».')
    return Path(bpy.path.abspath(location)).resolve()


def resolve(context, records):
    targets = []
    for record in records:
        candidates = [obj for obj in context.scene.objects if obj.type == 'MESH' and obj.get(OBJECT_KEY) == record['id']]
        if len(candidates) != 1:
            raise ValueError(record['name'] + ' : objet supprimé ou association ambiguë. Crée un nouveau projet pour cette sélection.')
        obj = candidates[0]
        if signature(obj, record['uv']) != record['signature']:
            raise ValueError(obj.name + ' : le maillage ou ses UV ont changé depuis la création du projet. Crée un nouveau projet.')
        if record.get('slots_signature') and slots_signature(obj) != record['slots_signature']:
            raise ValueError(obj.name + ' : l’attribution des matériaux aux faces a changé. Crée un nouveau projet.')
        for uv_name, expected in record.get('uv_signatures', {}).items():
            if signature(obj, uv_name) != expected:
                raise ValueError(obj.name + ' : les UV d’un matériau ont changé. Crée un nouveau projet.')
        targets.append((obj, record['uv'], record['scale'], record['x'], record['y']))
    if not targets:
        raise ValueError('Le projet ne contient aucune association d’objet.')
    return targets


def migrate(context, project, settings):
    """Adopt a legacy project by its exact object/UV names, without exporting again."""
    names = settings.get('source_objects') or [settings['source_object']]
    side = math.ceil(math.sqrt(len(names)))
    targets = []
    for index, name in enumerate(names):
        obj = context.scene.objects.get(name)
        if not obj or obj.type != 'MESH':
            raise ValueError(name + ' : objet du projet précédent introuvable. Crée un nouveau projet.')
        uv = settings.get('uv_map', 'UVMap')
        if not obj.data.uv_layers.get(uv):
            raise ValueError(name + ' : carte UV du projet précédent introuvable.')
        targets.append((obj, uv, 1 / side, (index % side) / side, (index // side) / side))
    remember(context, project, settings, targets)
    return targets


def resume(context, return_bindings):
    if context.mode != 'OBJECT':
        raise ValueError('Passe en mode Objet pour reprendre la peinture.')
    project = project_path(context)
    settings = read_settings(project)
    for texture_set in settings.get('texture_sets', []):
        if not Path(texture_set.get('document_path') or str(project / texture_set['document'])).is_file():
            raise ValueError('PSD manquant : ' + texture_set['document'] + '. Retrouve le dossier complet du projet.')
    document = Path(settings.get('document_path') or str(project / settings['document']))
    if not document.is_file():
        raise ValueError('Le PSD est introuvable. Clique sur « Retrouver le PSD », puis réessaie.')
    if not (project / settings.get('model', 'Modele.glb')).is_file():
        raise ValueError('Le modèle du projet est introuvable. Retrouve le dossier de projet complet.')
    data = stored(context)
    if data and data.get('project_id') and data['project_id'] != settings.get('project_id'):
        raise ValueError('Le dossier ne correspond pas au projet associé à cette scène.')
    records = data['bindings'] if data else settings.get('source_bindings')
    targets = resolve(context, records) if records else migrate(context, project, settings)
    if records:
        store_scene(context, project, records, settings.get('project_id'))
    return_bindings[str(project)] = targets
    launch = dict(settings)
    launch['_resume'] = True
    return project, launch


def relocate(context, filepath, return_bindings):
    document = Path(filepath).resolve()
    if document.suffix.lower() != '.psd' or not document.is_file():
        raise ValueError('Choisis un fichier PSD existant.')
    previous = project_path(context)
    # If the entire project was moved, recover model/metadata beside the chosen PSD.
    project = document.parent if (document.parent / 'texture3d-project.json').is_file() else previous
    settings = read_settings(project)
    data = stored(context)
    if data and data.get('project_id') and data['project_id'] != settings.get('project_id'):
        raise ValueError('Ce PSD appartient à un autre projet. Choisis le PSD associé à cette scène.')
    if not (project / settings.get('model', 'Modele.glb')).is_file():
        raise ValueError('Le modèle du projet est introuvable. Retrouve le dossier de projet complet.')
    records = data['bindings'] if data else settings.get('source_bindings')
    if records:
        resolve(context, records)
    else:
        migrate(context, project, settings)
        records = stored(context)['bindings']
    if settings.get('schema') == 3:
        matching = next((s for s in settings['texture_sets'] if s['document'] == document.name), None)
        if matching is None:
            raise ValueError('Choisis un PSD du projet en conservant son nom de matériau.')
        matching['document_path'] = str(document)
        for item in settings['texture_sets']:
            if (project / item['document']).is_file():
                item['document_path'] = str(project / item['document'])
    settings['document'] = document.name
    settings['document_path'] = str(document)
    settings['source_bindings'] = records
    save_settings(project, settings)
    store_scene(context, project, records, settings.get('project_id'))
    return resume(context, return_bindings)


def validate_return(context, project):
    data = stored(context)
    if not data or Path(data['project']).resolve() != Path(project).resolve():
        raise ValueError('Ce projet n’est pas associé à la scène ouverte. Clique sur « Reprendre la peinture ».')
    return resolve(context, data['bindings'])
