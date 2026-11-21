"""Bounded PNG container validation without changing pixel data."""
import hashlib
import struct
import zlib
from pathlib import Path


def inspect_png(filename, expected_size=None, expected_depth=None, expected_sha=None):
    path = Path(filename)
    if not path.is_file() or not 45 <= path.stat().st_size <= 128*1024*1024:
        raise ValueError('PNG absent ou taille de fichier non prise en charge.')
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        signature = stream.read(8);digest.update(signature)
        if signature != b'\x89PNG\r\n\x1a\n': raise ValueError('Signature PNG invalide.')
        header = None;ended = False;data_seen = False
        while not ended:
            prefix = stream.read(8)
            if len(prefix) != 8: raise ValueError('PNG tronqué.')
            length,kind = struct.unpack('>I4s',prefix)
            if length > 128*1024*1024: raise ValueError('Chunk PNG trop volumineux.')
            data = stream.read(length);crc_bytes = stream.read(4)
            if len(data) != length or len(crc_bytes) != 4: raise ValueError('PNG incomplet.')
            digest.update(prefix);digest.update(data);digest.update(crc_bytes)
            if zlib.crc32(kind+data)&0xffffffff != struct.unpack('>I',crc_bytes)[0]: raise ValueError('CRC PNG invalide.')
            if header is None:
                if kind != b'IHDR' or length != 13: raise ValueError('En-tête PNG invalide.')
                width,height,depth,color,compression,filter_method,interlace=struct.unpack('>IIBBBBB',data)
                if not 1<=width<=8192 or not 1<=height<=8192 or depth not in (8,16) or color not in (0,2,4,6) or compression or filter_method or interlace not in (0,1):
                    raise ValueError('Format PNG ou dimensions non pris en charge.')
                header={'width':width,'height':height,'bitDepth':depth,'colorType':color}
            elif kind==b'IHDR': raise ValueError('En-tête PNG dupliqué.')
            if kind==b'IDAT': data_seen=True
            if kind==b'IEND':
                if length or not data_seen or stream.read(1): raise ValueError('Fin PNG invalide.')
                ended=True
    if expected_size and (header['width'],header['height']) != tuple(expected_size): raise ValueError('Dimensions PNG incompatibles.')
    if expected_depth and header['bitDepth']!=expected_depth: raise ValueError('Profondeur PNG incompatible.')
    header['sha256']=digest.hexdigest()
    if expected_sha and header['sha256']!=expected_sha: raise ValueError('Empreinte PNG incompatible.')
    return header
