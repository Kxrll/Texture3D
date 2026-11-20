"""Pure association identities; no mutation of Painter projects."""
import hashlib
from pathlib import Path


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()[:32]


def set_id(project, original_name):
    return digest(str(Path(project).resolve()) + '\0material\0' + original_name)


def identity(project, names, signature, original_name=None, channel="BaseColor"):
    scope = 'common\0' + '\0'.join(sorted(names)) if original_name is None else 'set\0' + original_name
    if channel != 'BaseColor': scope += '\0channel\0' + channel
    return digest(str(Path(project).resolve()) + '\0' + scope + '\0' + signature)


def original_name(material):
    value = material.original_name
    return value() if callable(value) else value
