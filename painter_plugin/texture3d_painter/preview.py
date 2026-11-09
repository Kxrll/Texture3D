"""Build a self-contained GLB from Painter's triangulated OBJ, one material."""
import json
import math
import struct
from pathlib import Path


def from_obj(filename, material_name, single_material=False):
    positions, uvs, faces, names = [], [], [], set()
    material = None
    for raw in Path(filename).read_text(encoding='utf-8-sig').splitlines():
        line = raw.split('#', 1)[0].strip()
        fields = line.split()
        if not fields:
            continue
        if fields[0] == 'v': positions.append(tuple(map(float, fields[1:4])))
        elif fields[0] == 'vt': uvs.append(tuple(map(float, fields[1:3])))
        elif fields[0] == 'usemtl': material = line[7:].strip()
        elif fields[0] == 'f':
            names.add(material)
            corners = []
            for token in fields[1:]:
                components = token.split('/')
                if len(components) < 2 or not components[1]: raise ValueError('UV manquants dans le modèle du viewer.')
                vertex, uv = int(components[0]), int(components[1])
                if not vertex or not uv: raise ValueError('Indices OBJ invalides.')
                vi = vertex-1 if vertex > 0 else len(positions)+vertex
                ti = uv-1 if uv > 0 else len(uvs)+uv
                if not 0 <= vi < len(positions) or not 0 <= ti < len(uvs): raise ValueError('Indices OBJ hors limites.')
                corners.append((vi, ti))
            faces.append((material, corners))
    selected = material_name
    if selected is not None and selected not in names:
        if single_material and len(names) == 1: selected = next(iter(names))
        else: raise ValueError('Matériau introuvable pour le viewer : ' + material_name)
    vertices, coordinates, indices, lookup = [], [], [], {}
    for name, corners in faces:
        if selected is not None and name != selected: continue
        if len(corners) != 3: raise ValueError('Le maillage du viewer doit être triangulé par Painter.')
        for key in corners:
            if key not in lookup:
                lookup[key] = len(vertices)
                vertices.append(positions[key[0]])
                coordinates.append(uvs[key[1]])
            indices.append(lookup[key])
    if not vertices or any(not math.isfinite(n) for v in vertices+coordinates for n in v): raise ValueError('Modèle du viewer vide ou invalide.')
    position_data = b''.join(struct.pack('<3f', *v) for v in vertices)
    uv_data = b''.join(struct.pack('<2f', *v) for v in coordinates)
    index_data = b''.join(struct.pack('<I', i) for i in indices)
    binary = position_data+uv_data+index_data
    gltf = {'asset':{'version':'2.0','generator':'Texture3D Painter'},'scene':0,'scenes':[{'nodes':[0]}],
        'nodes':[{'mesh':0,'name':material_name or 'Modèle complet'}], 'meshes':[{'primitives':[{'attributes':{'POSITION':0,'TEXCOORD_0':1},'indices':2}]}],
        'buffers':[{'byteLength':len(binary)}],
        'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':len(position_data),'target':34962},
                       {'buffer':0,'byteOffset':len(position_data),'byteLength':len(uv_data),'target':34962},
                       {'buffer':0,'byteOffset':len(position_data)+len(uv_data),'byteLength':len(index_data),'target':34963}],
        'accessors':[{'bufferView':0,'componentType':5126,'count':len(vertices),'type':'VEC3',
                      'min':[min(v[i] for v in vertices) for i in range(3)],'max':[max(v[i] for v in vertices) for i in range(3)]},
                     {'bufferView':1,'componentType':5126,'count':len(vertices),'type':'VEC2'},
                     {'bufferView':2,'componentType':5125,'count':len(indices),'type':'SCALAR'}]}
    document = json.dumps(gltf,separators=(',',':')).encode('utf-8')
    document += b' ' * (-len(document)%4)
    result = struct.pack('<4sII',b'glTF',2,28+len(document)+len(binary))+struct.pack('<I4s',len(document),b'JSON')+document+struct.pack('<I4s',len(binary),b'BIN\0')+binary
    if len(result)>25*1024*1024: raise ValueError('Le modèle du viewer dépasse 25 Mo.')
    return list(result)
