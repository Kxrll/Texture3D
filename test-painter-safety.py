"""Pure safety contracts. No installed app or user project accessed."""
import importlib.util
from pathlib import Path
import tempfile
from types import SimpleNamespace as NS
import unittest
import struct,zlib
ROOT=Path(__file__).parent/'painter_plugin/texture3d_painter'
def load(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/(name+'.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
images=load('image_checks');managed=load('managed_layer');associations=load('associations')
def png():
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',2,1,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b'\0'+b'\xff'*8))+chunk(b'IEND',b'')
class Safety(unittest.TestCase):
    def test_png_integrity(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'test.png';p.write_bytes(png());meta=images.inspect_png(p,(2,1),8)
            self.assertEqual(meta['colorType'],6)
            for bad in [png()[:-1],png()+b'junk',png().replace(b'IDAT',b'BAD!')]:
                p.write_bytes(bad)
                with self.assertRaises(ValueError):images.inspect_png(p)
            p.write_bytes(png())
            with self.assertRaises(ValueError):images.inspect_png(p,(4,1))
            with self.assertRaises(ValueError):images.inspect_png(p,expected_sha='wrong')
    def test_mesh_fingerprint(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'a.obj';p.write_text('v 1 0 0\nvt 0 1\nf 1/1 1/1 1/1\n')
            first=associations.mesh_signature(p)
            p.write_text('# date ignored\nv 1.0 0 0\nvt 0 1\nf 1/1 1/1 1/1\n');self.assertEqual(first,associations.mesh_signature(p))
            p.write_text('v 2 0 0\nvt 0 1\nf 1/1 1/1 1/1\n');self.assertNotEqual(first,associations.mesh_signature(p))
    def test_owned_layer_renamed_moved_or_missing(self):
        layer=NS(uid=lambda:7)
        group=NS(uid=lambda:8,sub_layers=lambda:[layer])
        stack=NS(has_channel=lambda c:True)
        api=NS(textureset=NS(ChannelType=NS(BaseColor='bc'),all_texture_sets=lambda:[NS(all_stacks=lambda:[stack])]),layerstack=NS(get_root_layer_nodes=lambda s:[group],insert_fill=lambda p:(_ for _ in ()).throw(AssertionError('must not create'))))
        state={'baseColorLayers':{'owned':7}}
        managed.ensure_base_color(api,state,None,lambda m,s:'owned',lambda:None)
        api.layerstack.get_root_layer_nodes=lambda s:[]
        with self.assertRaises(ValueError):managed.ensure_base_color(api,state,None,lambda m,s:'owned',lambda:None)
if __name__=='__main__':unittest.main()
