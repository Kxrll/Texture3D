"""Base-color atlas preparation and non-destructive, reusable material updates."""
import bpy
import math
from array import array

OWNER = 'texture3d_owner'


def shader_for(material):
    if not material or not material.use_nodes:
        return None
    output = next((n for n in material.node_tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
    shader = output.inputs['Surface'].links[0].from_node if output and output.inputs['Surface'].is_linked else None
    if shader is None or shader.type != 'BSDF_PRINCIPLED':
        raise ValueError(material.name + ' : utilise un matériau Principled BSDF.')
    return shader


def source_for(obj, slot):
    material = obj.material_slots[slot].material if slot < len(obj.material_slots) else None
    shader = shader_for(material)
    color = tuple(shader.inputs['Base Color'].default_value) if shader else tuple(material.diffuse_color) if material else (0.8, 0.8, 0.8, 1)
    uv = next((u.name for u in obj.data.uv_layers if u.active_render), None)
    original_uv = obj.data.uv_layers.active
    if original_uv is None or original_uv.name.startswith('Texture3D '):
        original_uv = next((u for u in obj.data.uv_layers if not u.name.startswith('Texture3D ')), None)
    image = None
    if shader and shader.inputs['Base Color'].is_linked:
        link = shader.inputs['Base Color'].links[0]
        node = link.from_node
        if node.type != 'TEX_IMAGE' or not node.image or link.from_socket.name != 'Color' or node.projection != 'FLAT':
            raise ValueError(obj.name + ' / ' + material.name + ' : la couleur doit être une image directe ou une couleur unie. Fais un bake des textures procédurales avant l’envoi.')
        image = node.image
        if image.source in {'FILE', 'GENERATED'} and not image.has_data:
            tuple(image.pixels[:4])  # Resolve Blender's lazy image buffer.
        if image.source not in {'FILE', 'GENERATED'} or not image.has_data:
            raise ValueError(material.name + ' : image absente, animée ou UDIM non prise en charge.')
        if node.inputs['Vector'].is_linked:
            mapping = node.inputs['Vector'].links[0].from_node
            if mapping.type != 'UVMAP':
                raise ValueError(material.name + ' : utilise une carte UV directe sans transformation intermédiaire.')
            uv = mapping.uv_map or uv
        # A previous Texture3D material may still point to its legacy atlas.
        # New projects must read the user's existing original UV layer instead.
        if node.get(OWNER) and original_uv is not None:
            if uv != original_uv.name:
                image = None  # Legacy atlas pixels cannot be reused on another UV layout.
            uv = original_uv.name
    layer = obj.data.uv_layers.get(uv) if uv else None
    if not layer:
        raise ValueError(obj.name + ' : déplie les UV avant de lancer la peinture.')
    indices = [i for face in obj.data.polygons if face.material_index == slot for i in face.loop_indices]
    if not indices:
        return None
    if any(not math.isfinite(v) for i in indices for v in layer.data[i].uv):
        raise ValueError(obj.name + ' : coordonnées UV invalides.')
    if any(v < -1e-5 or v > 1 + 1e-5 for i in indices for v in layer.data[i].uv):
        raise ValueError(obj.name + ' : les UV dépassent le carré 0–1. Fais UV > Compacter les îlots, puis réessaie.')
    return {'object': obj, 'slot': slot, 'material': material, 'image': image, 'color': color, 'uv': uv}


def atlas(context, objects, resolution, guide):
    sources = [source_for(obj, slot) for obj in objects for slot in sorted({p.material_index for p in obj.data.polygons})]
    sources = [s for s in sources if s]
    if not sources:
        raise ValueError('La sélection ne contient aucune face à peindre.')
    side = math.ceil(math.sqrt(len(sources)))
    cell = max(1, resolution // side)
    for source in sources:
        if source['image']:
            cell = max(cell, *source['image'].size)
    size = max(resolution, cell * side)
    if size > 8192:
        raise ValueError('Préserver ces textures demanderait un atlas de ' + str(size) + ' px. Limite : 8192 px. Réduis la sélection ou la résolution des images source.')
    return sources, side, cell, size


def fill_tile(pixels, size, cell, x, y, source):
    image = source['image']
    if image:
        copy = bpy.data.images.new('Texture3D copie temporaire', width=image.size[0], height=image.size[1], alpha=True)
        try:
            original = array('f', [0]) * len(image.pixels)
            image.pixels.foreach_get(original)
            copy.pixels.foreach_set(original)
            copy.scale(cell, cell)
            tile = array('f', [0]) * (cell * cell * 4)
            copy.pixels.foreach_get(tile)
        finally:
            bpy.data.images.remove(copy)
    else:
        tile = array('f', source['color']) * (cell * cell)
    for row in range(cell):
        start = ((y * cell + row) * size + x * cell) * 4
        pixels[start:start + cell * 4] = tile[row * cell * 4:(row + 1) * cell * 4]


def update_material(obj, slot, image, uv_name, owner):
    original = obj.material_slots[slot].material if slot < len(obj.material_slots) else None
    reuse = original and original.get(OWNER) == owner and original.users == 1
    material = original if reuse else original.copy() if original else bpy.data.materials.new('Texture3D · ' + obj.name)
    material[OWNER] = owner
    material.use_nodes = True
    shader = shader_for(material)
    node = material.node_tree.nodes.get('Texture3D BaseColor')
    if node is None or node.type != 'TEX_IMAGE' or node.get(OWNER) != owner:
        node = material.node_tree.nodes.new('ShaderNodeTexImage')
        node.name = 'Texture3D BaseColor'
        node[OWNER] = owner
    coords = material.node_tree.nodes.get('Texture3D UV')
    if coords is None or coords.type != 'UVMAP' or coords.get(OWNER) != owner:
        coords = material.node_tree.nodes.new('ShaderNodeUVMap')
        coords.name = 'Texture3D UV'
        coords[OWNER] = owner
    node.image = image
    coords.uv_map = uv_name
    material.node_tree.links.new(coords.outputs['UV'], node.inputs['Vector'])
    material.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
    if slot >= len(obj.material_slots):
        obj.data.materials.append(material)
    else:
        obj.material_slots[slot].material = material
    return material
