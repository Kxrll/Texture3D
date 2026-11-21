"""Pure association identities; no mutation of Painter projects."""
import hashlib
from pathlib import Path


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()[:32]


def set_id(project, original_name):
    return digest(str(Path(project).resolve()) + '\0material\0' + original_name)


def identity(project, names, signature, original_name=None, channel="BaseColor", stack_name=""):
    scope = 'common\0' + '\0'.join(sorted(names)) if original_name is None else 'set\0' + original_name
    if channel != 'BaseColor': scope += '\0channel\0' + channel
    if stack_name: scope += '\0stack\0' + stack_name
    return digest(str(Path(project).resolve()) + '\0' + scope + '\0' + signature)


def original_name(material):
    value = material.original_name
    return value() if callable(value) else value


def mesh_signature(filename):
    """Fingerprint OBJ geometry, UVs, topology and material boundaries, ignoring comments."""
    lines=[]
    for raw in Path(filename).read_text(encoding='utf-8-sig').splitlines():
        fields=raw.split('#',1)[0].split()
        if not fields: continue
        if fields[0] in ('v','vt','vn'):
            fields=[fields[0]]+[format(float(v),'.12g') for v in fields[1:]]
        if fields[0] in ('v','vt','f','usemtl','o','g'):
            lines.append(' '.join(fields))
    return hashlib.sha256('\n'.join(lines).encode('utf-8')).hexdigest()
