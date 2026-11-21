"""Export contract tests; Adobe API simulated, native validation separate."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace as NS
import tempfile
import struct
import unittest
spec=importlib.util.spec_from_file_location('texture_export',Path(__file__).parent/'painter_plugin/texture3d_painter/texture_export.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ExportTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.calls=[];self.support={'BaseColor','Emissive'}
        stack=NS(name=lambda:'',has_channel=lambda c:c in self.support)
        material=NS(name=lambda:'Body',has_uv_tiles=lambda:False,all_stacks=lambda:[stack],get_resolution=lambda:NS(width=2048,height=2048))
        def export(config):
            self.calls.append(config)
            image=Path(config['exportPath'])/'texture.png'
            bits=int(config['exportPresets'][0]['maps'][0]['parameters']['bitDepth'])
            image.write_bytes(b'\x89PNG\r\n\x1a\n'+struct.pack('>I',13)+b'IHDR'+struct.pack('>II',2048,2048)+bytes([bits,2,0,0,0])+b'1234')
            return NS(status='success',textures={('Body',''):[str(image)]})
        self.api=NS(project=NS(is_open=lambda:True),resource=NS(ResourceID=NS(from_project=lambda **kw:NS(context='owned'))),textureset=NS(all_texture_sets=lambda:[material],ChannelType=NS(**{n:n for n in {**module.CHANNELS,**module.ADVANCED}})),export=NS(export_project_textures=export,ExportStatus=NS(Success='success')))
    def test_fresh_export_each_request(self):
        a=module.export_channel(self.api,self.temp.name,'owned','Body','','BaseColor')
        b=module.export_channel(self.api,self.temp.name,'owned','Body','','Emissive')
        self.assertNotEqual(a['file'],b['file']);self.assertEqual(len(self.calls),2)
        self.assertEqual(a['bitDepth'],16)
        self.assertEqual(self.calls[1]['exportPresets'][0]['maps'][0]['channels'][0]['srcMapName'],'emissive')
    def test_wrong_project_or_missing_channel_never_exports(self):
        for context,channel in [('foreign','BaseColor'),('owned','Metallic')]:
            with self.assertRaises(ValueError):module.export_channel(self.api,self.temp.name,context,'Body','',channel)
        self.assertEqual(self.calls,[])
    def test_advanced_maps_explicit_only(self):
        self.support.update(module.ADVANCED)
        for channel in module.ADVANCED:
            with self.assertRaises(ValueError):module.export_channel(self.api,self.temp.name,'owned','Body','',channel)
            result=module.export_channel(self.api,self.temp.name,'owned','Body','',channel,16,experimental=True)
            self.assertTrue(result['experimental'])
        self.assertEqual(self.calls[-1]['exportPresets'][0]['maps'][0]['channels'][0]['srcMapName'],'opacity')
        with self.assertRaises(ValueError):module.export_channel(self.api,self.temp.name,'owned','Body','','Height',8,experimental=True)

    def test_unexpected_export_path_rejected(self):
        self.api.export.export_project_textures=lambda config:NS(status='success',textures={('Body',''):['C:/outside.png']})
        with self.assertRaises(ValueError):module.export_channel(self.api,self.temp.name,'owned','Body','','BaseColor')
if __name__=='__main__':unittest.main()
