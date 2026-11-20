"""Isolated contract tests: no Adobe application or artistic project is modified."""
import importlib.util
from pathlib import Path
import tempfile
from types import SimpleNamespace as NS
import unittest
spec=importlib.util.spec_from_file_location('resources',Path(__file__).parent/'painter_plugin/texture3d_painter/resources.py')
resources=importlib.util.module_from_spec(spec);spec.loader.exec_module(resources)
class ID:
    def __init__(self,version): self.name='Texture3D_test';self.version=version
    def url(self): return 'resource://project/Texture3D_test?version='+str(self.version)
class Resource:
    def __init__(self,rid): self.rid=rid
    def identifier(self): return self.rid
    def show_in_ui(self): pass
class Protection(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.folder=Path(self.temp.name);self.project=self.folder/'test.spp';self.ledger=self.folder/'ownership.json'
        self.existing=[];self.used=[];self.imports=0;self.replacements=[]
        def import_resource(*args,**kwargs):
            self.assertTrue(Path(args[0]).is_file());self.assertEqual(Path(args[0]).parent.name,'resource-assets')
            self.imports+=1;r=Resource(ID(self.imports));self.existing.insert(0,r);return r
        def replace(mapping):
            self.replacements.append(mapping);self.used=[mapping.get(i,i) for i in self.used];return NS(status='ok')
        self.api=NS(project=NS(is_open=lambda:True,file_path=lambda:str(self.project)),textureset=NS(all_texture_sets=lambda:[NS(name=lambda:'Body')]),resource=NS(ResourceID=NS(from_project=lambda **kwargs:None),Resource=NS(retrieve=lambda _:self.existing),list_project_resources=lambda:self.used,import_project_resource=import_resource,replace_project_resources=replace,Usage=NS(TEXTURE='texture'),UpdateProjectStatus=NS(SUCCESS='ok')))
        image=self.folder/'input.png';image.write_bytes(b'test-image')
        self.job={'image':str(image),'textureSet':'Body','projectID':'test','resourceName':'Texture3D_test'}
    def send(self):return resources.import_paint(self.api,self.job,str(self.project),self.ledger)
    def test_owned_versions_and_restart(self):
        self.assertFalse(self.send());first=self.existing[0].identifier();self.used=[first]
        self.assertTrue(self.send());self.assertEqual(list(self.replacements[0]),[first])
        self.assertTrue(self.send());self.assertEqual(self.imports,3)
    def test_durable_source_survives_transport_cleanup(self):
        self.send()
        original=Path(self.job['image']);original.unlink()
        assets=list((self.ledger.parent/'resource-assets').glob('*.png'))
        self.assertEqual(len(assets),1)
        self.assertEqual(assets[0].read_bytes(),b'test-image')

    def test_unused_foreign_collision(self):
        self.existing=[Resource(ID('foreign'))]
        with self.assertRaises(ValueError):self.send()
        self.assertEqual(self.imports,0);self.assertFalse(self.replacements)
    def test_foreign_collision_after_association(self):
        self.send();self.existing.append(Resource(ID('foreign')))
        with self.assertRaises(ValueError):self.send()
        self.assertEqual(self.imports,1)
    def test_wrong_project_and_lost_resource(self):
        self.send();self.existing=[]
        with self.assertRaises(ValueError):self.send()
        self.api.project.file_path=lambda:str(self.folder/'other.spp')
        with self.assertRaises(ValueError):self.send()
        self.assertEqual(self.imports,1)
if __name__=='__main__':unittest.main()
