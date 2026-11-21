"""Dedicated native channel exports; never edits stacks, channels or export presets."""
import hashlib
import struct
import uuid
import time
from pathlib import Path

CHANNELS = {'BaseColor': ('baseColor', True), 'Emissive': ('emissive', True),
            'Roughness': ('roughness', False), 'Metallic': ('metallic', False)}
ADVANCED = {'Normal':('normal',True),'Height':('height',False),'AO':('ambientOcclusion',False),'Opacity':('opacity',False)}


def context_id(api):
    if not api.project.is_open():
        raise ValueError('Ouvre le projet Painter associé avant l’import.')
    return api.resource.ResourceID.from_project(name='Texture3D_context').context


def available(api, experimental=False):
    if not api.project.is_open(): return []
    result = []
    for material in api.textureset.all_texture_sets():
        if material.has_uv_tiles():
            result.append({'textureSet':material.name(),'stack':'','channels':[],'width':0,'height':0,'unavailableReason':'UDIM non pris en charge'})
            continue
        for stack in material.all_stacks():
            registry={**CHANNELS,**ADVANCED} if experimental else CHANNELS
            channels = [name for name in registry if hasattr(api.textureset.ChannelType,name) and stack.has_channel(getattr(api.textureset.ChannelType, name))]
            result.append({'textureSet': material.name(), 'stack': stack.name(), 'width':material.get_resolution().width,'height':material.get_resolution().height,'channels': channels})
    return result


def export_channel(api, parent, expected_context, texture_set, stack_name, channel, bit_depth=16, experimental=False):
    started=time.perf_counter()
    if context_id(api) != expected_context:
        raise ValueError('Le projet Painter actif ne correspond pas à la liaison.')
    registry={**CHANNELS,**ADVANCED} if experimental else CHANNELS
    if channel=='Height' and bit_depth!=16: raise ValueError('Height exige 16 bits pour éviter une réduction silencieuse de précision.')
    if channel not in registry or bit_depth not in (8, 16):
        raise ValueError('Carte ou profondeur non prise en charge.')
    materials = [m for m in api.textureset.all_texture_sets() if m.name() == texture_set]
    if len(materials) != 1 or materials[0].has_uv_tiles():
        raise ValueError('Texture Set introuvable, ambigu ou UDIM non pris en charge.')
    stacks = [s for s in materials[0].all_stacks() if s.name() == stack_name]
    if len(stacks) != 1 or not stacks[0].has_channel(getattr(api.textureset.ChannelType, channel)):
        raise ValueError('Cette carte n’est pas disponible dans le Texture Set choisi.')
    folder = Path(parent).resolve() / uuid.uuid4().hex
    folder.mkdir(parents=True, exist_ok=False)
    source, color = registry[channel]
    components = 'RGB' if color else 'L'
    mapping = [{'destChannel': c, 'srcChannel': c, 'srcMapType': 'documentMap', 'srcMapName': source} for c in components]
    config = {'exportShaderParams': False, 'exportPath': str(folder),
              'defaultExportPreset': 'Texture3D_copy',
              'exportPresets': [{'name': 'Texture3D_copy', 'maps': [{'fileName': 'texture', 'channels': mapping,
                  'parameters': {'fileFormat': 'png', 'bitDepth': str(bit_depth), 'dithering': False,
                                 'paddingAlgorithm': 'passthrough'}}]}],
              'exportList': [{'rootPath': texture_set + ('/' + stack_name if stack_name else '')}]}
    result = api.export.export_project_textures(config)
    if result.status != api.export.ExportStatus.Success:
        raise RuntimeError('Export Painter incomplet : ' + result.message)
    files = [Path(f).resolve() for values in result.textures.values() for f in values]
    if len(files) != 1 or files[0].parent != folder or files[0].suffix.lower() != '.png':
        raise ValueError('Résultat d’export inattendu ; aucun document Photoshop modifié.')
    data = files[0].read_bytes()
    if len(data) < 33 or len(data) > 128*1024*1024 or data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
        raise ValueError('PNG exporté invalide ou trop volumineux.')
    width, height = struct.unpack('>II', data[16:24])
    resolution = materials[0].get_resolution()
    if (width, height) != (resolution.width, resolution.height) or data[24] != bit_depth:
        raise ValueError('Dimensions ou profondeur de l’export inattendues.')
    if context_id(api) != expected_context:
        raise ValueError('Le projet Painter a changé pendant l’export.')
    return {'exportDurationMs':round((time.perf_counter()-started)*1000,3),'file': str(files[0]), 'width': width, 'height': height, 'bitDepth': data[24],
            'sha256': hashlib.sha256(data).hexdigest(), 'channel': channel,
            'textureSet': texture_set, 'stack': stack_name, 'context': expected_context,
            'experimental':channel in ADVANCED,'normalConvention':'canal natif, sans inversion Y' if channel=='Normal' else None}
